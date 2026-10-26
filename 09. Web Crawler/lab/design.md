# Phiếu thiết kế — LAB 09: Web Crawler

## Job scope

- Seed URL: một URL `http`/`https` tuyệt đối, được chuẩn hóa. Host của seed phải nằm trong allowlist của job, và allowlist của job phải nằm trong allowlist của operator.
- Host allowlist: danh sách `host[:port]` viết thường, khớp chính xác (không ngầm gồm subdomain hay port khác). Operator rỗng thì từ chối mọi job. Redirect và link ra ngoài allowlist không bao giờ được fetch.
- Max pages / max depth: mặc định 50 trang và độ sâu 2; trần 500 trang và độ sâu 5. `maxPages` giới hạn số URL được chấp nhận vào frontier nên hàng đợi không phình quá mức; seed có depth 0.
- Tần suất theo host: `delayMs` mặc định 1000 ms (tối thiểu 500 ms qua API), tính từ lúc request trước kết thúc; `Crawl-delay` của robots.txt có thể nâng lên (trần 30 giây).
- Trạng thái job: `queued` → `running` → `completed` | `cancelling` → `cancelled` | `failed` (lỗi nội bộ). Trạng thái trang: `queued` → `fetching` → `done` | `failed`; trang được retry quay lại `queued`.

## API

| Route | Input | Output | Validation |
| --- | --- | --- | --- |
| POST `/api/jobs` | `{seed, allowedHosts?, maxDepth?, maxPages?, delayMs?}` | 202 trạng thái job | 400 body/seed/số sai; 403 host ngoài allowlist của operator; 409 đang có job chạy |
| GET `/api/jobs/:id` | id | job, `counts`, `accepted`, `duplicateUrls`, `skippedMaxPages`, `requests` | 404 |
| GET `/api/jobs/:id/pages` | `state`, `limit` 1–200, `offset` | `{total, pages[]}` | 400 tham số sai; 404 |
| DELETE `/api/jobs/:id` | id | 202 khi đang hủy, 200 nếu đã kết thúc | 404 |

Chỉ một job chạy tại một thời điểm để bảo đảm politeness theo host mà không cần bộ lập lịch dùng chung giữa các job. Operator đặt `CRAWLER_ALLOWED_HOSTS` và `CRAWLER_ALLOW_PRIVATE`; request không đặt được hai giá trị này. Route chưa có authentication.

## URL frontier

- URL normalization: bỏ fragment, scheme/host viết thường, bỏ port mặc định, resolve link tương đối theo URL của trang, sắp xếp tham số query (`?b=2&a=1` và `?a=1&b=2` là một). Từ chối scheme khác `http`/`https`, URL có credentials và URL dài quá 2048 ký tự. Sắp xếp query đổi mã hóa query; chấp nhận được cho crawler nhưng không dùng cho proxy.
- Dedup key: URL đã chuẩn hóa. Tập `seen` chứa mọi URL từng được chấp nhận (đang chờ, đang fetch hoặc xong), nên mỗi URL fetch tối đa một lần theo policy (retry là ngoại lệ có giới hạn). Ngoài ra, hai trang có cùng SHA-256 nội dung được ghi `duplicateOf` và không đi theo link của bản trùng.
- Queue / priority: một hàng FIFO cho mỗi host. FIFO trong host cho thứ tự BFS theo độ sâu; không dùng DFS vì độ sâu có thể rất lớn. Chưa có ưu tiên theo độ quan trọng/freshness. Retry được đưa lên đầu hàng đợi của host sau thời gian backoff.
- Per-host schedule: host chỉ được cấp URL khi đang rảnh (không có request nào) và `nextAt` đã tới; sau mỗi request `nextAt = lúc kết thúc + max(delay của host, backoff)`. Khi nhiều host sẵn sàng, chọn host chờ lâu nhất.
- Visited state: bản ghi mỗi trang trong `Map<url, record>` gồm `state`, `depth`, `attempts`, `status`, `error`, `title`, `contentHash`, `bytes`, `duplicateOf`, `redirectTo` và số link (tìm thấy / đưa vào hàng đợi / ngoài phạm vi / bị loại). Chỉ lưu metadata, không lưu nội dung HTML.

## Fetch pipeline

- Timeout / size limit: một deadline tổng 5 giây cho cả request (chống server nhỏ giọt từng byte); response tối đa 512 KB, kiểm bằng `Content-Length` trước và đếm byte khi đọc; robots.txt tối đa 64 KB. Chỉ nhận `text/html` hoặc `application/xhtml+xml`; không đọc body của lỗi 4xx/5xx; yêu cầu `identity` nên không có zip bomb.
- Redirect policy: không follow tự động. 3xx trả về cho crawler, crawler chuẩn hóa `Location`, kiểm allowlist, rồi đưa đích vào frontier như link thường (cùng độ sâu, `maxRedirects` 5). Nhờ vậy đích redirect cũng được dedup, tính ngân sách, kiểm SSRF khi fetch và đi qua lịch politeness của host đích. Ra ngoài allowlist thì `failed: REDIRECT_OUT_OF_SCOPE`.
- Link extraction: regex trên thẻ `<a href>`, chịu được HTML hỏng và các kiểu dấu nháy, bỏ `rel=nofollow`, giải mã `&amp;`, tối đa 100 link mỗi trang. Bỏ qua `<base>`, JavaScript, form và comment. Link không hợp lệ hoặc scheme không hỗ trợ tính vào `linksRejected`; link ngoài allowlist tính vào `linksExternal`.
- Retry / backoff: timeout, lỗi mạng, 429 và 5xx retry tối đa 2 lần, chờ `delayMs × 2^lần` (2×, 4× delay) trước lần tiếp theo của host đó. 4xx, `TOO_LARGE`, `NOT_HTML`, `SSRF_BLOCKED`, `ROBOTS_DISALLOWED`, `REDIRECT_OUT_OF_SCOPE` không retry. Hết lượt thì `failed` kèm `error` và `attempts`.
- Nội dung lưu lại: metadata (title, loại nội dung, số byte, hash, quan hệ trùng/redirect), không lưu body.

## Security và failure handling

- SSRF protection: mỗi request đi qua `guardedLookup`: resolve tên một lần, nếu bất kỳ địa chỉ nào thuộc dải loopback/private/link-local/CGNAT/multicast/reserved/documentation (IPv4, IPv6 và IPv4-mapped) thì từ chối, rồi kết nối đúng địa chỉ đã kiểm (không resolve lần hai nên không có cửa sổ DNS rebinding). IP literal không qua lookup nên được kiểm riêng; dạng số thập phân như `2130706433` được URL parser đổi thành `127.0.0.1` trước khi kiểm. Công tắc cho phép mạng private là cấu hình của operator, chỉ dùng để chạy lab site, và allowlist một mình không mở được mạng private (có test).
- Allowlist enforcement sau redirect: đích redirect phải qua `isAllowedHost` trước khi vào frontier và qua SSRF guard khi fetch. Link trong trang chịu cùng kiểm tra.
- Host lỗi / timeout: lỗi được ghi theo trang, retry có giới hạn và backoff; một host chậm chỉ chiếm một worker tại một thời điểm vì chỉ một request mỗi host. robots.txt không đọc được (5xx/timeout/lỗi mạng) thì coi như cấm hết trong job đó; 404 coi như cho phép hết. Nếu robots.txt bị SSRF guard chặn, lỗi `SSRF_BLOCKED` được báo thẳng ở trang.
- Process restart: frontier và kết quả nằm trong memory nên mất khi restart; job đang chạy không khôi phục được. Hướng bền vững: ghi frontier (URL, depth, state, attempts, `nextAt`) và tập `seen` vào store bền (ví dụ DB hoặc log append-only), khi khởi động đưa trang `fetching` về `queued`, và lưu trạng thái robots/delay theo host.

## Giới hạn và nâng cấp

- Concurrency: 2 request song song mặc định (theo host khác nhau); mỗi host một request. Vòng lặp chạy trong một event loop nên phù hợp mô phỏng, không phải throughput lớn.
- Politeness invariant: với mỗi host, không bao giờ có hai request chồng nhau và khoảng cách giữa hai request liên tiếp ≥ `delayMs` (hoặc `Crawl-delay`) tính từ lúc request trước kết thúc. Invariant được kiểm bằng đồng hồ ảo ở test đơn vị và bằng log thời gian thật của lab site (4 worker, một host) ở test tích hợp. Kết quả này đúng trong một process và một job; nhiều process hoặc nhiều job cùng host cần bộ lập lịch dùng chung.
- Distributed frontier: băm host (consistent hashing, xem lab 05) để mỗi node sở hữu một tập host và chịu trách nhiệm politeness cho chúng; tách hàng đợi ưu tiên khỏi hàng đợi theo host như trong chương; Bloom filter hoặc store dùng chung cho `seen`; lưu bền frontier để phục hồi sau restart; ưu tiên URL theo độ sâu và freshness; nhận diện nội dung gần trùng thay vì chỉ trùng byte.
