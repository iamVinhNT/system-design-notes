# LAB 12: Chat System

## Mục tiêu

Xây MVP nhắn tin bằng API Node.js/Express.js; thiết kế lịch sử hội thoại, thứ tự tin nhắn và đồng bộ khi client reconnect. WebSocket là phần nâng cấp tùy chọn.

## Đề bài

Hai người dùng có thể tạo hội thoại, gửi tin nhắn và đọc lịch sử theo thứ tự. Client có thể mất kết nối rồi yêu cầu tiếp tục từ message cuối đã nhận.

## Yêu cầu chức năng

- Tạo/lấy hội thoại và gửi tin nhắn.
- Lấy lịch sử theo cursor tăng dần hoặc giảm dần được chọn.
- Mỗi message có ID, conversation ID, sender, timestamp và sequence/order key.
- Hỗ trợ client retry gửi tin bằng client message ID/idempotency key.
- Trạng thái delivered/read có thể là phần mở rộng.

## Phi chức năng và ràng buộc

- MVP HTTP polling; không cần WebSocket server.
- Xác định thứ tự trong một hội thoại, không cần global ordering.
- Không xây auth production; thiết kế phải ghi rõ authorization boundary.
- Không lưu thông tin cá nhân thật.

## Coding tasks

1. Thiết kế conversation/message model và API Express.js.
2. Triển khai gửi message idempotent và truy vấn lịch sử có cursor.
3. Xử lý hai message cùng thời điểm bằng tie-break ổn định.
4. Mô phỏng reconnect bằng `last_seen_message_id` hoặc cursor.
5. Kiểm tra duplicate send, ordering, pagination và conversation access.

## Bài nâng cấp

- Thêm WebSocket để push message và fallback polling.
- Mô phỏng presence/typing indicator với TTL.
- Thiết kế multi-device sync và offline delivery.

## Tiêu chí tự đánh giá

- [ ] Retry cùng client message ID không tạo message mới.
- [ ] Lịch sử có thứ tự xác định, phân trang không bỏ/sai trùng message.
- [ ] Reconnect truy vấn được message sau cursor.
- [ ] Truy cập conversation có boundary kiểm tra quyền được mô tả.
- [ ] WebSocket không bị trộn vào yêu cầu MVP.
- [ ] Nêu được giới hạn khi mở rộng nhiều chat gateway.
