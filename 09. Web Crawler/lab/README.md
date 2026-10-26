# LAB 09: Web Crawler có kiểm soát

## Mục tiêu

Thiết kế crawler giới hạn domain, lịch truy cập và độ sâu; thực hành URL frontier, deduplication, retry và tôn trọng giới hạn nguồn.

## Đề bài

Xây crawler nhỏ để thu thập các trang trong một website thử nghiệm được cho phép. Crawler bắt đầu từ một URL seed, trích xuất link, lưu kết quả và không làm quá tải host.

## Yêu cầu chức năng

- Nhận seed URL và cấu hình max depth / max pages.
- Chuẩn hóa URL, loại fragment và deduplicate.
- Chỉ crawl host nằm trong allowlist; kiểm tra redirect không vượt phạm vi.
- Lập lịch request theo host với politeness delay.
- Lưu trạng thái queued/fetching/done/failed và nội dung metadata.

## Phi chức năng và ràng buộc

- Chỉ dùng website local/lab hoặc nguồn được cho phép; không crawl tùy tiện Internet.
- Timeout request, giới hạn response size và concurrency.
- Chặn URL trỏ tới localhost/private network khi input không được kiểm soát; không để crawler thành SSRF proxy.
- MVP có thể chạy một process; không yêu cầu distributed frontier.

## Coding tasks

1. Tạo URL validation, normalization và allowlist.
2. Viết frontier queue cùng tập visited/dedup.
3. Fetch trang với timeout/size limit và trích link giới hạn.
4. Lập lịch politeness theo host và giới hạn max pages/depth.
5. Thêm API Express.js để tạo job, xem trạng thái và kết quả.
6. Test URL ngoài allowlist, redirect ngoài domain, duplicate, timeout và response quá lớn.

## Chạy code example

Mã nằm trong `app/`: `url.js` (chuẩn hóa, allowlist), `fetcher.js` (fetch có SSRF guard, timeout, giới hạn size), `robots.js`, `html.js` (trích link), `frontier.js` (dedup và lịch theo host), `crawler.js` (vòng chạy), `server.js` (API Express), `lab-site.js` (website thử nghiệm cục bộ). Test dùng `node:test`: phần lập lịch chạy trên đồng hồ ảo, phần fetch và tích hợp chạy trên socket thật tới lab site ở `127.0.0.1`.

Chạy từ thư mục `09. Web Crawler/lab/`:

```bash
npm install
npm test
```

Demo thủ công (hai terminal):

```bash
npm run site        # lab site ở http://127.0.0.1:8080
CRAWLER_ALLOWED_HOSTS=127.0.0.1:8080 CRAWLER_ALLOW_PRIVATE=1 npm start
```

```bash
ID=$(curl -s -XPOST localhost:3000/api/jobs -H 'content-type: application/json' \
  -d '{"seed":"http://127.0.0.1:8080/","maxDepth":3,"maxPages":60,"delayMs":500}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')
curl -s localhost:3000/api/jobs/$ID
curl -s "localhost:3000/api/jobs/$ID/pages?state=failed"
```

API:

- `POST /api/jobs` với `{seed, allowedHosts?, maxDepth?, maxPages?, delayMs?}` — tạo job, trả 202. Mặc định `maxDepth=2`, `maxPages=50`, `delayMs=1000`; giới hạn trần `maxDepth≤5`, `maxPages≤500`, `delayMs` từ 500 đến 60.000.
- `GET /api/jobs/:id` — trạng thái job, số trang theo trạng thái, `accepted`, `duplicateUrls`, `skippedMaxPages`, `requests`.
- `GET /api/jobs/:id/pages?state=&limit=&offset=` — từng trang: `state` (`queued`/`fetching`/`done`/`failed`), `status`, `attempts`, `error`, `title`, `contentHash`, `duplicateOf`, `redirectTo`, số link tìm thấy/đưa vào hàng đợi/ngoài phạm vi/bị loại.
- `DELETE /api/jobs/:id` — hủy: ngừng gửi request mới, request đang chạy nốt trong giới hạn timeout.

Quy tắc an toàn và lịch:

- **Hai lớp allowlist.** Operator đặt `CRAWLER_ALLOWED_HOSTS` (dạng `host[:port]`); không đặt thì mọi job bị từ chối (403). Mỗi job chỉ được chọn tập con. Allowlist khớp chính xác host và port, không ngầm gồm subdomain.
- **SSRF.** Địa chỉ loopback, private, link-local (kể cả metadata `169.254.169.254`), CGNAT, multicast, dải tài liệu và IPv6 tương đương đều bị chặn. Tên miền được resolve một lần, kiểm tra mọi địa chỉ trả về rồi kết nối đúng địa chỉ đã kiểm (chống DNS rebinding). IP literal và dạng số thập phân (`2130706433`) cũng bị chặn. Công tắc `CRAWLER_ALLOW_PRIVATE=1` chỉ dành cho operator chạy lab site; request API không đặt được.
- **Redirect không được follow inline.** Đích redirect được chuẩn hóa, kiểm allowlist, dedup, tính vào ngân sách trang và xếp lịch theo host như một link thường. Ra ngoài allowlist thì trang gốc `failed: REDIRECT_OUT_OF_SCOPE`. Vòng lặp kết thúc nhờ dedup; chuỗi dài bị cắt bởi `maxRedirects=5`.
- **Politeness.** Mỗi host tối đa một request tại một thời điểm và hai request liên tiếp cách nhau ít nhất `delayMs` tính từ lúc request trước kết thúc. `Crawl-delay` trong robots.txt được tôn trọng (trần 30 giây). Retry dùng backoff `delayMs × 2^lần`.
- **Giới hạn.** Timeout tổng 5 giây mỗi request, response tối đa 512 KB (cả `Content-Length` lẫn đo luồng), concurrency 2, tối đa 100 link mỗi trang, URL tối đa 2048 ký tự, chỉ nhận `text/html`, không giải nén (`Accept-Encoding: identity`).
- **Lỗi và retry.** Timeout, lỗi mạng, 429 và 5xx được retry tối đa 2 lần. 4xx, quá lớn, không phải HTML, bị chặn SSRF/robots/scope không retry. Lỗi đều có `error` và `attempts` trong bản ghi trang.
- **robots.txt.** Lấy một lần mỗi host mỗi job qua cùng fetcher. Hỗ trợ `Disallow` (kể cả `*` và `$`) và `Crawl-delay`; bỏ qua `Allow` nên chỉ có thể chặt hơn file yêu cầu. 404 là cho phép hết; 5xx, timeout hoặc lỗi mạng là cấm hết.

Giới hạn: chỉ một job chạy tại một thời điểm (giữ politeness đơn giản); frontier và kết quả nằm trong memory nên mất khi restart; chưa có ưu tiên URL, nhiều worker phân tán hay lưu bền vững; trích link bằng regex bỏ qua `<base>`, JavaScript và comment; chưa nhận diện nội dung gần trùng (chỉ trùng byte-by-byte qua SHA-256); các route chưa có authentication. Chỉ chạy với website lab hoặc nguồn được phép.

## Bài nâng cấp

- Ưu tiên URL theo depth/freshness.
- Mô phỏng nhiều worker nhưng vẫn giữ per-host politeness.
- Thiết kế persistence/recovery cho frontier sau process restart.

## Tiêu chí tự đánh giá

- [ ] Crawler không vượt host allowlist kể cả khi redirect.
- [ ] URL trùng chỉ fetch theo policy đã chọn.
- [ ] Có giới hạn page count, depth, concurrency, response size và timeout.
- [ ] Per-host politeness được giữ khi xử lý nhiều URL.
- [ ] Lỗi fetch có trạng thái và retry policy giới hạn.
- [ ] Không cho phép SSRF tới địa chỉ nội bộ từ URL tùy ý.
