# LAB 15: Google Drive — đồng bộ file

## Mục tiêu

Thiết kế metadata file, versioning và sync giữa client; triển khai API MVP bằng Node.js/Express.js với payload giả hoặc file nhỏ local.

## Đề bài

Người dùng tạo thư mục, upload file, liệt kê nội dung và đồng bộ thay đổi từ nhiều thiết bị. Nếu hai thiết bị chỉnh cùng phiên bản offline, hệ thống cần phát hiện conflict thay vì âm thầm ghi đè.

## Yêu cầu chức năng

- Tạo/list folder và file metadata.
- Upload/download fixture nhỏ hoặc giả lập content reference.
- Versioning, cursor change feed và conditional update.
- Phát hiện concurrent edit theo version/etag.

## Ràng buộc

- Không đồng bộ filesystem thật hoặc file nhạy cảm.
- Giới hạn kích thước fixture; lưu local chỉ cho mục đích lab.
- MVP một process; không cần differential sync production.

## Coding tasks

1. Thiết kế file/folder metadata, version và change record.
2. Tạo API Express.js cho CRUD metadata, upload/download giả lập và change feed.
3. Dùng version/etag để phát hiện stale update.
4. Xử lý rename/move và xóa bằng tombstone hoặc policy đã chọn.
5. Test hai client cập nhật đồng thời, pagination change feed và retry request.

## Bài nâng cấp

- Mô phỏng block/chunk upload và content hash.
- So sánh last-write-wins với conflict copy hoặc merge.
- Thiết kế differential synchronization và xử lý thiết bị offline lâu.

## Tiêu chí tự đánh giá

- [ ] Stale version không ghi đè im lặng phiên bản mới.
- [ ] Change feed có cursor ổn định.
- [ ] Rename/move/delete có semantics rõ.
- [ ] Retry thao tác không tạo version trùng không cần thiết.
- [ ] Dữ liệu fixture được giới hạn và không tuyên bố production-ready.
- [ ] Mô tả cách đồng bộ nhiều device và conflict resolution.
