# LAB 01: Mở rộng hệ thống từ một server tới hàng triệu người dùng

## Mục tiêu

Thực hành nhận diện nút thắt và tiến hóa kiến trúc theo tải, dựa trên các giai đoạn trong chương Scaling. Đây là bài tập thiết kế, không yêu cầu dựng ứng dụng.

## Đề bài

Một dịch vụ chia sẻ bài viết chạy trên một server duy nhất. Lượng truy cập tăng đều; người dùng đọc nội dung nhiều hơn tạo nội dung. Hãy đề xuất các bước mở rộng để dịch vụ tiếp tục đáp ứng tải, đồng thời tránh thêm thành phần trước khi có bằng chứng cần thiết.

## Yêu cầu

### Chức năng

- Người dùng đăng bài và đọc danh sách bài viết.
- Bài viết cần lưu bền vững; trang đọc phổ biến có thể được cache.

### Phi chức năng

- Duy trì tính đúng đắn khi có nhiều instance ứng dụng.
- Giảm latency đọc và cho phép mở rộng từng tầng độc lập.
- Mô tả hành vi khi cache hoặc một instance gặp lỗi.

## Ràng buộc và giả định

- Bắt đầu từ một máy chạy ứng dụng và database.
- Chưa có số liệu tải: ghi giả định, chỉ ra số liệu nào cần đo trước khi tối ưu.
- Không yêu cầu triển khai code hoặc chọn sản phẩm cloud cụ thể.

## Bài tập thiết kế

1. Vẽ request flow hiện tại và liệt kê các điểm nghẽn có thể quan sát.
2. Tiến hóa thiết kế theo từng nấc: tách database, nhiều app server/load balancer, cache, CDN và database scaling.
3. Với từng nấc, ghi tín hiệu kích hoạt, thay đổi kiến trúc, lợi ích, chi phí và failure mode.
4. Nêu cách xử lý session, dữ liệu stale, cache miss và database read/write bottleneck.
5. Chọn một phương án phù hợp ở mỗi giai đoạn tải; giải thích vì sao chưa cần áp dụng các nấc sau.

## Kết quả cần nộp

- Sơ đồ kiến trúc ban đầu và kiến trúc sau từng nấc.
- Bảng giả định, bottleneck, metric cần theo dõi và quyết định mở rộng.
- Danh sách rủi ro cùng trade-offs.

## Tiêu chí tự đánh giá

- [ ] Tách được dấu hiệu quan sát khỏi giả định.
- [ ] Giải thích được vì sao thêm từng tầng và vấn đề tầng đó giải quyết.
- [ ] Nêu được ảnh hưởng của cache tới freshness và consistency.
- [ ] Không nhầm scale ứng dụng với scale database.
- [ ] Có phương án fallback khi thành phần mới lỗi.
- [ ] Mỗi quyết định có metric hoặc giả định làm căn cứ.

## Bài nâng cấp

- Thêm workload tăng đột biến theo giờ cao điểm; xác định thành phần cần autoscale và giới hạn của nó.
- So sánh đọc từ primary, replica và cache trong trường hợp dữ liệu vừa được cập nhật.
