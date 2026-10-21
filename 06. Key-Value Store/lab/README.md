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

## Chạy code example

Mã mô phỏng cluster ở `app/store.js`, API Express ở `app/server.js`, test dùng `node:test`.

Chạy từ thư mục `06. Key-Value Store/lab/`:

```bash
npm install
npm test
npm start
```

Cluster mặc định có 5 node in-memory (`n1`–`n5`), `N=3`, `R=2`, `W=2`. Key được định tuyến bằng ring SHA-256 (không dùng virtual node): owner là node đầu tiên theo chiều kim đồng hồ, kèm `N-1` node kế tiếp.

API:

- `PUT /v1/kv/:key` với `{"value": ..., "context": {...}}` — ghi; query tùy chọn `w`, `coordinator`.
- `GET /v1/kv/:key` — đọc; query tùy chọn `r`, `policy=siblings|lww`, `repair=true|false`.
- `DELETE /v1/kv/:key` — ghi tombstone.
- `GET /v1/partition/:key` — preference list của key.
- `GET /v1/debug/replicas/:key` — trạng thái local từng replica (không qua quorum, không repair).
- `GET|PUT /v1/config` — xem/đổi `n`, `r`, `w`; kết quả có `quorumOverlap` (`R+W>N`).
- `GET /v1/nodes`, `POST /v1/nodes/:id/down`, `POST /v1/nodes/:id/up` — mô phỏng replica lỗi.

Semantics chính:

- Mỗi version mang vector clock `{nodeId: counter}`; version bị version khác bao phủ sẽ bị loại, version đồng thời được giữ thành siblings.
- Ghi gửi tới mọi replica đang sống. Nếu số ack nhỏ hơn `W`, API trả 503 nhưng replica đã nhận **không rollback**, nên một write báo lỗi vẫn có thể xuất hiện ở lần đọc sau.
- Đọc lấy `R` replica sống đầu tiên theo preference list; thiếu `R` thì 503. Replica lệch version được read repair (tắt bằng `repair=false`).
- Ghi không có `context` lên node đang giữ siblings trả 409; client đọc siblings rồi ghi lại với `context` đã merge để giải quyết.
- `policy=lww` chọn version có timestamp lớn nhất chỉ ở lúc đọc, không ghi đè siblings đang lưu, và trả `discarded`.
- Key `[A-Za-z0-9._:-]` dài 1–256 ký tự; value JSON tối đa 10 KB.

Các route quản lý node/config chỉ dành cho demo local, chưa có authentication. Kịch bản stale read và conflict nằm trong `design.md`; đó là mô phỏng thuật toán trong một process, không phải kết quả của distributed store thật. Chưa có hinted handoff, anti-entropy, gossip hay dọn tombstone.

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
