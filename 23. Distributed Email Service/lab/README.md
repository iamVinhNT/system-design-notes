# LAB 23: Distributed Email Service

## Mục tiêu

Thiết kế mailbox và API email mô phỏng; thực hành ingest, lưu message, tìm kiếm và đồng bộ trạng thái mà không kết nối SMTP/IMAP thật.

## Đề bài

Tạo dịch vụ cho phép gửi email giả lập giữa các mailbox trong dataset local, xem inbox, đọc message và tìm theo sender/subject. Một worker mô phỏng delivery và có thể thất bại.

## Yêu cầu chức năng

- Tạo message với sender, recipients, subject, body fixture và timestamp.
- Queue/delivery giả lập tới mailbox recipient.
- Query inbox có pagination; cập nhật read/unread.
- Search theo field được hỗ trợ và trạng thái delivery.
- Retry delivery có giới hạn và tránh nhân đôi message ở recipient.

## Phi chức năng và ràng buộc

- Không gửi SMTP thật, không nhận email Internet, không dùng địa chỉ cá nhân thật.
- Giới hạn payload/body size và sanitize input/output.
- MVP một process; search có thể scan dataset nhỏ.

## Coding tasks

1. Xác định message, mailbox index, delivery status và idempotency key.
2. Tạo API Express.js compose/status/inbox/read/search.
3. Tạo delivery worker giả lập và retry.
4. Bổ sung pagination ổn định và giới hạn query.
5. Kiểm tra duplicate delivery, invalid recipient, body lớn, retry và search.

## Bài nâng cấp

- Thiết kế SMTP ingress/egress và IMAP-like sync ở mức kiến trúc.
- Tách search index khỏi canonical message store.
- Mô tả partition mailbox, attachment/object storage và retention.

## Tiêu chí tự đánh giá

- [ ] Gửi giả lập tạo trạng thái delivery truy vấn được.
- [ ] Retry không tạo duplicate trong mailbox.
- [ ] Inbox pagination ổn định.
- [ ] Query không trả message ngoài mailbox requester.
- [ ] Payload size và nội dung được kiểm soát.
- [ ] Không mở SMTP/IMAP thật hoặc lưu dữ liệu cá nhân.
