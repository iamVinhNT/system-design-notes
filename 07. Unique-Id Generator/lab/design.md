# Phiếu thiết kế — LAB 07: Unique ID Generator

## ID layout

| Field | Số bit | Miền giá trị | Ghi chú |
| --- | --- | --- | --- |
| Sign | 1 | luôn 0 | Giữ ID trong miền signed int64 (`0..2^63-1`) |
| Timestamp | 41 | `0..2.199.023.255.551` ms | Mili-giây kể từ epoch; làm ID sort theo thời gian |
| Worker ID | 10 | `0..1023` | Một giá trị thay cho cặp datacenter/machine 5+5 của chương |
| Sequence | 12 | `0..4095` | Đếm ID trong cùng ms của một worker; reset về 0 khi sang ms mới |

- Epoch: `2024-01-01T00:00:00Z` (`1704067200000` ms Unix).
- Signed/unsigned representation: 64 bit, bit cao nhất luôn 0 nên giá trị lớn nhất là `9223372036854775807` và dùng được như signed int64 hoặc unsigned. Trong JS dùng `BigInt`; API trả chuỗi thập phân vì JSON number mất chính xác trên 2^53.
- Thời điểm hết hạn cấu trúc: `2^41` ms ≈ 69,7 năm, tức `2093-09-06T15:47:35.551Z`. Sau đó generator trả `TIMESTAMP_EXHAUSTED`. Chọn epoch gần hiện tại để tận dụng hết 41 bit.

## Generator contract

- API cấp một ID: `POST /v1/ids?worker=W` → `201 {worker, ids: ["..."]}`. POST vì mỗi lần gọi thay đổi state.
- API cấp batch: `POST /v1/ids?worker=W&count=N`, `N` từ 1 đến 1000, cùng tập ID trả về, thứ tự tăng. Batch là all-or-nothing: nếu fail giữa chừng, state generator được khôi phục nên không tiêu hao ID.
- Worker identity: mỗi `IdGenerator` có một worker ID cố định, kiểm miền `0..1023`. Server demo mô phỏng worker `1,2,3` trong một process, mỗi worker một state độc lập; ID trùng trong `workerIds` bị từ chối khi tạo app.
- Clock source: hàm `now()` được inject (mặc định `Date.now`), test điều khiển bằng đồng hồ giả lập, không sleep. `Date.now` không đơn điệu; đây là lý do phải xử lý rollback.

## Boundary và failure

- Sequence overflow: khi đủ 4096 ID trong cùng ms, `next()` ném `SEQUENCE_OVERFLOW` ngay, không chờ và không spin. API trả `503` kèm `Retry-After: 1`. Gọi lại sau khi đồng hồ sang ms mới thì thành công và sequence về 0.
- Clock rollback: nếu `timestamp < lastTimestamp` thì ném `CLOCK_ROLLBACK` kèm số ms lùi, API trả `503`. Không phát ID bằng timestamp cũ (sẽ trùng hoặc phá thứ tự). Khi đồng hồ đuổi kịp `lastTimestamp` thì tiếp tục. Chọn từ chối thay vì chờ để không chặn event loop; bù lại client phải retry.
- Worker ID bị trùng: hai máy cùng worker ID và cùng ms sẽ phát đúng cùng ID (test `duplicate worker ids collide`). Generator không thể tự phát hiện. Cần cấp worker ID có điều phối (ví dụ lease có TTL ở một coordination service, hoặc ID gán cố định theo deployment) và không tái sử dụng khi máy cũ có thể còn chạy. Phần cấp worker ID chưa làm.
- Restart: state nằm trong memory. Restart vào cùng ms với ID đã phát sẽ lặp `sequence 0` và trùng ID; đồng hồ lùi sau restart cũng có thể lặp. Giảm thiểu bằng cách lưu high-water mark `lastTimestamp` bền vững và truyền vào constructor (`lastTimestamp`), rồi đợi tới khi đồng hồ vượt mốc đó. Test `persisted high-water mark...` cho thấy mốc này chặn rollback sau restart nhưng không chặn restart trong cùng ms.
- Ngoài miền: đồng hồ trước epoch trả `BEFORE_EPOCH`; sau ngày hết hạn trả `TIMESTAMP_EXHAUSTED`.

## Test vectors

| Timestamp | Worker | Sequence | ID mong đợi / invariant |
| --- | --- | --- | --- |
| 0 | 0 | 0 | `0` |
| 0 | 0 | 1 | `1` (sequence chiếm 12 bit thấp) |
| 0 | 1 | 0 | `4096` (worker dịch trái 12 bit) |
| 1 | 0 | 0 | `4194304` (timestamp dịch trái 22 bit) |
| 1000 | 5 | 7 | `4194324487` |
| 2199023255551 (max) | 1023 | 4095 | `9223372036854775807` = `2^63-1` |
| 0 | 0 | 4096 | lỗi `OUT_OF_RANGE` |
| 2199023255552 | 0 | 0 | lỗi `OUT_OF_RANGE` |

Invariant: encode rồi decode trả đúng ba trường; ID một worker tăng dần theo thời gian; nhiều worker khác nhau trong cùng ms không trùng (4 worker × 5 ms × 1000 ID, đủ 20.000 ID duy nhất).

## Trade-offs

- Sortability: ID tăng gần đúng theo thời gian (đúng thứ tự trong một worker; giữa worker chỉ sort tới mức ms, và lệch theo độ lệch clock giữa các máy). Không phải thứ tự toàn cục chặt.
- Throughput: tối đa `4096` ID/ms/worker, tức khoảng `4,096 triệu` ID/giây mỗi worker theo thiết kế bit; tổng tối đa cho 1024 worker nhân lên. Đây là trần lý thuyết từ bit layout, chưa benchmark; vượt ngưỡng thì client nhận 503 và retry.
- Information leakage: timestamp, worker ID và sequence đọc được trực tiếp từ ID (`/decode`). Lộ thời điểm tạo, mức tải ước lượng và số worker. Không dùng làm token bí mật hay ID không đoán được.
- So sánh UUID / Ticket Server: UUID 128 bit, không cần phối hợp, nhưng quá 64 bit và UUIDv4 không sort theo thời gian. Ticket Server cho ID tuần tự dễ hiểu nhưng là single point of failure và nút cổ chai ghi; nhiều ticket server làm mất thứ tự. Snowflake cần worker ID và đồng hồ đáng tin nhưng không có điểm phối hợp trên đường cấp ID.
- Điều kiện production còn thiếu: cấp và thu hồi worker ID có điều phối; lưu bền vững `lastTimestamp`; NTP/đồng bộ clock và giám sát độ lệch; chính sách chờ hoặc ném khi rollback nhỏ; giám sát tỷ lệ overflow; kế hoạch trước năm 2093 (đổi epoch hoặc layout); benchmark throughput thật.
