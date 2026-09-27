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

## Bài nâng cấp

- Thay đổi virtual-node count và đo độ lệch phân phối.
- Xử lý hash collision xác định, thêm kiểm tra invariant cho ring rỗng.
- Mô phỏng node weights hoặc vùng failure domain.

## Tiêu chí tự đánh giá

- [ ] Cùng key/node set luôn cho cùng owner qua các lần chạy.
- [ ] Thêm hoặc xóa node làm thay đổi một phần hợp lý của key mapping.
- [ ] Replica không trả cùng physical node nhiều lần.
- [ ] Node/ring rỗng có hành vi xác định.
- [ ] Đo được phân phối và remapping bằng dữ liệu lặp lại được.
- [ ] Giải thích được điểm khác với modulo hashing.
