# LAB 10: Notification System bất đồng bộ

## Mục tiêu

Thiết kế API tiếp nhận notification và pipeline gửi giả lập qua email/SMS/push; thực hành queue, retry, idempotency và delivery status.

## Đề bài

Ứng dụng thương mại điện tử cần gửi thông báo đặt hàng thành công tới người dùng qua channel họ đăng ký. Hệ thống phải tiếp nhận nhanh, xử lý gửi nền và cho phép tra trạng thái.

## Yêu cầu chức năng

- API tạo notification có recipient, template, channel và idempotency key.
- Giả lập provider gửi thành công/thất bại; không phát sinh SMS/email thật.
- Retry lỗi tạm thời có giới hạn; lỗi vĩnh viễn không retry.
- Tra trạng thái queued/sending/sent/failed và lưu attempt history tối thiểu.
- Tránh gửi lặp khi client retry cùng request.

## Phi chức năng và ràng buộc

- MVP một process với queue/storage đơn giản.
- Xác định at-least-once behavior và cách xử lý duplicate.
- Không ghi secret/provider credentials hoặc nội dung nhạy cảm vào log.
- Template và channel được validate trước khi enqueue.

## Coding tasks

1. Thiết kế notification record và trạng thái chuyển tiếp hợp lệ.
2. Tạo endpoint submit/status bằng Express.js.
3. Viết worker giả lập queue và provider adapter dùng kết quả cố định/random có seed.
4. Thêm retry/backoff có giới hạn, idempotency và dead-letter state.
5. Kiểm tra duplicate request, provider timeout, retry exhaustion và trạng thái cuối.

## Bài nâng cấp

- Thêm priority queue, scheduled notification và per-provider rate limit.
- Tách transactional outbox vào thiết kế; chưa cần broker thật.
- Mô tả cách mở rộng worker và đảm bảo retry sau restart.

## Tiêu chí tự đánh giá

- [ ] Submit trả nhanh và không chờ provider giả lập hoàn tất.
- [ ] Idempotency key chặn tạo notification lặp.
- [ ] Retry chỉ áp dụng lỗi tạm thời, có giới hạn/backoff.
- [ ] State transition và attempt history nhất quán.
- [ ] Có cách theo dõi lỗi cuối cùng mà không retry vô hạn.
- [ ] Không dùng dịch vụ gửi thật hoặc log dữ liệu nhạy cảm.
