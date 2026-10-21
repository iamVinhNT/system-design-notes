# Phiếu thiết kế — LAB 05: Consistent Hashing

## Mô hình

- Hash function và input encoding: SHA-256 trên UTF-8; key hash input `key:${key}`, virtual-node input `vnode:${node}#${index}`. Digest hex được so sánh lexicographic, tương đương thứ tự số unsigned cùng độ dài.
- Ring representation: mảng entry `{position, vnode, node}` đã sort tăng dần; lookup dùng binary search lower-bound rồi wrap về đầu ring.
- Virtual node naming: `${physicalNode}#${index}`, mặc định 100 virtual nodes mỗi physical node.
- Collision handling: cùng position được sort theo tên virtual node để tie-break ổn định. Collision không làm mất entry; tuy nhiên nhiều vnode cùng vị trí có thể tạo skew cục bộ.

## Interfaces

| Operation | Input | Output | Error cases |
| --- | --- | --- | --- |
| Add node | Tên physical node không rỗng | Thêm các virtual nodes; trả ring qua lookup sau đó | Tên sai kiểu/rỗng hoặc node trùng thì error |
| Remove node | Tên physical node | `true` nếu xóa; `false` nếu không tồn tại | Không có |
| Lookup key | String key | Owner physical node, hoặc `null` nếu ring rỗng | Key hash theo chuỗi; chưa ép kiểu API ở thư viện |
| Lookup replicas | String key, count | Danh sách node theo clockwise, distinct physical nodes, tối đa node count | Count không nguyên hoặc âm thì error |

## Invariants

- Ring rỗng: lookup trả `null`, replica lookup trả `[]`.
- Physical node mapping: mọi vnode trỏ về đúng physical node; remove xóa tất cả vnode của node.
- Replica distinctness: duyệt clockwise qua vnode nhưng mỗi physical node chỉ xuất hiện một lần.
- Determinism: hash SHA-256, encoding và tie-break ổn định; cùng node set/key cho cùng owner.

## Đo lường

| Node count | Virtual nodes/node | Key count | Ownership distribution | Remapping on add |
| --- | --- | --- | --- | --- |
| 3 → 4 (node thêm: `sample-added-node`) | 100 | 20.000 key `sample-0...sample-19999` | 3 node: max 6.910 / min 6.385 key (max/min ≈ 1,08) | Consistent: 5.113 (25,57%); modulo: 14.949 (74,75%) |

`GET /api/stats` dùng key tổng hợp `sample-0...sample-N`; báo count/max/min và remapping ratio. Đây là mô phỏng thuật toán, không phải benchmark production.

## API Express.js

- Route: `GET /api/owner`, `GET /api/replicas`, `GET /api/nodes`, `POST /api/nodes`, `DELETE /api/nodes/:name`, `GET /api/stats`.
- Request / response: query `key`, optional `count`; add nhận JSON `{ "name": "cache-d" }`; response JSON chứa owner/list/distribution/remapping.
- Validation: key bắt buộc; count nguyên 1–100; stats keys nguyên 1–1.000.000; node name 1–128 ký tự; duplicate trả 409, node chưa tồn tại khi delete trả 404, lookup empty ring trả 503.

## Failure, trade-offs và mở rộng

- Node thêm/xóa trong lúc lookup: single-process JavaScript thay ring đồng bộ trong cùng event loop, một lookup không quan sát trạng thái nửa chừng; mỗi process vẫn cần cùng config/node membership ngoài phạm vi MVP.
- Hash collision: không overwrite; sort các vnode trùng position theo tên để kết quả xác định.
- Weight/failure domain: chưa hỗ trợ; tăng vnode count có thể cải thiện phân phối nhưng tăng ring size và chi phí rebuild.
- Mức độ phù hợp khi node count lớn: lookup O(log V), replica lookup tối đa O(V), add/remove hiện rebuild sort O(V log V); hợp mô phỏng/cluster vừa. Production lớn cần cập nhật ring hiệu quả, membership propagation, weights và failure-domain aware replicas.
- So với modulo hashing: modulo phân phối lại phần lớn key khi N đổi; consistent hashing chỉ remap khoảng vùng ring do vnode mới/xóa chiếm, nhưng cân bằng phụ thuộc số virtual nodes.
