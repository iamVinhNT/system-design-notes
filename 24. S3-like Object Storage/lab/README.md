# LAB 24: S3-like Object Storage

## Mục tiêu

Triển khai API object storage học tập bằng Node.js/Express.js với file nhỏ local; thực hành metadata, multipart upload mô phỏng và integrity check.

## Đề bài

Client tạo object trong bucket, upload bytes, đọc metadata/content và xóa object. Upload lớn được chia part mô phỏng; finalize kiểm tra part và checksum.

## Yêu cầu chức năng

- Tạo/ghi/đọc/xóa object với key.
- Metadata gồm size, content type, checksum và createdAt.
- Multipart initiate/upload part/complete/abort ở mức MVP.
- Không overwrite ngoài policy đã chọn.
- Validate bucket/key và giới hạn kích thước.

## Phi chức năng và ràng buộc

- Dùng local directory tạm và file test nhỏ; không lưu dữ liệu quan trọng.
- Chống path traversal; key không được biến thành arbitrary filesystem path.
- Không tuyên bố durability, erasure coding hoặc S3 compatibility production.
- Dọn multipart session hết hạn theo policy.

## Coding tasks

1. Thiết kế bucket/object/part metadata.
2. Tạo API Express.js cho object CRUD và multipart flow.
3. Tách object key khỏi đường dẫn filesystem bằng mapping an toàn.
4. Tính/check checksum và xác thực đủ part trước complete.
5. Kiểm tra traversal, part thiếu/trùng, checksum sai và abort/expiry.

## Bài nâng cấp

- Thiết kế metadata server/data node và replication/erasure coding trên giấy.
- So sánh multipart threshold, chunk size và retry.
- Mô tả consistency sau overwrite/delete.

## Tiêu chí tự đánh giá

- [ ] Key không thể thoát khỏi thư mục storage.
- [ ] Content checksum được kiểm tra khi complete/read.
- [ ] Multipart thiếu part không finalize thành công.
- [ ] Abort/expiry dọn metadata và dữ liệu tạm.
- [ ] Kích thước request/object bị giới hạn.
- [ ] Ghi rõ local demo không đảm bảo production durability.
