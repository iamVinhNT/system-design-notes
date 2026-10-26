#!/usr/bin/env bash
# Driver for the scaling lab. Usage: ./lab.sh help
set -euo pipefail
cd "$(dirname "$0")"

PROJECT=scaling-lab
export COMPOSE_BAKE=false
STAGE_FILE=.lab-stage
RESULTS_FILE=results.jsonl

usage() {
  cat <<'USAGE'
Usage: ./lab.sh <command>

  up <0-5>                      start a stage (rebuilds images, waits until healthy)
  down                          stop everything and delete containers, networks and volumes
  status                        show running services and the current stage
  load <read|read-cold|write|mixed> [connections] [seconds]
                                run a load test against the current stage and record the result
  report                        compare recorded results across stages
  metrics [reset]               print (or reset) /metrics of every running app instance
  stats                         CPU and memory of every container (watch the bottleneck while a load test runs)
  smoke <0-5|all>               start the stage and verify its behavior (exit 0 = pass)
  chaos <action>                inject a failure:
      kill-app [app2]           stop one app instance (stage 1+)
      start-app [app2]          bring it back
      flush-cache               delete cache entries only (sessions stay)
      flush-redis               delete everything in Redis, sessions included
      stop-redis | start-redis
      replica-lag on|off        pause / resume WAL replay on the replica (stage 4+)
      stop-replica | start-replica
USAGE
}

compose() { docker compose -p "$PROJECT" "$@"; }

load_stage_env() {
  local stage="$1"
  [[ "$stage" =~ ^[0-5]$ ]] || { echo "stage must be 0-5" >&2; exit 2; }
  # Forget variables left by a previously loaded stage (`smoke all` loads several in one process).
  unset $(grep -hoE '^[A-Z_]+' stages/*.env | sort -u)
  set -a
  # shellcheck disable=SC1090
  . "stages/$stage.env"
  set +a
}

current_stage() {
  [[ -f "$STAGE_FILE" ]] || { echo "no stage is running: ./lab.sh up <0-5>" >&2; exit 1; }
  cat "$STAGE_FILE"
}

# Docker releases published ports a moment after `down` returns; starting too early fails with "port is already allocated".
wait_for_free_ports() {
  local port attempt
  for port in 8080 8081; do
    for attempt in $(seq 1 30); do
      (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null || break
      sleep 0.5
    done
  done
}

cmd_up() {
  local stage="${1:?stage required}"
  load_stage_env "$stage"
  # Switching stages: drop the previous topology and its data so every stage starts from the same seed.
  compose --profile '*' down -v --remove-orphans >/dev/null 2>&1 || true
  wait_for_free_ports
  local started=$SECONDS
  compose up -d --build --wait --wait-timeout 120
  echo "$stage" > "$STAGE_FILE"
  echo "stage $stage is up in $((SECONDS - started))s. Entry point: $ENTRY_URL"
}

cmd_down() {
  compose --profile '*' down -v --remove-orphans
  rm -f "$STAGE_FILE"
}

cmd_status() {
  [[ -f "$STAGE_FILE" ]] && echo "stage: $(cat "$STAGE_FILE")" || echo "stage: none"
  compose --profile '*' ps
}

cmd_load() {
  local workload="${1:?workload required: read|read-cold|write|mixed}" connections="${2:-64}" seconds="${3:-15}"
  local stage; stage="$(current_stage)"
  load_stage_env "$stage"
  compose --profile tools build loadgen >/dev/null
  compose --profile tools run --rm -T loadgen node loadtest/run.js \
    --target "$LOAD_TARGET" --workload "$workload" --connections "$connections" --duration "$seconds" --stage "$stage" \
    | tee -a "$RESULTS_FILE" >/dev/null
}

cmd_metrics() {
  local service action="${1:-show}"
  for service in $(compose ps --services --status running | grep '^app' | sort); do
    if [[ "$action" == reset ]]; then
      compose exec -T "$service" wget -qO- --post-data='' http://127.0.0.1:3000/metrics/reset >/dev/null
    else
      compose exec -T "$service" wget -qO- http://127.0.0.1:3000/metrics
      echo
    fi
  done
}

cmd_stats() {
  docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}' \
    $(docker ps --filter "label=com.docker.compose.project=$PROJECT" --format '{{.Names}}')
}

app_service() {
  local name="${1:-app2}"
  [[ "$name" =~ ^app[1-3]$ ]] || { echo "app name must be app1, app2 or app3" >&2; exit 2; }
  echo "$name"
}

cmd_chaos() {
  local action="${1:?chaos action required}"; shift || true
  case "$action" in
    kill-app) compose kill "$(app_service "${1:-}")" ;;
    start-app) compose start "$(app_service "${1:-}")" ;;
    flush-cache)
      compose exec -T redis sh -c "redis-cli --scan --pattern 'cache:*' | xargs -r redis-cli del" >/dev/null ;;
    flush-redis) compose exec -T redis redis-cli flushall >/dev/null ;;
    stop-redis) compose stop redis ;;
    start-redis) compose start redis ;;
    replica-lag)
      case "${1:-}" in
        on) compose exec -T replica psql -U lab -d lab -qtAc "select pg_wal_replay_pause()" >/dev/null ;;
        off) compose exec -T replica psql -U lab -d lab -qtAc "select pg_wal_replay_resume()" >/dev/null ;;
        *) echo "usage: chaos replica-lag on|off" >&2; exit 2 ;;
      esac ;;
    stop-replica) compose stop replica ;;
    start-replica) compose start replica ;;
    *) echo "unknown chaos action: $action" >&2; usage >&2; exit 2 ;;
  esac
}

cmd_smoke() {
  local target="${1:?stage required (0-5 or all)}"
  if [[ "$target" == all ]]; then
    local stage
    for stage in 0 1 2 3 4 5; do cmd_smoke "$stage"; done
    return
  fi
  cmd_up "$target"
  load_stage_env "$target"
  node smoke/smoke.js "$target"
}

main() {
  local command="${1:-help}"; shift || true
  case "$command" in
    up) cmd_up "$@" ;;
    down) cmd_down ;;
    status) cmd_status ;;
    load) cmd_load "$@" ;;
    report) node loadtest/report.js "$RESULTS_FILE" ;;
    metrics) cmd_metrics "$@" ;;
    stats) cmd_stats ;;
    chaos) cmd_chaos "$@" ;;
    smoke) cmd_smoke "$@" ;;
    help|-h|--help) usage ;;
    *) echo "unknown command: $command" >&2; usage >&2; exit 2 ;;
  esac
}

main "$@"
