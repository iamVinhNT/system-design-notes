# Phiếu ước lượng — LAB 02

## Workload và giả định

| Đại lượng | Giá trị | Đơn vị | Nguồn / giả định |
| --- | --- | --- | --- |
| Người dùng hoạt động mỗi ngày | 2.000.000 | người/ngày | Đề bài |
| Lượt đọc mỗi người | 40 | ảnh/người/ngày | Đề bài; một lượt xem tương ứng tải một ảnh |
| Upload mỗi người | 0,2 | ảnh/người/ngày | Đề bài |
| Kích thước object | 1 | MB/ảnh | Đề bài, trước xử lý |
| Metadata mỗi ảnh | 1 | KB/ảnh | Quy ước đề bài |
| Peak factor | 3 | lần average | Quy ước đề bài |
| Retention | 3 | năm | Đề bài; giả định 365 ngày/năm |
| Số bản sao | 1 cơ sở; 3 ở phép tính mở rộng | bản | Cơ sở không tính replication; phép mở rộng nhân 3 |
| Đơn vị | Thập phân | 1 MB = 10^6 bytes; 1 GB = 10^9 bytes; 1 TB = 10^12 bytes | Quy ước đề bài |

## Công thức và kết quả

| Chỉ số | Công thức | Kết quả | Đơn vị |
| --- | --- | --- | --- |
| Read requests/day | 2.000.000 người/ngày × 40 ảnh/người/ngày | 80.000.000 | lượt/ngày |
| Write requests/day | 2.000.000 người/ngày × 0,2 ảnh/người/ngày | 400.000 | lượt/ngày |
| Average read QPS | 80.000.000 / 86.400 | ≈ 926 | lượt/giây |
| Peak read QPS | 926 × 3 | ≈ 2.778 | lượt/giây |
| Average upload QPS | 400.000 / 86.400 | ≈ 4,6 | lượt/giây |
| Peak upload QPS | 4,6 × 3 | ≈ 13,9 | lượt/giây |
| Ảnh lưu mỗi năm | 400.000 × 365 | 146.000.000 | ảnh |
| Ảnh lưu sau 3 năm | 146.000.000 × 3 | 438.000.000 | ảnh |
| Metadata sau 1 năm | 146.000.000 × 1 KB | 146 | GB |
| Metadata sau 3 năm | 438.000.000 × 1 KB | 438 | GB |
| Raw image storage sau 1 năm | 146.000.000 × 1 MB | 146 | TB |
| Raw image storage sau 3 năm | 438.000.000 × 1 MB | 438 | TB |
| Raw storage sau 3 năm, 3 bản sao | 438 TB × 3 | 1.314 | TB (≈ 1,31 PB) |
| Upload ingress average | 400.000 ảnh/ngày × 1 MB / 86.400 giây | ≈ 4,6 | MB/s (≈ 37 Mbps) |
| Upload ingress peak | 4,6 MB/s × 3 | ≈ 13,9 | MB/s (≈ 111 Mbps) |
| Download egress average | 80.000.000 ảnh/ngày × 1 MB / 86.400 giây | ≈ 926 | MB/s (≈ 7,4 Gbps) |
| Download egress peak | 926 MB/s × 3 | ≈ 2.778 | MB/s (≈ 22,2 Gbps) |

Băng thông là ước lượng theo kích thước ảnh gốc 1 MB cho mỗi lượt tải; chưa tính protocol overhead, retry, thumbnail/derivative, compression, hay lượt xem không tải đầy đủ object. Egress là traffic tới người dùng; origin egress phụ thuộc cache/CDN hit ratio. Với hit ratio H, ước lượng origin egress ≈ tổng egress × (1 − H), nếu hit bytes và request mix tương tự.

## Kiểm tra chéo

- Phép tính độc lập: 80M lượt đọc/ngày ≈ 80M / 100K = 800 lượt/giây nếu ngày dài xấp xỉ 100K giây; vì ngày thực tế 86,4K giây nên kết quả ≈ 926 QPS. Peak 3× ≈ 2,8K QPS.
- Bậc độ lớn kỳ vọng: khoảng 10^8 ảnh đọc/ngày, 10^5 ảnh upload/ngày, 10^2 TB raw storage/năm, egress trung bình gần 1 GB/s.
- Sai số / làm tròn: dùng 365 ngày/năm; giữ số thập phân ở bước trung gian; kết quả làm tròn 2–3 chữ số có nghĩa. MB/GB/TB đều dùng đơn vị thập phân.

## Độ nhạy

| Giả định thay đổi | Kết quả cơ sở | Kết quả mới | Tác động |
| --- | --- | --- | --- |
| Người dùng hoạt động hoặc lượt upload/người tăng 2× | 400K upload/ngày; 438 TB raw/3 năm | 800K upload/ngày; 876 TB raw/3 năm; ingress và upload QPS ×2 | Tăng tuyến tính storage, write QPS và ingress |
| Lượt đọc/người tăng 2× | 80M read/ngày; egress peak ≈ 22,2 Gbps | 160M read/ngày; egress peak ≈ 44,4 Gbps; read QPS ×2 | Tăng tuyến tính read QPS và egress; CDN có thể giảm phần origin traffic |
| Kích thước ảnh trung bình tăng 2× | 1 MB/ảnh; 438 TB raw/3 năm | 2 MB/ảnh; 876 TB raw/3 năm; ingress/egress ×2 | Storage và bandwidth tăng tuyến tính; metadata/QPS không đổi |
| Retention tăng 2× | 3 năm; 438 TB raw | 6 năm; 876 TB raw | Storage tăng tuyến tính; QPS và bandwidth không đổi |
| Peak factor tăng 2× | 3×; read peak ≈ 2.778 QPS | 6×; read peak ≈ 5.556 QPS; peak egress ≈ 44,4 Gbps | Chỉ peak capacity tăng; daily volume không đổi |

## Dữ liệu cần đo

- Telemetry cần thu: DAU; ảnh xem và upload theo giờ/ngày; phân phối kích thước object gốc và derivative; read/write QPS; ingress/egress bytes; CDN cache hit ratio theo request và bytes; retry/error rate; storage growth; retention/deletion; replication factor thực tế.
- Cách phân biệt giờ bình thường và giờ đỉnh: đo theo bucket 1 phút/5 phút trong nhiều tuần; so sánh average, p95/p99 và peak theo giờ/ngày; không suy peak từ daily average khi đã có telemetry.
- Câu hỏi còn mở: “xem một ảnh” có luôn tải object 1 MB không; có thumbnail hay nhiều kích thước không; retention áp dụng ảnh gốc và derivative thế nào; replication/erasure coding và overhead thực tế; CDN hit ratio theo bytes; traffic có mùa vụ hoặc sự kiện đột biến không.

## Tự đánh giá

- [x] Đơn vị nhất quán
- [x] Công thức có thể kiểm tra lại
- [x] Giả định và phép đo được phân biệt
- [x] Đã phân tích độ nhạy
