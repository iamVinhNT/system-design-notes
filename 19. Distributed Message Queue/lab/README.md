# LAB 19: Distributed Message Queue

## Mục tiêu

Xây message queue MVP trong một process Express.js để hiểu topic, partition, consumer offset, acknowledgement và retry; phân biệt rõ mô phỏng với broker phân tán thật.

## Đề bài

Producer gửi event vào topic. Consumer group đọc event theo partition, commit offset và có thể khởi động lại từ offset gần nhất. Message lỗi có retry giới hạn.

## Yêu cầu chức năng

- Tạo topic/partition và publish message có key.
- Định tuyến message tới partition xác định.
- Consumer group poll message, ack/commit offset.
- Mô phỏng crash trước/sau commit và redelivery.
- Dead-letter hoặc trạng thái lỗi sau retry exhaustion.

## Ràng buộc

- MVP một process với storage đơn giản, không cần broker cluster.
- Ghi semantics delivery (at-most-once/at-least-once) và nơi có duplicate.
- Không tuyên bố durability nếu lưu in-memory.
- Thứ tự chỉ được đảm bảo trong phạm vi đã chọn, ví dụ một partition.

## Coding tasks

1. Xác định message, partition log, consumer group và offset model.
2. Tạo API Express.js cho publish, poll, commit và trạng thái topic.
3. Mô phỏng consumer failure và redelivery.
4. Thêm retry/DLQ policy, idempotency key nếu consumer xử lý side effect.
5. Kiểm tra offset monotonicity, duplicate delivery và partition ordering.

## Bài nâng cấp

- Thiết kế replication, ISR, WAL và leader failover trên giấy.
- So sánh push với pull consumer.
- Mô tả consumer group rebalance và partition count trade-off.

## Tiêu chí tự đánh giá

- [ ] Message key định tuyến ổn định tới partition.
- [ ] Offset chỉ tiến theo semantics đã chọn.
- [ ] Crash trước commit dẫn tới hành vi redelivery xác định.
- [ ] Retry có giới hạn và message lỗi không biến mất âm thầm.
- [ ] Ordering guarantee được mô tả chính xác.
- [ ] Phân biệt được mô hình một process với distributed broker.
