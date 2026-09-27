# LAB 14: Nền tảng video theo yêu cầu

## Mục tiêu

Thiết kế workflow upload và xử lý video; triển khai API Node.js/Express.js cho metadata, upload session và trạng thái xử lý mà không thực hiện transcoding production.

## Đề bài

Creator khởi tạo upload video; hệ thống ghi metadata, mô phỏng các bước transcode thành nhiều rendition và cho phép viewer lấy thông tin phát. Media bytes có thể là file nhỏ local hoặc fixture giả.

## Yêu cầu chức năng

- Tạo upload session và finalize upload.
- Theo dõi trạng thái `uploaded`, `processing`, `ready`, `failed`.
- Mô phỏng DAG job transcode và retry một bước lỗi.
- Lấy playback manifest giả với danh sách rendition.

## Ràng buộc

- Không upload video lớn hoặc transcode thật; giới hạn fixture local.
- Không phân phối nội dung công khai hoặc dùng CDN thật.
- MVP một process và storage đơn giản.
- Không trả trạng thái ready trước khi các bước bắt buộc hoàn tất.

## Coding tasks

1. Thiết kế video/upload/job data model.
2. Tạo endpoint create session, finalize, status và playback metadata.
3. Mô phỏng DAG các bước validate, transcode rendition và publish.
4. Thêm retry có giới hạn, idempotency khi finalize và trạng thái lỗi.
5. Kiểm tra transition không hợp lệ, retry và manifest chỉ khi ready.

## Bài nâng cấp

- Thiết kế chunked/resumable upload và presigned URL ở mức sơ đồ.
- So sánh queue-based worker với DAG scheduler.
- Đề xuất CDN/cache invalidation khi video thay rendition.

## Tiêu chí tự đánh giá

- [ ] Upload finalize lặp không tạo job trùng.
- [ ] Job dependency được thực thi đúng thứ tự.
- [ ] Retry không vượt giới hạn và trạng thái lỗi quan sát được.
- [ ] Playback metadata không xuất hiện trước trạng thái ready.
- [ ] Các byte fixture và worker simulation có giới hạn rõ.
- [ ] Nêu được phần nào cần object storage, queue và CDN khi scale.
