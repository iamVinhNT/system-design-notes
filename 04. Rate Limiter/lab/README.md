# LAB 04: API Rate Limiter bằng Express.js

## Mục tiêu

Thiết kế rate limiter phía server và triển khai middleware trong Node.js/Express.js; quan sát khác biệt giữa giới hạn theo process và giới hạn dùng chung.

## Đề bài

Một API công khai có endpoint đọc hồ sơ người dùng. Giới hạn mặc định là 60 request mỗi phút cho từng client; endpoint đăng nhập có quota riêng. Khi vượt quota, API phải từ chối request và trả thông tin retry phù hợp.

## Yêu cầu

### Chức năng

- Áp dụng middleware theo route hoặc nhóm route.
- Hỗ trợ ít nhất hai policy khác nhau.
- Trả HTTP 429 và các header limit/remaining/reset hoặc retry.
- Phân biệt client theo một định danh được chọn; ghi rõ trust boundary.

### Phi chức năng

- Không làm tăng latency đáng kể trên request hợp lệ.
- Xử lý đồng thời và thời gian chính xác ở một process.
- Nêu hành vi khi store lỗi và sự khác nhau khi chạy nhiều instance.

## Ràng buộc

- MVP lưu state trong memory của một process Express.js; không cần Redis.
- Không tin `X-Forwarded-For` nếu chưa xác định proxy đáng tin.
- Không thêm dependency bắt buộc; người học tự chọn cách kiểm thử.

## Coding tasks

1. Tạo endpoint mẫu và middleware policy theo route/client.
2. Triển khai một thuật toán đơn giản; thêm thuật toán thứ hai để so sánh burst và memory trade-off.
3. Viết kiểm tra cho quota, request bị chặn, reset window và client tách biệt.
4. Mô tả cách atomic counter/store dùng chung sẽ thay thế state local ở nhiều instance.

## Bài nâng cấp

- So sánh fixed window, sliding window và token bucket.
- Bổ sung cấu hình fail-open/fail-closed, giải thích rủi ro mỗi lựa chọn.
- Tính giới hạn theo API key và endpoint nhạy cảm.

## Tiêu chí tự đánh giá

- [ ] Request trong quota qua được; request vượt quota nhận 429.
- [ ] Hai client có quota độc lập.
- [ ] Header phản ánh trạng thái quota nhất quán.
- [ ] Test kiểm tra boundary thời gian và burst.
- [ ] Nêu được race condition khi chuyển từ memory sang shared store.
- [ ] Không tin client-controlled identity header một cách mặc định.

## Giới hạn học tập

State trong memory mất khi process restart và không đồng bộ giữa instances; đây không phải cấu hình production.
