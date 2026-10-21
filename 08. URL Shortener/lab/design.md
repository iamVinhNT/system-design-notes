# Phiếu thiết kế — LAB 08: URL Shortener

## Requirements và giả định

- Người tạo / người truy cập: người tạo ẩn danh gọi API; người truy cập mở short URL và không cần đăng nhập. MVP không có tài khoản.
- Read/write ratio: giả định theo chương là 10:1. Với 100 triệu URL mới/ngày: khoảng 1.157 write/s trung bình và khoảng 11.574 redirect/s trung bình (đỉnh cao hơn, chưa ước lượng). MVP một process chỉ minh họa luồng, không đạt mức tải này.
- URL lifetime: mặc định không hết hạn; `ttlSeconds` từ 1 giây đến 10 năm. Hết hạn xử lý lazily lúc đọc; xóa khi có `deleteToken` hoặc `purgeExpired()`.
- Custom alias: 3–32 ký tự `[A-Za-z0-9_-]`, phân biệt hoa thường, cùng namespace với mã sinh tự động; trùng thì 409; `api` bị cấm vì trùng prefix route.
- Abuse/security constraints: chỉ `http`/`https`; từ chối `javascript:`, `data:`, `file:`, `ftp:`, URL tương đối, ký tự điều khiển/khoảng trắng, credentials trong URL, URL quá 2048 ký tự, URL trỏ về host của service (tránh vòng lặp và chuỗi redirect). Chưa có rate limit, blocklist hay safe browsing.

## API

| Method / route | Input | Output | Error cases |
| --- | --- | --- | --- |
| POST `/api/urls` | `{url, alias?, ttlSeconds?}` | 201 `{code, shortUrl, url, createdAt, expiresAt, deleteToken}` | 400 URL/alias/TTL/body sai (`INVALID_URL`, `UNSUPPORTED_SCHEME`, `SELF_REFERENCE`, `INVALID_ALIAS`, `INVALID_TTL`); 409 `ALIAS_TAKEN`; 413 body > 4 KB; 503 `CODE_GENERATION_FAILED` |
| GET `/:code` | mã | 302 (hoặc 301 theo cấu hình) với `Location` | 404 không có hoặc mã sai định dạng; 410 hết hạn |
| GET `/api/urls/:code` | mã | metadata và `hits` | 404; 410 |
| DELETE `/api/urls/:code` | header `X-Delete-Token` | 204 | 403 sai/thiếu token; 404 |

## Data model và key generation

- Short code: 7 ký tự Base62 `[0-9a-zA-Z]` sinh bằng `crypto.randomInt`; không đoán được và không lộ số lượng URL. Keyspace `62^7 = 3.521.614.606.208`. Phương án thay thế: Base62 của ID từ generator (lab 07) cho độ dài tăng dần và không bao giờ trùng, nhưng mã đoán được và duyệt tuần tự.
- URL record: `{url (đã chuẩn hóa), createdAt, expiresAt|null, deleteTokenHash}`, lưu trong `Map<code, record>`. Token xóa chỉ lưu SHA-256 và so sánh bằng `timingSafeEqual`.
- Uniqueness strategy: một mã chỉ thuộc một URL. Kiểm tra tồn tại rồi chèn là các bước đồng bộ trong một process nên không có race; nhiều process hoặc DB cần insert điều kiện (`INSERT ... ON CONFLICT DO NOTHING` hoặc unique index).
- Collision handling: sinh lại tối đa 5 lần. Khi bảng đầy 10,4% (365 tỉ bản ghi), xác suất một lần thử trùng khoảng 10,4% và cả 5 lần trùng khoảng `1,2e-5`; tại 1 tỉ bản ghi là `1,8e-18`. Hết lượt thì trả 503 thay vì ghi đè. Alias và mã tự sinh dùng chung namespace nên không ghi đè lẫn nhau. Nghịch lý ngày sinh (50% có ít nhất một cặp trùng ở khoảng 2,2 triệu mã) không gây lỗi vì mọi mã đều được kiểm tra với store.
- Expiry / deletion: hết hạn trả 410 và giữ bản ghi tới `purgeExpired()` (sau đó 404). Xóa cần token, bỏ cache ngay.

## Flows

- Create flow: validate JSON body → validate URL (scheme, ký tự, credentials, self-host, độ dài) → validate TTL → alias hoặc sinh mã có kiểm tra trùng → ghi record → trả 201 và `deleteToken` một lần.
- Redirect flow: kiểm tra định dạng mã → tra cache → miss thì đọc store → 404/410 nếu không có hoặc hết hạn → đẩy sự kiện vào hàng đợi analytics → trả 302 với `Location` đã chuẩn hóa.
- Cache flow: read-through LRU 1000 mục lưu `{url, expiresAt}`. Hit vẫn kiểm tra `expiresAt` nên không phục vụ link hết hạn. Xóa gọi `cache.delete` cùng lúc xóa record. Không cache âm (404) nên mã chưa tồn tại luôn xuống store; production cần bảo vệ trước tải quét mã.

## Failure và trade-offs

- Storage lỗi: MVP dùng memory nên không có lỗi storage mà mất toàn bộ khi restart. Production: cache hit vẫn phục vụ được khi DB lỗi nhưng có thể trả link đã xóa tới khi invalidate đến nơi; ghi tạo mới thì fail rõ ràng (503), không trả mã chưa lưu.
- Hot key: một link viral nằm trong cache nên không đẩy tải xuống store; nhiều process cần cache dùng chung hoặc CDN. Với 301/CDN cache hot link có thể bị phục vụ ở edge. Chưa đo hay mô phỏng tải hot key.
- 301 / 302: 301 là "chuyển vĩnh viễn", trình duyệt và CDN cache và lần sau không gọi service; giảm tải nhưng mất đếm lượt truy cập, link xóa hoặc hết hạn vẫn chạy tới khi cache hết, và khó sửa đích. 302 là tạm thời, mỗi lần vào đều qua service nên chính xác về hết hạn, xóa và analytics, đổi lại tăng tải. Mặc định 302 kèm `no-store`; 301 chỉ bật bằng cấu hình, `max-age` tối đa 1 ngày và không vượt TTL còn lại.
- Analytics ảnh hưởng latency: ghi vào hàng đợi trong memory rồi áp dụng sau response bằng `setImmediate`, nên redirect không chờ. Hàng đợi giới hạn 10.000 sự kiện; đầy thì bỏ cũ nhất và đếm `dropped`. Số `hits` chỉ nhất quán sau cùng và mất khi restart; production dùng log/queue bền vững.
- Open redirect / URL validation: shortener về bản chất redirect tới URL do người dùng cho, nên rủi ro còn lại là lạm dụng cho phishing. Đã giảm bằng allowlist scheme, từ chối credentials và self-reference, dùng `href` chuẩn hóa (không chèn header được), không phản chiếu `Host`. Còn thiếu: blocklist/safe browsing, rate limit tạo link (xem lab 04), báo cáo lạm dụng, trang cảnh báo trung gian.
