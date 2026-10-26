# Phiếu thiết kế — LAB 01

## Làm rõ phạm vi

- Người dùng và use cases: người dùng đăng bài và đọc danh sách bài viết.
- Chức năng trong phạm vi: lưu bài bền vững; phục vụ truy vấn đọc và ghi.
- Ngoài phạm vi: chọn cloud/provider cụ thể, thiết kế failover tự động, autoscaling, đa data center. Lab chỉ dựng các tầng trong bảng giai đoạn bên dưới ở quy mô một máy.
- Giả định cần xác nhận: lượng đọc lớn hơn ghi; có thể chấp nhận danh sách bài viết trễ vài giây sau khi ghi.

## Ước lượng và tải

- Request mix đọc/ghi: đọc nhiều hơn ghi; chưa có số liệu cụ thể.
- QPS trung bình / đỉnh: chưa biết; cần đo trước khi chọn cấu hình.
- Dung lượng dữ liệu: chưa biết; theo dõi tăng trưởng dữ liệu.
- Metric cần đo: p95 latency, QPS đọc/ghi, CPU/RAM và disk I/O của DB, slow query, replication lag.

## Thiết kế hiện tại

- Sơ đồ request flow: `Client → App → Database` (App và DB ban đầu cùng một server).
- Thành phần: client, application server, database.
- Bottleneck dự đoán: khi DB CPU cao, slow query tăng và p95 latency xấu đi trong khi App còn tài nguyên, database có thể là nút thắt. Kiểm tra query/index trước khi thêm hạ tầng.

## Thiết kế theo giai đoạn

Lab dựng 6 stage chạy được bằng Docker Compose; mỗi stage gồm mọi thứ của stage trước (xem `README.md` để chạy):

| Stage | Topology | Thành phần đã chứng minh bằng `./lab.sh smoke` |
| --- | --- | --- |
| 0 | `App → Postgres` (app 0,5 CPU) | App chạm quota CPU, p95 tăng |
| 1 | `nginx → app1..3 → Postgres`, session trong RAM | Tải chia đều 3 instance; session lệch instance gây 401; chết 1 instance vẫn đọc được |
| 2 | Thêm Redis làm session store | Session dùng được trên mọi instance, qua cả lúc mất một instance |
| 3 | Redis thêm vai trò cache-aside | Hit/miss, invalidate khi ghi, Redis chết thì đọc rơi về DB |
| 4 | Postgres primary + streaming replica | Replication lag làm đọc cũ; tác giả đọc primary; replica chết thì đọc primary |
| 5 | nginx `proxy_cache` cho đọc ẩn danh | `X-Edge-Cache: HIT` không tới app; request có session bypass |

Bảng dưới là phân tích tổng quát của chương Scaling, gồm cả các nấc lab chưa dựng (vertical scaling, sharding, queue, observability đầy đủ).

| Giai đoạn | Tín hiệu kích hoạt | Thay đổi | Lợi ích | Trade-offs / failure modes |
| --- | --- | --- | --- | --- |
| Ban đầu | Chưa có bằng chứng một tầng quá tải | App và DB trên một server | Đơn giản, ít vận hành | Tranh chấp tài nguyên; một server lỗi làm cả dịch vụ ngừng |
| Tách DB và thêm read replica | Đã tối ưu query/index nhưng DB vẫn nghẽn đọc; workload đọc nhiều hơn ghi | Tách DB khỏi App; ghi vào primary, sao chép sang replica và chuyển phần lớn truy vấn đọc sang replica | Cô lập tài nguyên, mở rộng tải đọc độc lập | Replication bất đồng bộ có thể trễ; replica lỗi thì tạm đọc từ primary; replica không giảm tải ghi và không tự bảo đảm failover primary |
| Mở rộng App theo chiều ngang | App CPU cao hoặc p95 latency tăng trong khi DB còn đủ năng lực | Thêm App instances chạy cùng ứng dụng sau load balancer; mọi instance dùng chung DB tier | Chia tải và chịu được lỗi một App instance; scale App độc lập với DB | Thêm chi phí/vận hành; load balancer cần health check; session lưu trong RAM không tự chia sẻ giữa instances |
| Cache feed phổ biến | DB vẫn chịu nhiều truy vấn đọc lặp lại sau khi đã tối ưu query/index và phân tải đọc | Dùng cache-aside cho feed phổ biến với TTL vài giây; bài đăng vẫn ghi vào primary | Giảm truy vấn lặp và latency đọc | Chấp nhận feed có thể cũ vài giây; cache miss/eviction làm tăng tải DB; cache lỗi thì fallback về DB |
| CDN cho nội dung tĩnh | Tải ảnh/tài nguyên tĩnh đáng kể hoặc người dùng phân tán địa lý | Phục vụ ảnh đại diện/ảnh đính kèm qua CDN; giữ API và feed động ở App | Giảm latency tải tài nguyên tĩnh và giảm băng thông/tải App origin | Có chi phí truyền dữ liệu; nội dung thay đổi có thể còn cũ đến khi hết TTL hoặc invalidate; CDN lỗi cần fallback về origin |
| Vertical scaling DB | Sau tối ưu query/index và phân tải đọc, primary thiếu CPU/RAM/IOPS cho tải ghi nhưng còn cấu hình lớn hơn trong giới hạn chi phí | Nâng tài nguyên primary | Cách tăng năng lực đơn giản, không cần chia dữ liệu | Có giới hạn phần cứng/chi phí; vẫn có giới hạn một node; replica không chia tải ghi |
| Sharding DB (chưa triển khai) | Primary đã tối ưu và vertical scaling chạm giới hạn hoặc quá đắt; dung lượng/tải ghi vẫn vượt khả năng một node | Chia dữ liệu lên nhiều DB độc lập cùng schema; định tuyến theo author_id qua shard map | Mở rộng dung lượng và tải ghi theo chiều ngang | App phải định tuyến; feed nhiều tác giả cần fan-out/gộp; nguy cơ hotspot và chi phí vận hành/resharding |
| Message queue cho tác vụ nền (tùy chọn) | Có tác vụ phụ hoặc tải tăng đột biến làm request ghi chậm | Ghi bài vào DB trước; enqueue sự kiện; worker xử lý thumbnail/cập nhật feed sau | Giảm latency request và scale worker độc lập; queue hấp thụ burst | Tác vụ cập nhật trễ; cần retry, dead-letter và idempotency; queue lỗi cần lưu/ xử lý lại sự kiện |
| Observability MVP | Cần biết tầng nào quá tải và phát hiện lỗi trước khi scale | Structured JSON logs; Prometheus thu thập metrics; Grafana hiển thị dashboard | Có dữ liệu cho quyết định scale và điều tra lỗi | Thêm chi phí lưu trữ/vận hành; chưa có tracing hoặc error tracking |

## Data và consistency

- Nguồn dữ liệu chuẩn: primary database; mọi thao tác ghi đi vào primary. Nếu sharding được triển khai, mỗi bài viết thuộc một shard theo shard map.
- Cache strategy: cache-aside cho feed phổ biến, TTL vài giây; CDN chỉ cache ảnh đại diện/ảnh đính kèm, không cache API/feed động.
- Invalidation / stale data: chấp nhận feed cache chậm vài giây; phản hồi đăng bài xác nhận sau khi primary ghi thành công. Replica cũng có thể trễ, nên cần theo dõi lag và không coi cache/replica là nguồn dữ liệu chuẩn. Với ảnh thay đổi, dùng URL có version hoặc invalidate CDN cache. Tác vụ qua queue được xử lý bất đồng bộ, nên có thể trễ hơn request ghi.
- Session strategy: lab dùng session trong RAM ở stage 1 để lộ lỗi, rồi chuyển sang Redis ở stage 2 (TTL 1 giờ). Chọn kho chung thay vì sticky session để một instance chết không làm mất session của người dùng nó đang giữ. Redis không bật persistence, nên mất Redis là mất session.
- Đọc sau ghi (lab, stage 4+): cookie `last_write` giữ 5 giây; trong thời gian đó người ghi đọc từ primary và bỏ qua cache. Người khác có thể thấy dữ liệu cũ tới khi replica bắt kịp hoặc cache hết TTL 30 giây.
- Edge cache (lab, stage 5): nginx cache 5 giây cho request ẩn danh; request có cookie `sid` hoặc `last_write` không đọc hay ghi cache chung. CDN trong chương cache ảnh/tài nguyên tĩnh; lab dùng nginx để cache cả API đọc công khai, một đánh đổi chỉ chấp nhận được với dữ liệu công khai và cũ vài giây.

## Failure và recovery

- Thành phần lỗi: read replica, cache, CDN hoặc message queue.
- Ảnh hưởng: replica lỗi thì primary nhận thêm tải đọc; cache lỗi thì DB nhận truy vấn không còn cache phục vụ; CDN lỗi thì tài nguyên tĩnh cần lấy từ origin; queue lỗi thì tác vụ nền bị trì hoãn.
- Fallback / phục hồi: tạm chuyển đọc về primary hoặc replica khỏe khác khi replica lỗi; khi cache lỗi, đọc từ DB và theo dõi tải để tránh quá tải. CDN lỗi thì fallback về origin nếu origin còn khả năng phục vụ. Queue cần retry, dead-letter và replay an toàn nhờ idempotency. Theo dõi replication lag và khôi phục/thay replica lỗi. Primary failure cần quy trình failover riêng.

## Quyết định và tự đánh giá

- Trade-offs chính: replica/cache/CDN giúp mở rộng đọc và phục vụ nội dung tĩnh; vertical scaling giữ thiết kế đơn giản hơn; sharding chỉ tăng chiều ngang khi một primary không còn đủ, nhưng tăng độ phức tạp định tuyến và truy vấn phân tán.
- Metric xác nhận thiết kế: DB CPU/latency, slow query và truy vấn lặp giảm; replication lag và tuổi dữ liệu cache nằm trong mức chấp nhận; p95 latency đọc cải thiện; theo dõi tài nguyên và write QPS của primary để quyết định vertical scaling hay sharding. Dashboard MVP dùng Prometheus/Grafana; log ứng dụng ở dạng JSON.
- Quan sát từ lab: thêm app instance (stage 1) chỉ tăng RPS tới khi DB chạm trần; replica (stage 4) cùng cỡ với primary nên không tăng throughput đọc, chỉ tách đọc nặng khỏi primary để ghi ít bị chen (cải thiện nhỏ, có nhiễu); throughput đọc chỉ tăng khi thêm nhiều replica.
- Câu hỏi còn mở: QPS và tỷ lệ đọc/ghi thực tế; ngưỡng replication lag; chính sách failover primary; ngưỡng chi phí/công suất cho vertical scaling; shard map và xử lý hotspot nếu cần sharding; retention và cảnh báo metrics.
- Tiêu chí tự chấm: đạt / cần làm lại — đạt khi có metric kích hoạt, nêu rõ đường đi đọc/ghi, replication lag và fallback.
