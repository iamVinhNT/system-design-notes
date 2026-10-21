# LAB 05: Mô phỏng Consistent Hashing

## Mục tiêu

Triển khai mô phỏng hash ring để định tuyến key tới node, sau đó đo mức thay đổi phân phối khi node thêm hoặc rời cụm.

## Đề bài

Một dịch vụ cache cần phân phối key tới nhiều node. Khi node thay đổi, muốn chỉ remap một phần key thay vì phân phối lại toàn bộ. Hãy thiết kế thư viện nhỏ và API Express.js để quản lý node và truy vấn node chịu trách nhiệm cho key.

## Yêu cầu chức năng

- Thêm/xóa physical node.
- Tạo nhiều virtual nodes cho mỗi physical node.
- Tìm node kế tiếp theo chiều kim đồng hồ cho key.
- Trả danh sách replica kế tiếp, không lặp physical node.
- Cung cấp endpoint để tra node sở hữu key và xem trạng thái node.

## Phi chức năng và ràng buộc

- MVP chạy một process; không cần lưu trạng thái phân tán.
- Chọn hash function ổn định, không dùng hash ngẫu nhiên theo process.
- Giải thích collision trên ring và cách xử lý.
- Đo phân phối trên tập key tổng hợp; không tuyên bố benchmark đại diện production.

## Coding tasks

1. Xác định biểu diễn ring và mapping virtual-node tới physical-node.
2. Viết thao tác add/remove và lookup key.
3. Thêm replica lookup với distinct physical nodes.
4. Tạo route Express.js nhận key, trả node và thống kê phân phối.
5. So sánh số key bị remap khi thay đổi node với modulo hashing đơn giản.

## Chạy code example

Mã nguồn ring ở `app/ring.js`, API Express ở `app/server.js`, test dùng `node:test`.

Chạy từ thư mục `05. Consistent Hashing/lab/`:

```bash
npm install
npm test
npm start
```

API mẫu:

- `GET /api/owner?key=...` — node sở hữu key.
- `GET /api/replicas?key=...&count=3` — các physical node khác nhau theo thứ tự ring.
- `GET /api/nodes` — danh sách node.
- `POST /api/nodes` với `{"name":"cache-d"}` — thêm node.
- `DELETE /api/nodes/:name` — xóa node.
- `GET /api/stats?keys=10000` — phân phối key hiện tại và remapping khi thêm node so với modulo.

Ring dùng SHA-256 ổn định và mặc định 100 virtual nodes/physical node. Node management routes chỉ dành cho demo local; chưa có authentication. Benchmark tổng hợp đo tính toán trong process, không đại diện latency hay workload production.

## Bài nâng cấp

- Thay đổi virtual-node count và đo độ lệch phân phối.
- Mô phỏng node weights hoặc vùng failure domain.

## Tiêu chí tự đánh giá

- [ ] Cùng key/node set luôn cho cùng owner qua các lần chạy.
- [ ] Thêm hoặc xóa node làm thay đổi một phần hợp lý của key mapping.
- [ ] Replica không trả cùng physical node nhiều lần.
- [ ] Node/ring rỗng có hành vi xác định.
- [ ] Đo được phân phối và remapping bằng dữ liệu lặp lại được.
- [ ] Giải thích được điểm khác với modulo hashing.
