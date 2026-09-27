# LAB 26: Payment System mô phỏng

## Mục tiêu

Thiết kế payment lifecycle, idempotency, ledger và đối soát; triển khai API MVP bằng Node.js/Express.js với PSP giả lập, không xử lý tiền/thẻ thật.

## Đề bài

Merchant tạo payment cho order. Hệ thống gọi provider simulator, nhận success/failure/timeout giả lập, ghi nhận trạng thái và tạo ledger entries khi có kết quả xác nhận. Webhook có thể lặp hoặc đến sai thứ tự.

## Yêu cầu chức năng

- Tạo payment intent với amount integer minor units và currency.
- Idempotency key ngăn tạo/capture payment lặp.
- State machine xác định: pending, processing, succeeded, failed, refunded nếu chọn.
- Ghi ledger entries cân bằng cho movement mô phỏng.
- Đối chiếu transaction nội bộ với provider simulator.

## Phi chức năng và ràng buộc

- Không nhập/lưu card data, không kết nối PSP/bank thật, không dùng tiền thật.
- Dùng dữ liệu giả và provider simulator xác định.
- Mô tả authorization boundary; không log dữ liệu nhạy cảm.
- Không dùng floating point cho monetary amount.

## Coding tasks

1. Thiết kế payment/order/idempotency/ledger model và state transitions.
2. Tạo Express.js create/status/refund API (nếu refund trong scope).
3. Mô phỏng PSP response và webhook duplicate/out-of-order.
4. Ghi ledger debit/credit cân bằng; không sửa lịch sử ledger bằng update tùy tiện.
5. Tạo reconciliation report tìm missing/mismatched transaction.
6. Kiểm tra timeout/unknown result, retry, duplicate webhook và amount boundary.

## Bài nâng cấp

- Thiết kế transactional outbox và asynchronous executor.
- Thêm payout flow giả lập và settlement batch.
- Viết invariant ledger và quy trình điều tra discrepancy.

## Tiêu chí tự đánh giá

- [ ] Idempotency cùng key trả cùng kết quả, không tạo payment thứ hai.
- [ ] State transition bất hợp lệ bị từ chối.
- [ ] Amount là integer minor units, currency rõ ràng.
- [ ] Ledger entry cân bằng và append-only theo thiết kế.
- [ ] Unknown PSP outcome được reconcile thay vì retry mù.
- [ ] Không xử lý card/tiền thật hoặc lưu secrets.
