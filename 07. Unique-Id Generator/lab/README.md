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
