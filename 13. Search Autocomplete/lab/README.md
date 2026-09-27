# LAB 13: Search Autocomplete

## Mục tiêu

Triển khai gợi ý tìm kiếm theo prefix bằng Node.js/Express.js; thiết kế thu thập query, ranking, cập nhật dữ liệu và cache.

## Đề bài

Khi người dùng nhập prefix, API trả tối đa 10 gợi ý phổ biến. Query được ghi nhận theo thời gian và dùng để cập nhật ranking định kỳ; MVP có thể dùng dataset nhỏ trong memory.

## Yêu cầu chức năng

- Endpoint ghi nhận query đã normalize.
- Endpoint trả suggestions theo prefix, giới hạn kết quả.
- Ranking có tiêu chí xác định, ví dụ frequency và tie-break theo lexical order.
- Hạn chế lưu query nhạy cảm; quy định cách xóa/ẩn dữ liệu không phù hợp.

## Phi chức năng và ràng buộc

- MVP một process và dataset nhỏ; không yêu cầu search cluster.
- Lookup latency mục tiêu được người học tự đặt và đo trên dataset xác định.
- Trie/cached trie là phần triển khai hoặc nâng cấp có lý do; không mặc định phải chọn trie.

## Coding tasks

1. Xây dataset suggestions có score/frequency.
2. Viết API Express.js ingest prefix/query và retrieve suggestions.
3. Bắt đầu bằng cấu trúc dữ liệu đơn giản; đo lookup rồi nâng cấp trie nếu hợp lý.
4. Thêm top-K, normalization, tie-break và empty prefix policy.
5. Kiểm tra prefix, ranking, giới hạn kết quả, query duplicate và dữ liệu bị xóa.

## Bài nâng cấp

- Tách batch aggregation khỏi serving path.
- Mô phỏng shard theo prefix và cache phổ biến.
- Đánh giá dữ liệu stale khi ranking cập nhật theo batch.

## Tiêu chí tự đánh giá

- [ ] Kết quả đều bắt đầu bằng prefix sau normalization.
- [ ] Ranking ổn định và có tie-break.
- [ ] Số kết quả không vượt limit.
- [ ] Không ghi nhận query nhạy cảm theo policy tự chọn.
- [ ] Đo được thời gian lookup trên dataset có mô tả.
- [ ] Giải thích lựa chọn cấu trúc dữ liệu và trade-off cập nhật/đọc.
