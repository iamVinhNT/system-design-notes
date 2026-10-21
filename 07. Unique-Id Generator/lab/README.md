# LAB 07: Dịch vụ cấp Unique ID

## Mục tiêu

Thiết kế endpoint cấp ID duy nhất, có thứ tự thời gian gần đúng; mô phỏng nhiều worker và phân tích clock rollback.

## Đề bài

Các API service cần ID 64-bit duy nhất, tạo nhanh trên nhiều worker và có thể sort gần theo thời điểm tạo. Hãy triển khai một generator trong Node.js/Express.js và mô phỏng việc cấp ID bởi nhiều worker.

## Yêu cầu chức năng

- API cấp một hoặc một lô ID.
- ID có timestamp, worker identifier và sequence hoặc cấu trúc khác do bạn chọn.
- Cấu hình worker ID để mô phỏng nhiều generator.
- Phát hiện sequence overflow và clock rollback; không phát ID trùng im lặng.

## Ràng buộc

- Dùng thời gian giả lập được điều khiển trong test thay vì phụ thuộc sleep dài.
- Không dùng ID tuần tự global dựa trên database cho bài MVP.
- Ghi rõ bit allocation, epoch, signedness và thời hạn trước timestamp overflow.
- Đây là mô hình học tập; không dùng cho production mà chưa đánh giá clock/worker coordination.

## Coding tasks

1. Chọn bit layout và viết hàm encode/decode kèm giới hạn.
2. Tạo generator độc lập theo worker ID.
3. Tạo Express.js endpoint cấp ID và batch; validate worker/config.
4. Kiểm tra uniqueness qua nhiều worker, cùng timestamp và sequence overflow.
5. Mô phỏng clock rollback và định nghĩa hành vi an toàn.

## Chạy code example

Mã encode/decode và generator ở `app/id.js`, API Express ở `app/server.js`, test dùng `node:test` với đồng hồ giả lập (không sleep).

Chạy từ thư mục `07. Unique-Id Generator/lab/`:

```bash
npm install
npm test
npm start
```

Layout 64-bit (bit dấu luôn 0, ID vừa kiểu signed int64):

| Field | Bit | Miền |
| --- | --- | --- |
| Sign | 1 | luôn 0 |
| Timestamp | 41 | ms kể từ epoch `2024-01-01T00:00:00Z`, `0..2^41-1` |
| Worker | 10 | `0..1023` |
| Sequence | 12 | `0..4095` mỗi ms mỗi worker |

Timestamp hết hạn ở `2093-09-06T15:47:35.551Z` (khoảng 69,7 năm sau epoch).

API (ID trả về dạng chuỗi vì số lớn hơn 2^53 mất chính xác trong JSON number):

- `POST /v1/ids?worker=1&count=1` — cấp 1–1000 ID từ một worker mô phỏng (mặc định worker đầu tiên, `1,2,3`). Dùng POST vì mỗi lần gọi đổi state của generator.
- `GET /v1/ids/:id/decode` — tách timestamp, worker, sequence.
- `GET /v1/layout` — bit layout, epoch, ngày hết hạn.
- `GET /v1/workers` — danh sách worker đã cấu hình.

Hành vi lỗi, không bao giờ phát ID trùng im lặng:

- Hết sequence trong cùng ms: `503 SEQUENCE_OVERFLOW` kèm `Retry-After: 1`. Generator không chờ hay spin.
- Đồng hồ lùi: `503 CLOCK_ROLLBACK` kèm số ms lùi; hết lùi thì tiếp tục.
- Batch là all-or-nothing: lỗi giữa chừng không tiêu hao ID.
- Worker không cấu hình trả 404; `worker`/`count`/`id` sai trả 400.

Giới hạn: state chỉ trong memory và mỗi worker ID chỉ xuất hiện một lần trong process demo, nên bài này không phát hiện được hai máy dùng chung worker ID (test `duplicate worker ids collide` chứng minh hai generator cùng worker và cùng ms phát ID trùng). Sau restart, cần truyền `lastTimestamp` đã lưu bền vững, nếu không đồng hồ lùi hoặc restart trong cùng ms có thể phát lại ID. Đây là mô hình học tập, chưa đủ cho production.

## Bài nâng cấp

- So sánh Snowflake-style ID với UUID và Ticket Server.
- Thêm cơ chế cấp worker ID; phân tích rủi ro duplicate worker.
- Thảo luận tính sortable và mức lộ thông tin timestamp.

## Tiêu chí tự đánh giá

- [ ] ID luôn nằm trong miền đã định nghĩa.
- [ ] Không trùng giữa worker khác nhau trong test.
- [ ] Overflow và rollback có hành vi rõ, không loop vô hạn.
- [ ] Có kiểm tra encode/decode và boundary timestamp.
- [ ] Ước lượng được thời gian sống theo epoch/bit allocation.
- [ ] Nêu được điều kiện cần để triển khai an toàn nhiều máy.
