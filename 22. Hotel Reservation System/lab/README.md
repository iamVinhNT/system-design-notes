# LAB 22: Hotel Reservation System

## Mục tiêu

Thiết kế đặt phòng có hold tạm thời và triển khai API Node.js/Express.js; tập trung chống double booking dưới các request đồng thời.

## Đề bài

Khách tìm phòng theo khách sạn, room type và ngày. Hệ thống tạo hold có thời hạn; khách xác nhận trong thời gian giữ phòng. Nếu hold hết hạn, inventory được phép đặt lại.

## Yêu cầu chức năng

- Tìm availability theo date range.
- Tạo hold, confirm, cancel và query reservation.
- Hold có expiry và state transition hợp lệ.
- Không cho số reservation confirmed vượt inventory.
- Idempotency cho confirm/cancel retry.

## Phi chức năng và ràng buộc

- MVP dùng storage hỗ trợ transaction/atomic update nếu có; ghi rõ isolation/locking strategy.
- Chạy các request song song để thử race; không chỉ dựa vào check-then-insert không atomic.
- Không xử lý thanh toán thật hoặc dữ liệu cá nhân.

## Coding tasks

1. Chọn inventory granularity theo hotel/room type/date và reservation model.
2. Tạo API Express.js search/hold/confirm/cancel.
3. Chọn optimistic lock, pessimistic lock hoặc constraint/transaction; giải thích invariant.
4. Tạo concurrency test cho hai khách cùng giữ phòng cuối.
5. Kiểm tra hold expiry, confirm lặp, cancel sau confirm và rollback khi lỗi.

## Bài nâng cấp

- Tách inventory reservation với payment saga.
- Mô phỏng hold expiry worker và race với confirm.
- So sánh lock granularity và contention.

## Tiêu chí tự đánh giá

- [ ] Không thể confirm vượt inventory dưới concurrent requests.
- [ ] Hold expiry được kiểm tra trên đường ghi/xác nhận.
- [ ] State transition bất hợp lệ bị từ chối.
- [ ] Retry idempotent không tạo reservation trùng.
- [ ] Transaction rollback không để inventory bị trừ dở dang.
- [ ] Có kiểm tra đồng thời tái lập được.
