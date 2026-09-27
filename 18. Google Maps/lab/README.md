# LAB 18: Bản đồ và tìm tuyến đường

## Mục tiêu

Mô hình hóa bản đồ đồ chơi dưới dạng graph, tìm tuyến đường và ước lượng ETA; cung cấp API Node.js/Express.js, không dùng dữ liệu bản đồ thương mại.

## Đề bài

Ứng dụng có tập node giao lộ và cạnh đường với khoảng cách/thời gian đi. Người dùng gửi điểm đầu/cuối để nhận tuyến đường với tổng distance và ETA.

## Yêu cầu chức năng

- Nạp graph giả lập và validate node/edge.
- Tìm shortest path theo distance hoặc travel time.
- Trả danh sách node/edge và tổng distance/ETA.
- Có response xác định khi không có đường hoặc node không tồn tại.

## Phi chức năng và ràng buộc

- Không tích hợp Google Maps hay dữ liệu địa chỉ thật.
- Giới hạn graph đủ nhỏ để kiểm tra kết quả thủ công.
- Nêu giả định về one-way roads, weight không âm và thay đổi traffic.

## Coding tasks

1. Chọn adjacency representation và endpoint route query.
2. Triển khai shortest-path algorithm phù hợp với weight không âm.
3. Thêm cost mode: distance hoặc thời gian.
4. Tính ETA từ edge weights, mô tả traffic update giả lập.
5. Kiểm tra graph disconnected, cycle, one-way edge và trường hợp start=end.

## Bài nâng cấp

- Mô phỏng tile request/cache theo z/x/y trên grid giả.
- So sánh routing trên graph nhỏ với hierarchical routing ở mức thiết kế.
- Thêm traffic snapshot và đo ảnh hưởng tới route recomputation.

## Tiêu chí tự đánh giá

- [ ] Route hợp lệ theo hướng cạnh và tối ưu đúng cost mode.
- [ ] Không có đường được xử lý xác định.
- [ ] Tổng distance/ETA khớp các cạnh trên route.
- [ ] Test cover start=end, node thiếu và graph disconnected.
- [ ] Nêu giới hạn ETA khi traffic thay đổi.
- [ ] Dữ liệu và tile đều là mô hình đồ chơi.
