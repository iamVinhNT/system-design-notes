# LAB 11: News Feed System

## Mục tiêu

Thiết kế và triển khai MVP tạo bài đăng, theo dõi và đọc feed bằng Node.js/Express.js; so sánh fanout-on-write và fanout-on-read.

## Đề bài

Người dùng theo dõi nhau, tạo post dạng text và xem feed mới nhất từ các tài khoản đã theo dõi. Hệ thống cần phân trang ổn định và hỗ trợ tài khoản có lượng follower cao.

## Yêu cầu

- API tạo post, follow/unfollow và đọc feed.
- Sắp xếp theo thời gian tạo, cursor pagination.
- Chọn fanout strategy; mô tả trường hợp hybrid cho celebrity account.
- Chống hiển thị post trùng khi kết hợp nhiều nguồn.

## Phi chức năng và ràng buộc

- MVP một process, dữ liệu đơn giản do người học chọn.
- Ghi rõ consistency kỳ vọng sau khi tạo post/follow.
- Không yêu cầu ranking ML, media upload hay production social graph.

## Coding tasks

1. Xác định user, follow edge, post và feed item model.
2. Thiết kế API Express.js cho post, follow và feed.
3. Triển khai một fanout strategy và cursor pagination.
4. Tạo dataset có user thường và celebrity; so sánh write amplification/read cost.
5. Kiểm tra cursor không bỏ/sai trùng item khi nhiều post cùng timestamp.

## Bài nâng cấp

- Kết hợp fanout-on-write cho user thường và fanout-on-read cho celebrity.
- Thêm cache feed và xử lý invalidation.
- Xác định cách delete post lan truyền tới materialized feed.

## Tiêu chí tự đánh giá

- [ ] Feed chỉ gồm nội dung từ nguồn hợp lệ theo policy.
- [ ] Pagination ổn định và không lặp item qua trang.
- [ ] Follow/unfollow ảnh hưởng kết quả xác định.
- [ ] Giải thích write amplification so với read fanout.
- [ ] Có cách deduplicate feed item từ nhiều nguồn.
- [ ] Nêu rõ eventual consistency và cache invalidation.
