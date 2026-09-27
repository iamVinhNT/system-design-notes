# LAB 09: Web Crawler có kiểm soát

## Mục tiêu

Thiết kế crawler giới hạn domain, lịch truy cập và độ sâu; thực hành URL frontier, deduplication, retry và tôn trọng giới hạn nguồn.

## Đề bài

Xây crawler nhỏ để thu thập các trang trong một website thử nghiệm được cho phép. Crawler bắt đầu từ một URL seed, trích xuất link, lưu kết quả và không làm quá tải host.

## Yêu cầu chức năng

- Nhận seed URL và cấu hình max depth / max pages.
- Chuẩn hóa URL, loại fragment và deduplicate.
- Chỉ crawl host nằm trong allowlist; kiểm tra redirect không vượt phạm vi.
- Lập lịch request theo host với politeness delay.
- Lưu trạng thái queued/fetching/done/failed và nội dung metadata.

## Phi chức năng và ràng buộc

- Chỉ dùng website local/lab hoặc nguồn được cho phép; không crawl tùy tiện Internet.
- Timeout request, giới hạn response size và concurrency.
- Chặn URL trỏ tới localhost/private network khi input không được kiểm soát; không để crawler thành SSRF proxy.
- MVP có thể chạy một process; không yêu cầu distributed frontier.

## Coding tasks

1. Tạo URL validation, normalization và allowlist.
2. Viết frontier queue cùng tập visited/dedup.
3. Fetch trang với timeout/size limit và trích link giới hạn.
4. Lập lịch politeness theo host và giới hạn max pages/depth.
5. Thêm API Express.js để tạo job, xem trạng thái và kết quả.
6. Test URL ngoài allowlist, redirect ngoài domain, duplicate, timeout và response quá lớn.

## Bài nâng cấp

- Ưu tiên URL theo depth/freshness.
- Mô phỏng nhiều worker nhưng vẫn giữ per-host politeness.
- Thiết kế persistence/recovery cho frontier sau process restart.

## Tiêu chí tự đánh giá

- [ ] Crawler không vượt host allowlist kể cả khi redirect.
- [ ] URL trùng chỉ fetch theo policy đã chọn.
- [ ] Có giới hạn page count, depth, concurrency, response size và timeout.
- [ ] Per-host politeness được giữ khi xử lý nhiều URL.
- [ ] Lỗi fetch có trạng thái và retry policy giới hạn.
- [ ] Không cho phép SSRF tới địa chỉ nội bộ từ URL tùy ý.
