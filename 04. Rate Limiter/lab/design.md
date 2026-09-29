# Phiếu thiết kế — LAB 04: Rate Limiter

## Scope và policy

- Route / API cần giới hạn: `GET /api/users/:id` dùng quota mặc định 60 request/client/phút; `POST /api/login` dùng quota riêng 5 request/client/phút. Quota login là giả định MVP để minh họa policy riêng, cần chỉnh theo threat model và UX thật.
- Định danh client và trust boundary: ưu tiên user ID đã xác thực; với request chưa xác thực dùng IP do socket nhìn thấy. Chỉ dùng `X-Forwarded-For` khi app chỉ nhận traffic qua proxy tin cậy đã cấu hình đúng; không cho client tự chọn identity bằng header tùy ý. IP có thể gom nhiều user sau NAT hoặc bị thay đổi qua proxy/VPN.
- Quota, window, burst: profile mặc định 60 request / 60 giây; login 5 request / 60 giây. MVP dùng fixed window, cho phép burst quota đầu window; giới hạn tính độc lập theo `(policy, client_id)`.
- Hành vi khi store lỗi: MVP in-process không có store ngoài; nếu sau này dùng shared store, policy bảo vệ login chọn fail-closed (503 khi limiter store lỗi), endpoint đọc chọn fail-open có cảnh báo để tránh outage phụ thuộc limiter. Lựa chọn cần theo threat model.

## API contract

| Route / method | Request | Response thành công | Response bị giới hạn |
| --- | --- | --- | --- |
| `GET /api/users/:id` | Bearer/session auth hoặc IP fallback | API response bình thường; `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` | HTTP 429, JSON error; `Retry-After` giây tới reset window |
| `POST /api/login` | Credentials; identity theo trusted client IP trước xác thực | API response bình thường; headers quota login | HTTP 429, JSON error; `Retry-After`; không tiết lộ username tồn tại hay không |

## Thuật toán

- Thuật toán MVP: fixed window counter. Key gồm policy và client ID; window ID là `floor(now / windowMs)`. Mỗi request tăng counter đồng bộ trong process trước khi gọi handler; chỉ allow khi counter không vượt limit.
- Thuật toán đối chiếu và code examples: token bucket (burst tới capacity rồi refill); sliding-window log (timestamp chính xác trong rolling window); sliding-window counter (xấp xỉ bằng weighted count của window hiện tại và trước đó); leaky bucket (mô phỏng occupancy được drain đều, ví dụ này reject khi đầy thay vì queue request thật).
- State cần lưu và thời điểm hết hạn: fixed-window counter theo client `{windowStart, count}`; token bucket `{tokens, updatedAt}`; sliding log timestamp list trong cửa sổ; sliding counter `{windowStart, previous, current}`; leaky bucket `{water, updatedAt}`. Dọn state khi hết hạn/idle; memory phụ thuộc cardinality client.
- Boundary/burst behavior: fixed window có thể cho gần 2× quota sát biên hai window; token bucket cho burst tới capacity; sliding log áp quota chính xác trên rolling window nhưng tốn timestamp; sliding counter làm mượt boundary bằng xấp xỉ; leaky bucket giới hạn burst theo capacity và drain rate.

## Middleware flow

- Thứ tự middleware: request ID/logging → cấu hình `trust proxy` chính xác nếu có → xác định identity từ auth hoặc socket IP → chọn policy theo route → kiểm tra/tăng counter nguyên tử trong process → gắn rate limit headers → handler; trả lỗi 429 trước handler nếu vượt quota.
- Quyết định allow/reject: cập nhật state và kiểm tra quota trong cùng một thao tác đồng bộ để request đồng thời trong một Node.js process không vượt quota do interleaving async. Giới hạn tính trên từng `(policy, client_id)`.
- Header trả về: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` (Unix time hoặc số giây theo contract đã chọn); khi reject thêm `Retry-After` tính bằng giây, làm tròn lên để client không retry sớm.

## Test và failure handling

- Quota boundary: quota 60 cho phép request 1–60, request 61 cùng window nhận 429; login kiểm tra boundary riêng ở 5; xác nhận headers và Retry-After.
- Nhiều client: client A chạm quota không ảnh hưởng client B; cùng client trên hai route dùng policy/key đúng như cấu hình.
- Clock/reset: test ngay trước/sau ranh giới window với clock giả; counter reset đúng window; kiểm tra reset header và Retry-After không âm.
- Store/process restart: restart làm mất state memory và cấp lại quota; ghi rõ giới hạn này, không giả vờ quota bền vững.
- Nhiều instance và atomicity: hai process có counter riêng nên tổng quota có thể nhân theo số instance; load balancer không bảo đảm cùng client vào cùng process. Shared store cần thao tác atomic increment + expiry (ví dụ Redis Lua hoặc transaction/script tương ứng); thao tác GET rồi SET riêng rẽ có race, nhiều request có thể cùng thấy còn quota và cùng được allow.

## Trade-offs và nâng cấp

- Accuracy / memory / latency: fixed window ít state và nhanh nhưng burst ở boundary; token bucket state nhỏ, hỗ trợ burst có kiểm soát; sliding-window log chính xác nhưng lưu request timestamps và tốn memory; sliding-window counter ít state hơn nhưng xấp xỉ; leaky bucket drain đều nhưng code mẫu reject khi đầy, còn queue thực cần thêm cơ chế chờ/backpressure.
- Fail-open vs fail-closed: fail-open giữ availability nhưng limiter outage có thể cho phép abuse/quá tải; fail-closed bảo vệ tài nguyên nhưng store outage làm request hợp lệ thất bại. Login chọn fail-closed; route đọc mặc định fail-open trong thiết kế tham khảo, cần quyết định theo rủi ro thực.
- Cách mở rộng shared store: thay state local bằng shared store có atomic increment và TTL; mọi instance dùng cùng key schema, policy version và clock convention. Theo dõi latency/error của store, fail mode, cardinality và eviction; không thêm Redis vào MVP một process trước khi cần multi-instance.
