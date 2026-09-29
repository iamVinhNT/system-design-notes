# Phiếu phỏng vấn — LAB 03

## Làm rõ phạm vi

- Câu hỏi đã hỏi: link có hết hạn không; URL gốc trùng có dùng lại short URL không; có cần riêng tư không; có yêu cầu tài khoản không; user có sửa/xóa không; traffic/latency mục tiêu là gì.
- Yêu cầu chức năng: user có tài khoản tạo short URL; mỗi lần tạo sinh mã mới dù URL gốc trùng; redirect short URL tới URL gốc; link tồn tại vĩnh viễn; ai có link đều dùng được.
- Yêu cầu phi chức năng: ưu tiên redirect nhanh và sẵn sàng; traffic và latency mục tiêu chưa biết, cần đo/xác nhận.
- Ngoài phạm vi: alias tùy chỉnh, sửa/xóa link, link hết hạn, quyền riêng tư/kiểm soát truy cập theo link.
- Giả định đã chốt: record trung bình 1 KB; workload mẫu để luyện sizing là 1M URL tạo/ngày, mỗi URL có 100 redirect/ngày, peak factor 3×; đây là giả định, không phải yêu cầu sản phẩm.

## Ước lượng

| Đại lượng | Giả định / công thức | Kết quả |
| --- | --- | --- |
| Read/write ratio | 100M redirects/ngày ÷ 1M creates/ngày | 100:1 |
| Create average/peak QPS | 1M / 86.400; average × 3 | ≈ 12 / 36 QPS |
| Redirect average/peak QPS | 100M / 86.400; average × 3 | ≈ 1.157 / 3.472 QPS |
| Data growth | 1M record/ngày × 1 KB × 365 ngày | ≈ 365 GB/năm; ≈ 1,1 TB/3 năm (thập phân, chưa replication/index/overhead) |

## Thiết kế cấp cao

- API: `POST /api/urls` (authenticated; nhận `long_url`, trả `short_url`); `GET /{short_code}` (redirect tới URL gốc).
- Data model: `UrlMapping(short_code UNIQUE, long_url, user_id, created_at)`; lưu trữ bền vững, không expiration.
- Sơ đồ thành phần: `Client → Load Balancer → App/API → Database`; create gọi ID generator trung tâm; redirect có thể tra cache trước DB khi cần tối ưu.
- Create flow: xác thực user → xin ID duy nhất từ generator trung tâm → Base62 encode thành short code → lưu mapping → trả short URL; không deduplicate theo long URL.
- Redirect flow: nhận short code → tìm mapping (cache rồi DB nếu triển khai cache) → trả redirect; code không tồn tại thì 404.

## Đào sâu

- Vấn đề được chọn: ID generation/collision, redirect latency/cache, replica lag, generator/DB/cache failure, và lạm dụng public URL shortener.
- Phương án: generator trung tâm cấp ID duy nhất; Base62 encode thành code; DB đặt unique constraint trên `short_code`. Ghi mapping vào primary trước, sau đó ghi mapping vào cache trước khi trả short URL để redirect ngay sau create không phụ thuộc replica lag. Redirect cache hit thì trả mapping; cache miss đọc DB, ưu tiên primary khi cần read-after-write hoặc replica lag chưa biết. Chỉ thêm read replica nếu telemetry cho thấy DB đọc là bottleneck.
- Trade-offs: generator trung tâm đơn giản nhưng là dependency tạo link; cần HA và tránh cấp trùng ID. Base62 giúp code ngắn nhưng ID tuần tự dễ đoán; không phù hợp nếu cần privacy/khó đoán (ngoài scope hiện tại). Cache giảm DB reads, nhưng cold cache/cache failure làm DB chịu tải; replica mở rộng đọc nhưng có thể stale. Dùng redirect 302 để tránh client/proxy cache vĩnh viễn; có thể đổi sang 301 nếu chấp nhận cache lâu và không cần linh hoạt.
- Failure modes và recovery: generator lỗi thì create trả lỗi tạm thời, redirect vẫn hoạt động; phục hồi generator có bảo đảm không cấp trùng ID. DB primary lỗi thì không xác nhận create; redirect cache hit vẫn phục vụ được, cache miss trả 503 nếu không có DB đọc được. Cache lỗi thì fallback DB, theo dõi tải và có thể giới hạn traffic để bảo vệ DB. Replica lag/miss thì đọc primary cho mapping mới hoặc retry; code không tồn tại trả 404. URL đầu vào chỉ cho phép scheme `http`/`https`; xác thực user và rate-limit create để giảm abuse.

## Tổng kết và tự đánh giá

- Bottleneck dự đoán: redirect QPS và DB read trước cache; sau đó cache hit ratio/capacity; create path có dependency ID generator và primary DB.
- Điều sẽ làm khác lần sau: xác nhận traffic, latency/SLO, giới hạn URL, analytics và yêu cầu privacy trước khi chọn redirect/cache policy.
- Nội dung chưa kịp xử lý: triển khai generator HA cụ thể; cache sizing/eviction; multi-region; analytics và chống phishing/abuse nâng cao.
- Đánh giá thời gian / giao tiếp / cấu trúc: đạt / cần luyện thêm — đã đi qua làm rõ phạm vi, sizing, API/data model, create/redirect flows, failure modes và trade-offs; traffic/SLO vẫn là giả định cần xác nhận.
