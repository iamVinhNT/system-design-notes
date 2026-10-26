# LAB 01: Mở rộng hệ thống từ một server tới hàng triệu người dùng

## Mục tiêu

Thực hành nhận diện nút thắt và tiến hóa kiến trúc theo tải, dựa trên các giai đoạn trong chương Scaling. Lab dựng hạ tầng thật bằng Docker Compose (nginx, nhiều app instance, Redis, Postgres primary + replica), chạy load test và gây lỗi có chủ đích. Mỗi stage trả lời một câu hỏi: **đo gì, thấy nút thắt nào, thêm thành phần nào, lấy lại được gì và mất gì**.

## Đề bài

Một dịch vụ chia sẻ bài viết chạy trên một server duy nhất. Lượng truy cập tăng đều; người dùng đọc nhiều hơn viết. Bạn đi qua 6 stage (0–5). Ở mỗi stage: chạy load test, đọc số đo, chỉ ra nút thắt, rồi chuyển sang stage kế tiếp để kiểm chứng giả thuyết. Không thêm thành phần nào trước khi có bằng chứng cần nó.

## Yêu cầu

### Chức năng

- Đăng nhập (lab chỉ tạo session, không xác thực mật khẩu), đăng bài, sửa bài của chính mình, đọc một bài, đọc feed 20 bài mới nhất.
- Bài viết lưu bền vững trong Postgres. Feed và trang chi tiết có thể được cache.

### Phi chức năng

- Duy trì tính đúng đắn khi có nhiều instance ứng dụng (session, cache, đọc sau ghi).
- Giảm latency đọc và mở rộng từng tầng độc lập.
- Mô tả và quan sát được hành vi khi cache, replica hoặc một instance gặp lỗi.

## Ràng buộc và giả định

- Chạy local bằng Docker + `docker compose` v2 và Node.js 20+ (smoke test chạy trên host). Mọi port chỉ bind `127.0.0.1`.
- Mỗi app instance bị giới hạn 0,5 CPU, mỗi database 2 CPU. Giới hạn này làm nút thắt tái hiện được trên mọi máy; số tuyệt đối vẫn phụ thuộc máy bạn, nên **so sánh giữa các stage, đừng so với bảng mẫu**.
- Dữ liệu seed: 5.000 bài, 150.000 bình luận. Feed đếm bình luận từng bài nên mỗi lần đọc tốn công thật của database.
- Mật khẩu trong `compose.yml` là giá trị lab. Không dùng lại ngoài lab.

## Chạy lab

Từ thư mục `01. Scaling/lab/`:

```bash
npm install
npm test                   # test không cần Docker: cache-aside, session, chọn replica, API

./lab.sh up 0              # dựng stage 0 (lần đầu build image, vài chục giây)
./lab.sh load read         # tải đọc 64 kết nối trong 15 giây
./lab.sh stats             # CPU/RAM từng container (chạy lúc đang load để thấy nút thắt)
./lab.sh up 1              # chuyển stage, dữ liệu seed lại từ đầu
./lab.sh report            # bảng so sánh các lần chạy giữa các stage
./lab.sh down              # dọn container, network, volume

./lab.sh smoke all         # kiểm tra tự động hành vi của cả 6 stage
```

Lệnh khác: `./lab.sh load <read|read-cold|write|mixed|mixed-cold> [kết nối] [giây]`, `./lab.sh metrics [reset]`, `./lab.sh status`, `./lab.sh chaos <hành động>`.

| Workload | Nội dung |
|---|---|
| `read` | 70% đọc bài (id lệch về một số bài hot), 30% đọc feed |
| `read-cold` | như `read` nhưng gửi `Cache-Control: no-cache`: mô phỏng cache lạnh hoặc lưu lượng cache không hấp thụ được |
| `write` | đăng bài liên tục |
| `mixed` | 10% ghi, 90% đọc |
| `mixed-cold` | `mixed` với đọc không qua cache |

Bảng kết quả có RPS, p50/p95/p99, p95 riêng của request ghi, tỷ lệ lỗi, số instance nhận tải và tỷ lệ cache hit ở app và edge. Mỗi lần chạy cũng in phân bố `X-Instance`, `X-App-Cache`, `X-Edge-Cache`, `X-Db-Source`.

Gây lỗi (`./lab.sh chaos ...`):

| Lệnh | Tác dụng |
|---|---|
| `kill-app [app2]` / `start-app [app2]` | tắt / bật một app instance (stage 1+) |
| `flush-cache` | xóa các key cache, giữ session |
| `flush-redis` | xóa toàn bộ Redis, gồm session |
| `stop-redis` / `start-redis` | Redis chết / sống lại (Redis không lưu đĩa, bật lại là rỗng) |
| `replica-lag on` / `off` | tạm dừng / tiếp tục replay WAL trên replica (stage 4+) |
| `stop-replica` / `start-replica` | replica chết / sống lại |

API: `POST /api/login {"username"}`, `GET /api/me`, `GET /api/posts`, `GET /api/posts/:id`, `POST /api/posts {"title","body"}`, `PUT /api/posts/:id`, `GET /metrics`, `POST /metrics/reset`. Mỗi response có `X-Instance`; đọc thêm `X-App-Cache` (`HIT|MISS|BYPASS|ERROR|OFF`), `X-Db-Source` (`cache|primary|replica`), và ở stage 5 `X-Edge-Cache`.

## Các stage

Cấu hình mỗi stage nằm ở `stages/N.env`, topology ở `compose.yml` (service tùy chọn bật bằng profile). Mỗi stage gồm mọi thứ của stage trước.

| Stage | Tín hiệu để chuyển sang | Thay đổi | Quan sát được | Failure mode cần tự thử |
|---|---|---|---|---|
| 0 | — (baseline) | 1 app + 1 Postgres | app dùng hết quota CPU, p95 tăng | Một app chết là cả dịch vụ chết |
| 1 | CPU app bão hòa, DB còn dư | nginx + 3 app (round-robin, health check thụ động) | RPS tăng, nút thắt dời sang DB; `/api/me` trả 401 từng đợt vì session nằm trong RAM của từng process | `kill-app app2`: đọc vẫn 200, nginx bỏ instance chết |
| 2 | Lỗi 401 do session ở local | Session ra Redis, app stateless | `/api/me` luôn 200 trên mọi instance | `stop-redis`: login và `/api/me` trả 503 |
| 3 | DB tốn CPU cho truy vấn đọc lặp | Cache-aside trong Redis (TTL 30s, xóa khi ghi) | Hit ratio cao, RPS tăng mạnh, DB rảnh hơn | `stop-redis`: đọc vẫn 200 nhưng chậm (`X-App-Cache: ERROR`); `flush-cache`: cache lạnh, DB gánh lại |
| 4 | DB đơn gánh cả đọc lẫn ghi, đọc cold nhiều | Replica streaming; đọc vào replica, ghi vào primary; tác giả đọc từ primary 5 giây sau khi ghi | `X-Db-Source: replica`; primary rảnh cho ghi (write p95 giảm nhẹ khi đọc cold), RPS đọc gần như không đổi vì replica cùng cỡ primary | `replica-lag on`: người khác thấy 404 cho bài mới, tác giả thì không; `stop-replica`: tự đọc primary |
| 5 | Trang đọc công khai lặp lại | nginx `proxy_cache` 5 giây cho request ẩn danh | `X-Edge-Cache: HIT`, request không tới app | Request có session không bao giờ đọc/ghi cache chung |

Thứ tự trên cố ý lặp lại điều chương Scaling nhấn mạnh: thêm app instance không cứu được database; session phải ra khỏi process trước khi scale ngang; cache và replica đổi consistency lấy throughput.

### Kết quả mẫu

Máy tham chiếu: 22 CPU, 64 kết nối, 12 giây mỗi lần. Chỉ dùng để biết hình dạng, số của bạn sẽ khác.

| Stage | `read` RPS / p95 ms | `read-cold` RPS / p95 ms | `mixed` RPS / write p95 ms | `mixed` lỗi | `mixed-cold` RPS / write p95 ms |
|---|---|---|---|---|---|
| 0 | 1728 / 97.19 | 2194 / 88.75 | 2348 / 95.78 | 0.0% | 2283 / 91.78 |
| 1 | 3315 / 85.24 | 4056 / 73.31 | 4725 / 99.54 | 6.6% | 5082 / 97.1 |
| 2 | 3828 / 73.58 | 4679 / 68.09 | 4738 / 86.83 | 0.0% | 5337 / 72.25 |
| 3 | 5402 / 63.11 | 3909 / 78.28 | 6397 / 78.14 | 0.0% | 4846 / 87.96 |
| 4 | 5993 / 53.36 | 4187 / 72.99 | 6531 / 60.45 | 0.0% | 4686 / 76.58 |
| 5 | 14997 / 36.29 | 16974 / 41.7 | 12415 / 60.68 | 0.0% | 12247 / 54.25 |

Cách đọc bảng:

- Stage 0 → 1: RPS đọc gần gấp đôi chứ không gấp ba, vì DB bắt đầu thành nút thắt. Lỗi 6,6% ở `mixed` stage 1 là các lần ghi bị 401 do session nằm ở instance khác; stage 2 hết lỗi.
- Stage 3: cache nâng RPS đọc rõ rệt. `read-cold` cố ý không qua cache nên không được lợi; số có thể thấp hơn stage 2 do nhiễu và chi phí của lớp cache.
- Stage 4: replica cùng cỡ với primary nên RPS gần như không đổi so với stage 3. Lợi ích là cô lập: ghi không còn xếp hàng sau các truy vấn đọc nặng (write p95 giảm ở `mixed-cold`, nhưng chênh lệch nhỏ và có nhiễu giữa các lần chạy). Muốn tăng throughput đọc thật, cần thêm replica.
- Stage 5: edge cache bỏ qua `Cache-Control: no-cache` của client, nên `*-cold` ở stage này vẫn được edge phục vụ. Đó là lý do RPS vọt lên, không phải lỗi đo.

### Quyết định thiết kế cần chú ý

- **Session**: stage 1 cố ý giữ session trong RAM từng process để thấy lỗi thật. Stage 2 đưa vào Redis với TTL; mất Redis nghĩa là mất toàn bộ session (không bật persistence).
- **Cache-aside**: đọc key, miss thì đọc DB rồi `SET ... EX 30`; ghi xong thì xóa `post:<id>` và `posts:latest`. Các miss đồng thời trong một process dùng chung một truy vấn DB. Giữa các instance vẫn có thể có thundering herd khi key hết hạn.
- **Cache lỗi không làm đọc lỗi**: mọi lỗi Redis rơi về database. Độ trễ cache xóa bị mất chỉ bị chặn bởi TTL.
- **Đọc sau ghi (stage 4+)**: sau khi ghi, server gắn cookie `last_write` 5 giây; trong thời gian đó người dùng đọc từ primary và bỏ qua cache. Người khác vẫn có thể đọc dữ liệu cũ tới khi replica bắt kịp.
- **Replica lỗi**: một lần lỗi, app bỏ replica 5 giây rồi thử lại, không để mỗi request chờ timeout.
- **Edge cache**: chỉ response ẩn danh có `Cache-Control: public, max-age=5`; request có cookie `sid` hoặc `last_write` bypass cache, và response của họ là `no-store`. Hai tầng cache dùng header riêng (`X-App-Cache`, `X-Edge-Cache`) để không nhầm tầng nào trả lời.
- **`Cache-Control: no-cache` làm app bỏ qua cache** chỉ vì `ALLOW_CACHE_BYPASS=on` trong lab, để mô phỏng cache lạnh. Dịch vụ thật không nên cho client tùy ý khoét thẳng vào database.

Giới hạn: không có autoscaling, failover tự động của primary, đa data center hay message queue; login không có mật khẩu; Redis một node; replica và nginx không có dự phòng; sharding chỉ là bài giấy bên dưới.

## Bài tập thiết kế (làm trong khi chạy lab)

1. Với từng stage, ghi **tín hiệu bạn quan sát được** (số liệu từ `report`, `stats`, `metrics`) tách khỏi **giả định** (ví dụ "người dùng sẽ tăng").
2. Điền bảng: bottleneck, metric xác nhận, thay đổi, lợi ích, chi phí, failure mode.
3. Với stage 3, 4, 5, trả lời: dữ liệu cũ tối đa bao lâu và ở đâu? (TTL cache, replication lag, TTL edge, cookie `last_write`).
4. Giải thích vì sao stage 1 không tăng RPS gấp ba, và vì sao replica ở stage 4 gần như không tăng RPS đọc nhưng vẫn có giá trị (cô lập ghi khỏi đọc, tiền đề cho nhiều replica).
5. Chọn một stage phù hợp cho mỗi mức tải bạn giả định, giải thích vì sao chưa cần stage sau.

## Kết quả cần nộp

- Sơ đồ kiến trúc từng stage.
- Bảng bottleneck – metric – quyết định, kèm ảnh/chép kết quả `./lab.sh report`.
- Danh sách rủi ro và trade-off, gồm ít nhất một lần gây lỗi bằng `chaos` và hệ thống phản ứng thế nào.

## Bài nâng cấp

- Thêm giờ cao điểm tăng đột biến: tăng `--connections`, chỉ ra thành phần nào chạm giới hạn trước và giới hạn của autoscale (khởi động app, pool kết nối DB).
- So sánh đọc từ primary, replica và cache ngay sau khi cập nhật.
- Thêm replica thứ hai và chọn replica round-robin; đo lại stage 4.
- Sharding giấy: chọn shard key cho bảng `posts` và `comments`, nêu hot shard, truy vấn feed qua nhiều shard, kế hoạch resharding.
- Đặt `CACHE_TTL_SECONDS=1` hoặc `300` và đo đánh đổi giữa hit ratio và độ cũ.

## Tiêu chí tự đánh giá

- [ ] Tách được dấu hiệu quan sát khỏi giả định.
- [ ] Giải thích được vì sao thêm từng tầng và vấn đề tầng đó giải quyết.
- [ ] Nêu được ảnh hưởng của cache và replica tới freshness và consistency.
- [ ] Không nhầm scale ứng dụng với scale database.
- [ ] Có phương án fallback khi thành phần mới lỗi, và đã thử bằng `chaos`.
- [ ] Mỗi quyết định có metric hoặc giả định làm căn cứ.
- [ ] `./lab.sh smoke all` pass trên máy bạn.
