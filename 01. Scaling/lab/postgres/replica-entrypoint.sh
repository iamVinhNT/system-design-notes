#!/bin/sh
# First start: clone the primary with pg_basebackup (-R writes standby.signal and primary_conninfo).
# Later starts: the data directory already exists, so the replica just resumes streaming.
set -e
PGDATA="${PGDATA:-/var/lib/postgresql/data}"

if [ ! -s "$PGDATA/PG_VERSION" ]; then
  until pg_isready -h db -U "$POSTGRES_USER" >/dev/null 2>&1; do sleep 1; done
  mkdir -p "$PGDATA"
  chown postgres:postgres "$PGDATA"
  chmod 700 "$PGDATA"
  gosu postgres pg_basebackup \
    -d "host=db user=replicator password=$REPLICATION_PASSWORD" \
    -D "$PGDATA" -X stream -R -C -S replica1
fi

exec docker-entrypoint.sh postgres -c hot_standby=on -c max_connections=200
