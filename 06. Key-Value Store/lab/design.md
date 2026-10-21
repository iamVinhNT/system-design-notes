# Phiếu thiết kế — LAB 06: Key-Value Store

## Scope và semantics

- Key/value format: key `[A-Za-z0-9._:-]` dài 1–256 ký tự; value là JSON bất kỳ, tối đa 10 KB (theo giả định "cặp nhỏ" của chương). Không lưu dữ liệu nhạy cảm.
- Partition strategy: ring SHA-256 (48 bit đầu) trên tên node, không dùng virtual node. Key lấy node đầu tiên theo chiều kim đồng hồ. Với 5 node, phân phối có thể lệch; lab 05 đã đo ảnh hưởng của virtual node.
- Replication factor N: 3 (mặc định), cấu hình 1–số node.
- Read quorum R / write quorum W: R=2, W=2 mặc định; đổi qua `PUT /v1/config` hoặc `?r=`/`?w=` từng request.
- Read/write consistency được kỳ vọng: khi `R+W>N` tập replica đọc và tập replica ghi giao nhau nên đọc thấy write đã thành công. Khi `R+W<=N` chỉ eventual: có thể đọc stale. Đây chưa phải linearizability: không có cơ chế chống write đang dở hay đồng bộ clock.

## API

| Method / route | Input | Output | Status / errors |
| --- | --- | --- | --- |
| PUT `/v1/kv/:key` | `{value, context?}`; query `w`, `coordinator` | `coordinator`, `context` (clock mới), `acks`, `required`, `written` | 200; 400 key/body/query sai; 409 node giữ siblings mà không có `context`; 413 value > 10 KB; 503 thiếu `W` ack hoặc không có coordinator sống |
| GET `/v1/kv/:key` | query `r`, `policy`, `repair` | `value` hoặc `siblings`, `conflict`, `context`, `quorum.responders`, `stale`, `repaired` | 200; 404 chưa có hoặc đã xóa; 400 query sai; 503 thiếu `R` replica sống |
| DELETE `/v1/kv/:key` | body `{context?}`; query `w`, `coordinator` | như PUT, `deleted: true` | như PUT |

Route phụ cho mô phỏng: `GET /v1/partition/:key`, `GET /v1/debug/replicas/:key`, `GET|PUT /v1/config`, `GET /v1/nodes`, `POST /v1/nodes/:id/down|up`. Chỉ dùng local, chưa có authentication.

## Data model và versioning

- Replica record: mỗi node giữ `Map<key, version[]>`; version = `{value, deleted, clock, ts}`.
- Version/timestamp: vector clock `{nodeId: counter}` do coordinator tăng; `ts` chỉ dùng cho policy LWW và có thể inject để test.
- Tombstone: delete là một version mới `{deleted: true, value: null}` với clock mới, nên thay thế đúng value cũ ở replica stale. Chưa dọn tombstone; production cần TTL hoặc GC sau khi replicas đã đồng bộ.
- Conflict representation: nhiều version có clock `concurrent` được giữ lại thành siblings; `GET` trả `conflict: true` và `siblings`.
- Resolution policy: mặc định `siblings` (client phải tự chọn, ghi lại với `context` đã merge). Tùy chọn `lww` chọn `ts` lớn nhất, hòa thì so clock chuỗi chuẩn; chỉ áp dụng khi đọc, không xóa siblings đang lưu, và trả `discarded`. LWW có thể bỏ mất update hợp lệ nếu timestamp lệch, nên không phải mặc định.

## Luồng và failure

- Write flow: chọn coordinator (node sống đầu tiên trong preference list, hoặc `coordinator`). Clock mới = `context` (hoặc clock hiện có ở coordinator) với counter của coordinator tăng thêm 1. Gửi tới mọi replica sống, merge và loại version bị bao phủ. Đếm ack.
- Read flow: lấy `R` replica sống đầu tiên theo preference list (mô phỏng "R replica trả lời trước"), gộp version, loại version bị bao phủ, rồi áp dụng policy.
- Quorum thiếu: `W` thiếu trả 503 kèm `acks`, `required`, `written`; replica đã nhận **giữ write (không rollback)**, nên write báo lỗi vẫn có thể thấy sau đó. `R` thiếu trả 503, không trả dữ liệu từ ít replica hơn đã cấu hình.
- Replica stale: replica bỏ lỡ write khi down. Đọc với `R=1` có thể trúng nó và trả stale (kể cả 404). Đọc với `R=2` thấy version mới và phát hiện stale.
- Read repair / recovery: đọc ghi tập version đã gộp vào responder lệch (`repair=false` để quan sát stale). Chỉ repair các replica đã trả lời. Replica không được đọc vẫn lệch cho tới khi được đọc hoặc có anti-entropy (chưa làm).

### Kịch bản đã chạy qua API

Key `user:1` có preference `[n2, n1, n3]`, config `N=3, R=1, W=2` (`quorumOverlap: false`):

1. `n2` down, `PUT user:1 v2` qua coordinator `n1` → `acks: 2`, `written: [n1, n3]`.
2. `n2` up. `GET ?r=1&repair=false` → 404 `key not found` (responder là `n2`, stale).
3. `GET ?r=2` → `value: v2`, `stale: [n2]`, `repaired: [n2]`; `debug/replicas` cho thấy cả 3 replica cùng clock `{n1: 1}`.
4. `n1` và `n3` down, `PUT` với `W=2` → 503 `acks: 1`, `required: 2`, `written: [n2]`. Write vẫn nằm ở `n2`.

Key `k2` có preference `[n1, n3, n5]`, config `R=3, W=1`:

1. `n3`, `n5` down, `PUT k2 A` → coordinator `n1`, clock `{n1: 1}`, `acks: 1`.
2. `n1` down, `n3`, `n5` up, `PUT k2 B` → coordinator `n3`, clock `{n3: 1}`, `acks: 2`.
3. `n1` up, `GET k2` → `conflict: true`, siblings `A {n1:1}` và `B {n3:1}`, `context: {n1:1, n3:1}`.
4. `GET k2?policy=lww` → `B`, `resolvedBy: lww`, `discarded: 1`; siblings vẫn còn lưu.
5. `PUT k2 C` không `context` → 409. Ghi lại với `context` đã merge thì siblings được giải quyết (có trong test).

## Kiểm tra

- Partition mapping: preference list xác định, N node phân biệt, cùng key cùng kết quả (`store.test.js`).
- Quorum đủ / không đủ: ghi dưới `W` trả 503 nhưng replica đã nhận giữ write; đọc dưới `R` trả 503; `?w=1` cho phép ghi khi chỉ còn một replica.
- Concurrent write: hai coordinator khác nhau ghi khi bị cô lập tạo siblings; context cũ ghi qua coordinator khác cũng tạo sibling.
- Conflict resolution: ghi mù lên siblings bị 409; ghi với `context` merge giải quyết; LWW chỉ resolve lúc đọc.
- Stale replica: `R+W<=N` đọc stale, `R+W>N` thấy write và read repair; tombstone thắng value stale.
- Test HTTP (`server.test.js`) kiểm validation, 413, 503 kèm ack, và luồng conflict qua API.

## Trade-offs và giới hạn

- Consistency / availability: cấu hình thiên về availability (`W=1`) cho phép ghi khi chỉ một replica sống, đổi lại có siblings và stale read. `R+W>N` giảm stale nhưng giảm availability khi nhiều replica down. Không có sloppy quorum hay hinted handoff, nên key mất `W` replica trong preference list sẽ không ghi được.
- In-memory simulation limitations: một process, không có mạng, latency, timeout hay partition thật (chỉ có "node down"). Không có đồng bộ clock, anti-entropy, Merkle tree, gossip, membership hay rebalance khi thêm node. Vector clock theo coordinator có thể phình khi nhiều coordinator và chưa được cắt tỉa. Không rollback write thiếu quorum. Kết quả chỉ minh họa thuật toán, không chứng minh consistency hay disaster recovery.
- Hướng nâng cấp bền vững: lưu mỗi replica bằng WAL + memtable + SSTable (LSM-Tree) với compaction và Bloom filter; thêm hinted handoff để giữ availability khi replica down, anti-entropy bằng Merkle tree, virtual node cho cân bằng tải, TTL dọn tombstone và cắt tỉa vector clock.
