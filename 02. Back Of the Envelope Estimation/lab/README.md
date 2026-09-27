# LAB 02: Ước lượng tải và capacity

## Mục tiêu

Luyện ước lượng QPS, dung lượng dữ liệu và băng thông từ yêu cầu mơ hồ; ghi rõ giả định và kiểm tra độ lớn kết quả. Đây là bài tập phân tích, không yêu cầu dựng ứng dụng.

## Đề bài

Một nền tảng chia sẻ ảnh có 20 triệu người dùng đăng ký. Mỗi ngày có 2 triệu người dùng hoạt động; mỗi người hoạt động xem 40 ảnh và tải lên trung bình 0,2 ảnh. Ảnh trung bình 1 MB trước xử lý, được giữ 3 năm. Hãy ước lượng tải đọc/ghi, dung lượng lưu trữ và băng thông ở giờ cao điểm.

## Quy ước bài tập

- Giả sử một ngày có 86.400 giây.
- Giả sử tải đỉnh bằng 3 lần trung bình nếu chưa có phân bố traffic.
- Giả sử metadata mỗi ảnh là 1 KB; không tính replication/overhead cho phép tính cơ sở.
- Ghi rõ đơn vị thập phân hay nhị phân và làm tròn hợp lý.
- Không tra benchmark để thay thế phép tính; có thể ghi khoảng ước lượng nếu dữ liệu chưa đủ.

## Bài tập

1. Tính số ảnh đọc và upload mỗi ngày; suy ra average QPS và peak QPS.
2. Tính dung lượng ảnh và metadata sau 1 năm, 3 năm.
3. Ước lượng ingress do upload và egress do đọc ảnh; nêu vì sao CDN/cache làm thay đổi origin bandwidth.
4. Tính lại dung lượng nếu có 3 bản sao; tách raw storage khỏi overhead giả định.
5. Nêu ba giả định nhạy cảm nhất và phân tích kết quả khi mỗi giả định tăng/giảm 2 lần.
6. Chọn số liệu nào cần thu thập từ telemetry để thay thế giả định.

## Kết quả cần nộp

- Bảng công thức, giá trị, đơn vị và giả định.
- Average/peak QPS, storage và bandwidth.
- Khoảng ước lượng và phân tích độ nhạy.

## Tiêu chí tự đánh giá

- [ ] Tách được users/day, requests/day và requests/second.
- [ ] Đổi đơn vị nhất quán, kiểm tra được bậc độ lớn.
- [ ] Không cộng replication hoặc cache vào phép tính cơ sở khi chưa nêu giả định.
- [ ] Phân biệt ingress, egress và traffic tới origin.
- [ ] Nêu được ảnh hưởng của retention và peak factor.
- [ ] Có kiểm tra chéo kết quả bằng phép tính độc lập.

## Bài nâng cấp

- Thêm video 20 MB cho 5% lượt upload và 10% lượt xem; tính lại storage/bandwidth.
- Tính sizing sơ bộ cho database metadata và cache working set; ghi rõ giả định hit ratio.
