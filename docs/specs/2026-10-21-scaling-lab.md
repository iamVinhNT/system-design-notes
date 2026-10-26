# Spec: Lab 01 Scaling — hạ tầng thật bằng Docker Compose
Status: approved    Owner: Lead (Claude)    Approved by: user, 2026-10-21

## Problem

`01. Scaling/lab` hiện chỉ là bài tập giấy. Người học không tự tay thấy nút thắt, không đo được
tác dụng của từng tầng (load balancer, cache, replica, CDN). Các lab 04–09 đã có code chạy được;
lab 01 cần thực hành ở mức sát thực tế nhất.

## Outcomes

Người học chạy một app "chia sẻ bài viết" qua nhiều nấc (stage). Mỗi stage là một topology Docker
Compose thật. Ở mỗi stage người học: chạy load test, đọc số đo, thấy nút thắt, rồi chuyển stage tiếp
theo và so sánh. Các hành vi khó (replication lag, mất cache, chết một instance, session lệch
instance) tái hiện được bằng lệnh có sẵn, không bằng mô phỏng trong code.

## Non-goals

- Không dùng cloud thật, Kubernetes, Terraform.
- Không làm autoscaling tự động, multi-data-center, message queue (chương Scaling còn các phần này; để bài nâng cấp).
- Không sharding chạy thật (stage 6 chỉ là bài giấy trong README).
- Không tối ưu hiệu năng tuyệt đối của app; app đủ đơn giản để nút thắt nằm ở hạ tầng.
- Không sửa nội dung các lab khác.

## Constraints

- Chạy được trên một máy Linux có Docker + `docker compose` v2 (đã có: Docker 29.1.3, Compose 2.40.3; 22 CPU, 30 GB RAM).
- Nút thắt phải tái hiện được: giới hạn tài nguyên bằng `cpus`/`mem_limit` trong compose, không phụ thuộc máy mạnh hay yếu.
- Ưu tiên image đã có sẵn trên máy: `postgres:13-alpine`, `redis:6.2-alpine`, `nginx:1.27-alpine`. Image Node cần pull.
- App: Node.js + Express (đồng nhất với lab 04–09). Không thêm dependency nặng; mỗi dependency phải có lý do.
- Ghi chú/README viết tiếng Việt, theo format lab hiện có (Mục tiêu, Đề bài, Yêu cầu, Kết quả cần nộp, Tiêu chí tự đánh giá, Bài nâng cấp).
- Không lưu secret thật; mật khẩu DB trong compose chỉ là giá trị lab, ghi rõ.

## Topology theo stage

| Stage | Tín hiệu kích hoạt | Topology |
|---|---|---|
| 0 | Baseline | 1 app (giới hạn 0.5 CPU) + 1 Postgres. Session trong RAM của app |
| 1 | CPU app bão hòa, p95 tăng | nginx LB + 3 app (round-robin) + Postgres. Cố ý để session trong RAM → lỗi login lệch instance |
| 2 | Lỗi session khi đổi instance | Session ra Redis → app stateless |
| 3 | DB đọc nhiều, p95 đọc cao | Cache-aside bằng Redis (TTL + invalidate khi ghi) |
| 4 | Một DB gánh cả đọc lẫn ghi | Postgres primary + 1 streaming replica thật; đọc → replica, ghi → primary |
| 5 | Trang đọc phổ biến lặp lại | nginx `proxy_cache` đóng vai CDN/edge, header `Cache-Control`/`X-Cache` |

## Commands

```bash
cd "01. Scaling/lab"
npm install
npm test                          # test đơn vị/tích hợp không cần Docker
./lab.sh up <0-5>                 # dựng topology của stage
./lab.sh down                     # dừng và xóa volume
./lab.sh load <read|write|mixed>  # chạy load test, in bảng RPS / p50 / p95 / p99 / lỗi
./lab.sh chaos <kill-app|flush-cache|replica-lag|stop-replica>
./lab.sh smoke <0-5>              # kiểm tra stage chạy đúng (dùng cho AC)
```

## Touch points

- `01. Scaling/lab/README.md` (viết lại thành lab hands-on), `design.md` (cập nhật theo stage).
- `01. Scaling/lab/app/` — app Express: `server.js`, `posts.js` (truy cập DB), `cache.js`, `session.js`, `metrics.js`.
- `01. Scaling/lab/compose.yml` (một file, service tùy chọn bật bằng profile), `stages/N.env` (cấu hình từng stage), `nginx/*.conf`, `postgres/` (script khởi tạo primary, replica), `Dockerfile`.
- `01. Scaling/lab/loadtest/` — script load (Node, dùng `autocannon`) và dữ liệu seed.
- `01. Scaling/lab/lab.sh`, `app/test/*.test.js`.
- `.gitignore`: bảo đảm `node_modules` không bị commit.

## Code style

Theo `08. URL Shortener/lab/app/server.js`: CommonJS, hàm `createApp({...deps})` nhận phụ thuộc để test được, comment chỉ giải thích lý do.

```js
function createApp({ posts, cache, sessions } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));
  return app;
}
```

## Testing strategy

- `npm test` (`node --test`): logic cache-aside (hit/miss/invalidate), session store, chọn primary/replica, validation. Dùng fake in-memory, không cần Docker.
- `./lab.sh smoke N`: test tích hợp trên Compose thật, mỗi stage một kịch bản kiểm chứng (xem AC).
- Load test chỉ để học, không có ngưỡng pass/fail về RPS tuyệt đối. Kiểm tra theo **tương quan** (stage sau tốt hơn stage trước với cùng workload) và theo hành vi, vì số tuyệt đối phụ thuộc máy.

## Boundaries

- Always: tên project Compose cố định (`scaling-lab`); `lab.sh down` dọn sạch container, network, volume của lab; mọi stage chạy được độc lập.
- Ask first: thêm dependency npm ngoài express/pg/ioredis/autocannon; thêm Prometheus/Grafana; sửa file ngoài `01. Scaling/`.
- Never: publish port ngoài `127.0.0.1`; chạm container/volume không thuộc project `scaling-lab`; commit, push hay pull image khi chưa được phép; hardcode đường dẫn tuyệt đối.

## Acceptance criteria

- AC1: Mỗi stage 0–5 dựng được bằng `./lab.sh up N` trên máy sạch và tới trạng thái healthy trong ≤ 120 s — verify: `./lab.sh smoke N` thoát mã 0 cho cả 6 stage.
- AC2: Chức năng cốt lõi hoạt động ở mọi stage: tạo bài (`POST /api/posts`), đọc danh sách và đọc một bài (`GET /api/posts`, `GET /api/posts/:id`), đăng nhập (`POST /api/login`, `GET /api/me`) — verify: smoke test của từng stage.
- AC3: Stage 0 có nút thắt tái hiện được: với workload `read` cố định, app đạt CPU limit và p95 vượt ngưỡng ghi trong README — verify: `./lab.sh load read` ở stage 0, in kèm `docker stats`.
- AC4: Stage 1 chứng minh được rủi ro stateful: login trên instance A rồi gọi `/api/me` qua LB trả 401 ít nhất một lần trong 20 lần gọi; RPS đọc cao hơn stage 0 với cùng workload — verify: smoke 1 + `lab.sh load`.
- AC5: Stage 2 sửa lỗi session: 20/20 lần `/api/me` sau login thành công qua LB, và vẫn thành công sau `chaos kill-app` — verify: smoke 2.
- AC6: Stage 3 có cache-aside: lần đọc thứ hai của cùng bài là cache hit (có `X-App-Cache: HIT`, không truy vấn DB); sau `POST` sửa/tạo bài, đọc lại không trả dữ liệu cũ quá TTL đã công bố; `chaos flush-cache` không làm hệ thống lỗi, chỉ chậm hơn — verify: smoke 3 + metric cache hit ratio trong `GET /metrics`.
- AC7: Stage 3 khi Redis dừng hẳn, app vẫn phục vụ đọc từ DB (degrade, không 5xx hàng loạt) — verify: smoke 3 dừng container Redis, đọc vẫn 200.
- AC8: Stage 4 dùng streaming replication thật: ghi vào primary xuất hiện trên replica; `chaos replica-lag` (tạm dừng replay WAL) làm "đọc sau ghi" trả dữ liệu cũ và điều này quan sát được; `stop-replica` khiến đọc tự fallback về primary — verify: smoke 4 (kiểm tra `pg_stat_replication`, `pg_is_in_recovery()`, và nội dung trả về).
- AC9: Stage 4 có chính sách read-your-writes được ghi lại và kiểm chứng (ví dụ: sau khi ghi, người dùng đó đọc từ primary trong N giây) — verify: smoke 4.
- AC10: Stage 5 có edge cache: lần đọc công khai thứ hai trả `X-Edge-Cache: HIT` từ nginx, request không tới app; request có session không bị cache chung — verify: smoke 5 (kiểm tra header và bộ đếm request của app).
- AC11: App xuất `GET /metrics` (JSON hoặc Prometheus text) với ít nhất: số request, latency p50/p95/p99, cache hit/miss, instance id; `lab.sh load` in bảng tổng hợp so sánh được giữa các stage — verify: chạy load ở 2 stage, bảng có đủ cột.
- AC12: `npm test` pass, không cần Docker — verify: `npm test`.
- AC13: `lab.sh down` xóa sạch tài nguyên của lab — verify: sau `down`, `docker ps -a --filter label=com.docker.compose.project=scaling-lab` rỗng và `docker volume ls` không còn volume của project.
- AC14: Mọi port chỉ bind `127.0.0.1` — verify: `docker compose -p scaling-lab ps --format json` hoặc `ss -ltn` không có `0.0.0.0` của lab.
- AC15: README mới theo format lab hiện có, mô tả từng stage (tín hiệu → thay đổi → kết quả mong đợi → failure mode), cách chạy, bảng số liệu cần ghi lại, bài nâng cấp (autoscale, sharding giấy) — verify: đọc đối chiếu bảng stage; `design.md` khớp topology.
- AC16: Không file nào ngoài `01. Scaling/` và `docs/` bị sửa (trừ `.gitignore` nếu cần) — verify: `git status` / `git diff --stat`.

## Open questions

1. **Pull image Node** (ví dụ `node:24-alpine`, vài chục MB) và `npm install` có được phép không? Mặc định: có, chỉ pull node image; chặn: dựng app container. Chưa pull gì trước khi bạn duyệt.
2. **Load tool**: mặc định dùng `autocannon` (npm, chạy trong container Node) thay vì cài k6/wrk lên máy. Chặn: `lab.sh load`.
3. **Postgres version**: mặc định dùng `postgres:13-alpine` có sẵn để khỏi pull (vẫn hỗ trợ streaming replication). Chặn: stage 4.
4. **Giám sát**: mặc định chỉ `/metrics` + bảng in từ `lab.sh load`, chưa thêm Prometheus/Grafana. Muốn dashboard thật thì thêm làm stage 6 tùy chọn. Chặn: không chặn gì ở MVP.
5. **CDN**: mặc định nginx `proxy_cache` làm edge giả. Không có CDN thật vì không dùng cloud.
6. **Chaos**: mặc định chỉ chạy lệnh Docker trên container của project `scaling-lab`, không tác động nơi khác.

## Decisions

- 2026-10-21 — Chọn hạ tầng Docker Compose thật thay vì mô phỏng Node thuần — người dùng muốn lab giống thực tế nhất.
- 2026-10-21 — User duyệt spec và 4 điểm mở (pull image Node, autocannon trong container, chỉ `/metrics`, `postgres:13-alpine`) — trả lời "Duyệt hết".
- 2026-10-21 — Dùng một `compose.yml` + profiles + `stages/N.env` thay vì `base.yml` + `stageN.yml` chồng lớp — Compose không gỡ được mục list (ports/volumes) khi merge; một file cho thấy toàn topology, mỗi stage chỉ là một file env nhỏ. Chỉ đổi Touch points, không đổi AC.
- 2026-10-21 — Header tầng app cache là `X-App-Cache`, tầng edge nginx là `X-Edge-Cache` (thay cho `X-Cache` chung ở AC6/AC10) — hai tầng cache cùng tồn tại ở stage 5 nên cần tên riêng để phân biệt. Chỉ đổi tên header trong AC6, AC10.
- 2026-10-21 — Smoke test viết bằng Node chạy trên host (gọi `./lab.sh chaos` khi cần); load test chạy trong container `loadgen` — smoke cần lệnh Docker, load test cần ít nhiễu từ host.
