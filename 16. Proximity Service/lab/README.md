# LAB 16: Proximity Service

## Mục tiêu

Tạo API tìm địa điểm gần vị trí người dùng; so sánh full scan với một spatial index đơn giản và nêu trade-offs.

## Đề bài

Một ứng dụng lưu địa điểm dịch vụ có tọa độ và category. Người dùng gửi tọa độ/radius/category để lấy các địa điểm gần nhất, sắp xếp theo khoảng cách.

## Yêu cầu chức năng

- Ingest/list địa điểm với tọa độ hợp lệ.
- Query theo vị trí, radius, category và limit.
- Trả distance cùng pagination/ordering xác định.
- Chọn Geohash, Quadtree hoặc baseline scan; đo trên dataset giả lập.

## Ràng buộc

- Tọa độ và dữ liệu hoàn toàn giả lập.
- MVP chạy một process; không bắt buộc database geospatial.
- Nêu CRS/distance approximation đã chọn và giới hạn gần đường date line/pole nếu có.

## Coding tasks

1. Tạo địa điểm và validate latitude/longitude.
2. Triển khai radius query baseline và khoảng cách đã chọn.
3. Tạo API Express.js với category/filter/limit.
4. Nếu chọn spatial index, so sánh kết quả với baseline trên test dataset.
5. Kiểm tra radius boundary, tọa độ biên, sorting và không có kết quả.

## Bài nâng cấp

- Chia dữ liệu theo Geohash cell, xử lý lân cận cell boundary.
- So sánh Quadtree và Geohash cho density không đồng đều.
- Thiết kế shard/caching cho region nóng.

## Tiêu chí tự đánh giá

- [ ] Tọa độ ngoài miền hợp lệ bị từ chối.
- [ ] Kết quả thỏa radius/filter và được sort xác định.
- [ ] Không bỏ sót điểm qua cell boundary khi dùng index.
- [ ] Kết quả index được đối chiếu với baseline.
- [ ] Nêu trade-off precision, update cost và query performance.
- [ ] Dữ liệu ví dụ không chứa vị trí cá nhân thật.
