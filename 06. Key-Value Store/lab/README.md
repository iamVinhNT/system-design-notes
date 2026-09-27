# LAB 06: Key-Value Store phân tán ở mức mô phỏng

## Mục tiêu

Thiết kế API Key-Value Store và mô phỏng partition, replication, quorum, version conflict mà không tự xây database production.

## Đề bài

Tạo một dịch vụ lưu giá trị JSON theo key. Hệ thống mô phỏng nhiều shard/replica trong một process, cho phép đọc/ghi/xóa và quan sát kết quả khi replica lệch phiên bản.

## Yêu cầu chức năng

- `PUT /v1/kv/:key`, `GET /v1/kv/:key`, `DELETE /v1/kv/:key`.
- Xác định partition owner cho key.
- Cấu hình N/R/W để minh họa quorum; phát hiện khi không đủ replica phản hồi.
- Thể hiện conflict/version và cho phép chọn resolution policy có giải thích.

## Phi chức năng và ràng buộc

- Chỉ mô phỏng nhiều node trong một process và dữ liệu in-memory.
- Không tuyên bố đạt consistency/disaster recovery như database thực.
- Nêu semantics của read/write khi partial failure.
- Không lưu secrets hoặc dữ liệu nhạy cảm.

## Coding tasks

1. Chọn partition strategy và data representation gồm version metadata.
2. Viết API Express.js cho put/get/delete và validate input.
3. Mô phỏng replica acknowledgements và điều kiện quorum.
4. Tạo tình huống replica lỗi, stale read và concurrent update; ghi kết quả API.
5. Bổ sung phép kiểm tra nhỏ cho quorum pass/fail và conflict handling.

## Bài nâng cấp

- So sánh read repair với hinted handoff ở mức thiết kế.
- Thay version đơn giản bằng vector clock mô phỏng và chỉ ra concurrent versions.
- Phân tích cách chuyển data in-memory sang LSM-Tree/SSTable mà không cần tự cài production engine.

## Tiêu chí tự đánh giá

- [ ] CRUD hoạt động và key được định tuyến xác định.
- [ ] Quorum được tính rõ từ cấu hình N/R/W.
- [ ] Partial failure không bị báo thành công khi chưa đủ điều kiện đã chọn.
- [ ] Conflict không bị âm thầm ghi đè mà không có policy.
- [ ] Có test cho quorum đủ/thiếu và replica stale.
- [ ] Nêu rõ giới hạn mô phỏng so với distributed store thật.
