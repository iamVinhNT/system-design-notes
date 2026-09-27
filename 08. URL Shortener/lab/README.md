# LAB 08: Dịch vụ rút gọn URL

## Mục tiêu

Thiết kế và triển khai MVP URL shortener bằng Node.js/Express.js, tập trung vào tạo mã, redirect, lưu trữ và đường đọc có tải cao.

## Đề bài

Người dùng gửi URL dài để nhận short URL. Khi truy cập short URL, hệ thống chuyển hướng về URL gốc. Hỗ trợ alias tùy chọn, thời hạn hết hạn và thống kê lượt truy cập ở mức đơn giản.

## Yêu cầu

### Chức năng

- Tạo, tra cứu và redirect short URL.
- Từ chối URL không hợp lệ hoặc scheme nguy hiểm.
- Xử lý mã đã tồn tại, alias trùng và URL hết hạn.
- Phân biệt redirect semantics đã chọn; nêu ảnh hưởng cache của 301/302.

### Phi chức năng và ràng buộc

- MVP Express.js một process, storage đơn giản do người học chọn.
- Không cho phép javascript/data scheme; không dùng service làm open redirect ngoài ý muốn.
- Xác định uniqueness guarantee và cách tránh mã collision.

## Coding tasks

1. Thiết kế record cho short code, URL gốc, createdAt và expiresAt.
2. Tạo API tạo short URL và endpoint redirect.
3. Chọn generation strategy: counter/Base62, random code hoặc phương án khác; kiểm tra collision.
4. Thêm validation, expiry và trạng thái không tìm thấy.
5. Viết kiểm tra cho URL lỗi, alias trùng, expiry và redirect behavior.

## Bài nâng cấp

- Thêm read-through cache và invalidation khi URL bị xóa.
- Thêm analytics bất đồng bộ giả lập, không chặn redirect.
- Ước lượng keyspace và xử lý hot keys.

## Tiêu chí tự đánh giá

- [ ] Short code duy nhất theo phạm vi đã chọn.
- [ ] URL đầu vào được validate và scheme nguy hiểm bị từ chối.
- [ ] Redirect đúng status và location.
- [ ] URL hết hạn/không tồn tại có response xác định.
- [ ] Test collision/alias và cache consistency.
- [ ] Ghi rõ khác biệt behavior/caching giữa 301 và 302.
