# LAB 03: Buổi phỏng vấn thiết kế hệ thống có cấu trúc

## Mục tiêu

Thực hành framework phỏng vấn: làm rõ phạm vi, ước lượng, thiết kế cấp cao, rồi đào sâu trade-offs. Không xây ứng dụng riêng.

## Đề bài

Trong 45 phút, hãy thiết kế một dịch vụ rút gọn URL cho ứng dụng web. Người dùng có thể tạo short URL và được chuyển hướng tới URL gốc. Giả sử hệ thống có nhiều lượt redirect hơn lượt tạo URL; bạn phải tự hỏi thêm để chốt phạm vi.

## Quy trình thực hành

1. **Làm rõ yêu cầu — 5 phút:** ghi câu hỏi cho người phỏng vấn; chốt chức năng, scale, latency, retention, privacy và hành vi URL trùng.
2. **Ước lượng — 5 phút:** nêu read/write ratio, QPS, dung lượng và giả định.
3. **Thiết kế cấp cao — 10 phút:** vẽ API, data model và các thành phần chính; mô tả create và redirect flow.
4. **Đào sâu — 20 phút:** chọn vấn đề theo bằng chứng: ID generation/collision, cache, database scaling, redirect semantics, abuse hoặc reliability.
5. **Tổng kết — 5 phút:** nhắc lại thiết kế, bottleneck, trade-offs, failure modes và câu hỏi còn mở.

## Ràng buộc

- Dùng đồng hồ thật; dừng mỗi chặng đúng thời lượng.
- Không đọc lời giải chương khi đang thực hành.
- Không yêu cầu code trong buổi này; có thể ghi pseudo-code ngắn nếu giúp giải thích.
- Ghi cả câu hỏi đã bỏ qua do giới hạn thời gian.

## Kết quả cần nộp

- Bản ghi câu hỏi làm rõ và giả định đã chốt.
- Ước lượng có đơn vị và phép tính.
- Sơ đồ kiến trúc, API/data model và hai flow chính.
- Danh sách trade-offs, failure modes và phần chưa kịp đào sâu.

## Tiêu chí tự đánh giá

- [ ] Không nhảy vào giải pháp trước khi xác định phạm vi.
- [ ] Phân biệt yêu cầu chức năng và phi chức năng.
- [ ] Ước lượng có giả định rõ, đủ để định hướng thiết kế.
- [ ] Kiến trúc cấp cao bao phủ create và redirect flow.
- [ ] Đào sâu một vài vấn đề có liên hệ yêu cầu, không liệt kê công nghệ rời rạc.
- [ ] Trình bày trade-offs, failure handling và kết luận trong thời gian.

## Bài nâng cấp

Lặp lại bài với giới hạn 30 phút hoặc yêu cầu analytics cho mỗi short URL; so sánh cách phân bổ thời gian và thay đổi thiết kế.
