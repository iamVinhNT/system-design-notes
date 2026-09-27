# Đặc tả: Bộ LAB thực hành System Design

- Status: Implemented
- Ngày: 2026-09-27

## Mục tiêu

Bổ sung bộ LAB thực hành dựa trên 28 chương ghi chú hiện có. Mỗi chủ đề thiết kế hệ thống có một LAB riêng để người học tự làm rõ yêu cầu, thiết kế kiến trúc, rồi triển khai MVP bằng Node.js/Express.js. LAB không chứa lời giải mẫu đầy đủ hoặc starter code.

## Phạm vi

- Chương 01–03 là chủ đề nền tảng; tạo bài tập hỗ trợ trong thư mục `lab/`, không yêu cầu ứng dụng độc lập.
- Chương 04–28 mỗi chương có LAB cho chủ đề tương ứng.
- Tạo tài liệu `lab/README.md` và `lab/design.md` trong từng chương 01–28.
- Tạo `lab/app/` làm vị trí người học tự tạo ứng dụng Node.js/Express.js cho chương 04–28; ban đầu chỉ có `.gitkeep` để Git theo dõi, không có package, source, tests hay cấu hình sẵn.
- Cập nhật `Readme.md` gốc để hướng dẫn cấu trúc LAB và điều hướng tới LAB các chương.

## Cấu trúc thư mục

```text
<chapter>/lab/
├── README.md
├── design.md
└── app/        # Chỉ dành cho chương 04–28; ban đầu để trống
```

`README.md` mô tả bài tập, mục tiêu, yêu cầu chức năng và phi chức năng, ràng buộc, coding tasks, bài nâng cấp và tiêu chí tự đánh giá. `design.md` là mẫu ghi chép để người học tự điền yêu cầu đã chốt, API, data model, kiến trúc, luồng chính, trade-offs, lỗi/khôi phục và quyết định mở rộng. Không điền sẵn lời giải.

## Phân loại và đầu ra theo chương

### Chủ đề nền tảng: bài tập hỗ trợ, không có app

- **01 Scaling:** Bài tập tiến hóa kiến trúc từ một server tới nhiều tầng; xác định điểm nghẽn, lựa chọn cache/CDN/database scaling và đánh đổi.
- **02 Estimation:** Bài tập ước lượng QPS, dung lượng, băng thông và capacity cho một workload được nêu trong đề; yêu cầu ghi rõ giả định và tính nhẩm.
- **03 System Design Framework:** Bài tập phỏng vấn có giới hạn thời gian; áp dụng quy trình làm rõ yêu cầu, ước lượng, thiết kế cấp cao và đào sâu; tự đánh giá cách trình bày.

### LAB hệ thống: thiết kế và MVP Node.js/Express.js

- **04 Rate Limiter:** Middleware giới hạn request; so sánh ít nhất hai thuật toán, xử lý header và hành vi khi bộ đếm lỗi.
- **05 Consistent Hashing:** Mô phỏng hash ring, virtual nodes, phân phối key và tác động khi thêm/bớt node.
- **06 Key-Value Store:** API get/put/delete, partitioning, replication/quorum và xử lý xung đột ở mức mô phỏng; không yêu cầu tự xây database production.
- **07 Unique ID Generator:** API cấp ID duy nhất, xác định cấu trúc ID và mô phỏng nhiều worker/clock rollback.
- **08 URL Shortener:** Tạo mã rút gọn, redirect, xử lý trùng mã, expiry và truy cập phổ biến.
- **09 Web Crawler:** Hàng đợi URL, crawl giới hạn host, politeness, deduplication và giới hạn độ sâu; chỉ crawl nguồn được phép trong môi trường thực hành.
- **10 Notification System:** Tiếp nhận thông báo, xử lý bất đồng bộ giả lập, retry, idempotency và trạng thái gửi; không gửi SMS/email thật mặc định.
- **11 News Feed System:** Tạo bài đăng, phân phối feed; so sánh fanout-on-write và fanout-on-read, xử lý cursor pagination.
- **12 Chat System:** API hội thoại/tin nhắn, thứ tự và đồng bộ lịch sử; WebSocket là phần mở rộng tùy chọn, không bắt buộc cho MVP HTTP.
- **13 Search Autocomplete:** Ghi nhận query, trả gợi ý theo prefix và thứ hạng; bắt đầu bằng cấu trúc đơn giản rồi nâng cấp trie/cache.
- **14 YouTube:** Khởi tạo upload, trạng thái xử lý video và phát nội dung giả lập; không yêu cầu transcode hoặc lưu media production thực.
- **15 Google Drive:** Metadata file, upload/download giả lập, đồng bộ phiên bản và phát hiện chỉnh sửa xung đột; không yêu cầu đồng bộ filesystem thật.
- **16 Proximity Service:** Lưu địa điểm và tìm điểm gần nhất; xác định index không gian, radius và phân trang.
- **17 Nearby Friends:** Cập nhật vị trí có thời hạn và truy vấn bạn bè gần đó; giới hạn dữ liệu vị trí và đề xuất cách hết hạn.
- **18 Google Maps:** Tìm tuyến trên bản đồ đồ chơi; mô hình graph, shortest path và ước tính ETA; không dùng dữ liệu/bản đồ thương mại bắt buộc.
- **19 Distributed Message Queue:** Mô phỏng topic, partition, consumer, offset và retry; chỉ một tiến trình cho MVP, nêu rõ giới hạn so với distributed broker.
- **20 Metrics Monitoring and Alerting:** Nhận metric, tổng hợp cửa sổ thời gian, truy vấn và đánh giá alert rule trên dữ liệu mẫu.
- **21 Ad Click Event Aggregation:** Thu nhận click event, deduplicate và tổng hợp theo cửa sổ; quy định xử lý event trễ và replay.
- **22 Hotel Reservation System:** Tìm phòng, giữ chỗ có thời hạn và xác nhận đặt phòng; chống double booking bằng cơ chế lưu trữ được chọn.
- **23 Distributed Email Service:** Gửi/nhận email mô phỏng, mailbox, truy vấn và trạng thái; không kết nối SMTP thật mặc định.
- **24 S3-like Object Storage:** API object cơ bản, metadata, multipart upload mô phỏng và integrity check; lưu local phục vụ học tập, không tuyên bố production-ready.
- **25 Real-time Gaming Leaderboard:** Ghi điểm và truy vấn top-N/rank; xử lý tie-break và cập nhật lặp.
- **26 Payment System:** Tạo payment intent và mô phỏng trạng thái PSP, idempotency, ledger/đối soát; không xử lý thẻ hoặc tiền thật.
- **27 Digital Wallet:** Chuyển số dư giữa hai ví với tính nguyên tử và ledger; dùng đơn vị tiền nhỏ nhất dạng integer, không tích hợp ngân hàng.
- **28 Stock Exchange:** Mô phỏng order book và matching theo quy tắc xác định; giới hạn MVP ở một symbol, không nhận lệnh giao dịch thật.

Các LAB hệ thống dùng mức độ triển khai tăng dần: MVP một tiến trình và lưu trữ đơn giản; phần mở rộng yêu cầu chỉ ra cách chuyển sang nhiều instance, bền vững, chịu lỗi hoặc mở rộng tải. Không bắt buộc cùng một database/broker/cache cho mọi LAB; README mỗi LAB phải nêu lựa chọn tối thiểu, hoặc cho phép người học chọn và ghi trade-off.

## Hành vi và giới hạn

- Nội dung mô tả mục tiêu, yêu cầu, rủi ro và bước thực hiện bằng tiếng Việt; giữ nguyên tên thư mục/file, API identifiers, code, lệnh và technical terms cần thiết.
- Giữ nguyên tài liệu lý thuyết, ảnh và đường dẫn hiện có; không đổi tên thư mục/chương hay chuẩn hóa file hiện tại.
- Tên trường parser nếu có: `Task N:`, `Files`, `Interfaces`, `Traceability`; mã định danh giữ nguyên định dạng `task-N`, `step-*`, `AC-*`, `RISK-*`.
- Cập nhật index bằng relative links có URL-encoding phù hợp cho đường dẫn có khoảng trắng, bao gồm tên thư mục `27.  Digital Wallet` hiện có.
- Không tạo source code của ứng dụng, package manifest, mẫu dữ liệu, Docker setup hay dependency.

## Tiêu chí chấp nhận

- **AC-1:** Có `lab/README.md` và `lab/design.md` cho đủ 28 chương; mọi đường dẫn chapter dùng đúng tên thư mục hiện hành.
- **AC-2:** Chương 01–03 chứa bài tập nền tảng phù hợp, không có `lab/app/`.
- **AC-3:** Chương 04–28 có `lab/app/` trống và README nêu bài toán, chức năng, phi chức năng, ràng buộc, coding tasks, mở rộng và tiêu chí tự đánh giá cụ thể theo topic.
- **AC-4:** `design.md` có các mục trống để người học tự ghi requirements, API, data model, kiến trúc/luồng, trade-offs, failure/recovery và quyết định nâng cấp; không chứa lời giải đã hoàn chỉnh.
- **AC-5:** README gốc có hướng dẫn và liên kết tương đối đến LAB từng chương; mọi liên kết nội bộ được kiểm tra phân biệt hoa thường và tồn tại.
- **AC-6:** Nội dung LAB viết bằng tiếng Việt, giữ nguyên technical terms, code, paths và identifiers theo quy định.
- **AC-7:** Không sửa nội dung lý thuyết/ảnh hiện có và không thêm starter code hoặc dependency.

## Rủi ro

- **RISK-1:** 25 LAB chủ đề rộng có thể lệch độ khó; giảm thiểu bằng MVP một tiến trình và tách yêu cầu production-scale thành phần nâng cấp.
- **RISK-2:** Một số bài như Payment, Wallet, Crawler và Stock Exchange có thể gây hiểu nhầm là hệ thống production; ghi rõ mô phỏng học tập, dữ liệu giả và giới hạn an toàn.
- **RISK-3:** Tên thư mục có khoảng trắng đôi ở chương 27 dễ làm sai link; tạo và kiểm tra link theo tên path thực tế, không âm thầm rename.
- **RISK-4:** Thư mục rỗng không được Git theo dõi; mỗi `app/` chỉ có `.gitkeep` để giữ cấu trúc, không chứa starter code.

## Ngoài phạm vi

- Viết lời giải, kiến trúc hoàn chỉnh hay code mẫu.
- Cài đặt Node.js, Express.js, database, Redis, broker, Docker hoặc CI.
- Sửa/biên tập bản dịch các ghi chú lý thuyết hiện có.
- Đổi tên chapter hoặc chuẩn hóa README hiện hữu.

## Bằng chứng kiểm tra

- Dùng script kiểm tra số lượng và tồn tại file LAB cho 28 chương, xác minh có `app/` đúng chương và các liên kết tương đối đều trỏ tới file tồn tại.
- Rà soát diff để xác nhận chỉ thêm tài liệu LAB và sửa index gốc.
- Repo hiện không có test suite, lint hay typecheck command; kiểm tra cấu trúc/liên kết bằng script không ghi file.

## Trạng thái triển khai

Đã tạo 28 bộ LAB với 56 tài liệu `README.md`/`design.md`; chương 04–28 có `app/.gitkeep`. README gốc liên kết tới đủ 28 LAB. Không thêm source code, dependency hoặc sửa ghi chú lý thuyết. Sai khác so với ý định để `app/` trống là thêm `.gitkeep` để Git theo dõi thư mục.
