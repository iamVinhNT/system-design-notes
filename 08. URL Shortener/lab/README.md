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

## Chạy code example

Mã nghiệp vụ ở `app/shortener.js`, API Express ở `app/server.js`, test dùng `node:test` với đồng hồ giả lập.

Chạy từ thư mục `08. URL Shortener/lab/`:

```bash
npm install
npm test
npm start
```

Đặt `BASE_URL` (mặc định `http://localhost:3000`) để dựng `shortUrl`; service không lấy host từ header `Host` của request.

API:

- `POST /api/urls` với `{"url": "...", "alias": "docs", "ttlSeconds": 3600}` — tạo short URL. `alias` và `ttlSeconds` tùy chọn. Trả 201 kèm `deleteToken` (chỉ hiện một lần).
- `GET /:code` — redirect (302 mặc định). 404 nếu không có, 410 nếu hết hạn.
- `GET /api/urls/:code` — metadata và `hits` (không redirect, không tính lượt truy cập).
- `DELETE /api/urls/:code` với header `X-Delete-Token` — xóa; sai token trả 403.

Quyết định chính:

- Mã tạo bằng 7 ký tự Base62 ngẫu nhiên (`62^7 ≈ 3,52 nghìn tỉ`). Mỗi mã được kiểm tra với store trước khi dùng; trùng thì sinh lại tối đa 5 lần, hết lượt trả `503 CODE_GENERATION_FAILED`. Mã ngẫu nhiên không đoán được theo thứ tự, khác với Base62 của bộ đếm.
- Cùng một URL tạo hai lần cho hai mã khác nhau (không dedupe).
- Chỉ nhận URL tuyệt đối `http`/`https`, không chứa khoảng trắng, ký tự điều khiển hay `user:pass@`, tối đa 2048 ký tự, và không trỏ về chính host của service. `javascript:`, `data:`, `file:` bị từ chối. Location luôn là `href` đã chuẩn hóa.
- Redirect 302 có `Cache-Control: no-store`, nên trình duyệt hỏi lại service mỗi lần: hết hạn, xóa và đếm lượt truy cập luôn đúng. Chế độ 301 (`createApp({ redirectStatus: 301 })`) cho trình duyệt cache `max-age` tối đa 1 ngày và không vượt quá TTL còn lại. Với 301, lượt truy cập lặp lại không tới service và bản xóa chưa có hiệu lực tới khi cache hết hạn.
- Read-through cache LRU (1000 mục) cho đường redirect; xóa sẽ invalidate, và hạn dùng được kiểm tra lại khi cache hit.
- Hit count ghi vào hàng đợi có giới hạn (10.000 sự kiện) rồi áp dụng sau response; đầy thì bỏ sự kiện cũ nhất, không chặn redirect. `hits` chỉ nhất quán sau cùng.
- Bản ghi hết hạn trả 410 cho tới khi `purgeExpired()` xóa, sau đó 404. Chưa có job tự dọn.
- Alias 3–32 ký tự `[A-Za-z0-9_-]`, phân biệt hoa thường, `api` bị cấm.

Giới hạn: storage chỉ là `Map` trong memory, mất khi restart, không có rate limiting, không có kiểm tra URL độc hại (blocklist, safe browsing), không có xác thực người tạo. Đây là mô hình học tập.

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
