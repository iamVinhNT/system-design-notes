# LAB 25: Real-time Gaming Leaderboard

## Mục tiêu

Thiết kế và triển khai leaderboard MVP bằng Node.js/Express.js; thực hành top-N, rank, tie-break, idempotent score event và cập nhật nóng.

## Đề bài

Game gửi score event cho người chơi. Người dùng truy vấn top-N và thứ hạng cá nhân trong một season. Event có thể được retry; tie-break phải ổn định.

## Yêu cầu chức năng

- Ghi score cho player và season.
- Trả top-N có thứ tự xác định.
- Trả rank của player và xử lý điểm bằng nhau theo policy.
- Idempotency cho event ID hoặc xác định rõ score update semantics.

## Phi chức năng và ràng buộc

- MVP một process, tập người chơi giả lập.
- Đặt giới hạn top-N và payload.
- Nêu khác biệt giữa leaderboard giữ best score và cộng dồn score.

## Coding tasks

1. Chọn data model và ranking/tie-break rules.
2. Tạo Express.js API score/top/rank.
3. Triển khai baseline sort hoặc sorted structure rồi đo dataset.
4. Thêm dedupe event và season reset.
5. Kiểm tra concurrent update, điểm hòa, player không có điểm và pagination.

## Bài nâng cấp

- Thiết kế Redis Sorted Set hoặc Skip List strategy.
- Phân vùng leaderboard theo season/region và xử lý global rank.
- Tối ưu rank query khi số người chơi lớn.

## Tiêu chí tự đánh giá

- [ ] Top-N được sort xác định với tie-break.
- [ ] Rank khớp policy khi điểm bằng nhau.
- [ ] Retry cùng event không cộng điểm lặp.
- [ ] Reset season không làm lẫn dữ liệu.
- [ ] Có benchmark mô tả dataset và thao tác.
- [ ] Nêu trade-off giữa update throughput và rank query.
