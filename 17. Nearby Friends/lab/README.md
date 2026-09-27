# LAB 17: Nearby Friends

## Mục tiêu

Thiết kế cập nhật vị trí tạm thời và tìm bạn bè ở gần bằng Node.js/Express.js; tập trung freshness, privacy và expiration.

## Đề bài

Người dùng bật chia sẻ vị trí trong một khoảng thời gian. Bạn bè được phép xem vị trí gần đây và tìm người trong một bán kính. Vị trí cũ phải tự hết hạn; người dùng có thể tắt chia sẻ.

## Yêu cầu chức năng

- Cập nhật location có timestamp và TTL.
- Truy vấn friend locations trong radius.
- Tắt chia sẻ và xóa/ẩn location hiện tại.
- Chỉ trả vị trí cho requester được phép theo policy bài tập.

## Phi chức năng và ràng buộc

- Chỉ dùng tọa độ giả lập; không gửi vị trí thật.
- MVP memory/local; TTL được kiểm tra cả khi đọc, không chỉ trông vào background cleanup.
- Không triển khai auth production; thiết kế phải nêu access-control boundary.

## Coding tasks

1. Thiết kế presence/location record, expiry và visibility policy.
2. Tạo API Express.js cập nhật, revoke và query vị trí.
3. Lọc friend list, TTL, radius và trả dữ liệu tối thiểu.
4. Thêm test location hết hạn, revoke, requester không có quyền và update cũ tới trễ.
5. Mô tả cách publish location update realtime qua WebSocket/Pub/Sub như phần nâng cấp.

## Bài nâng cấp

- Thêm WebSocket subscription theo vùng hoặc friend set.
- Mô phỏng Redis TTL/Pub/Sub ở mức thiết kế, không bắt buộc cài Redis.
- Giảm độ chính xác tọa độ và giới hạn tần suất update để bảo vệ privacy/battery.

## Tiêu chí tự đánh giá

- [ ] Location expired không xuất hiện kể cả cleanup chưa chạy.
- [ ] Revoke có hiệu lực ngay ở query path.
- [ ] Không trả vị trí cho người ngoài policy.
- [ ] Update cũ không ghi đè update mới hơn.
- [ ] Tần suất và retention có giới hạn.
- [ ] Chỉ dùng dữ liệu giả lập và ghi rõ boundary bảo mật.
