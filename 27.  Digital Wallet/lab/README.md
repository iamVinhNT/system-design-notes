# LAB 27: Digital Wallet

## Mục tiêu

Thiết kế chuyển tiền giữa hai ví với tính nguyên tử, ledger và idempotency; triển khai mô phỏng bằng Node.js/Express.js, không kết nối ngân hàng.

## Đề bài

Người dùng chuyển số dư từ ví A sang ví B. Hai request đồng thời có thể tiêu cùng số dư; retry không được ghi nợ/ghi có lần hai. Balance được biểu diễn bằng số nguyên đơn vị nhỏ nhất của một currency.

## Yêu cầu chức năng

- Tạo ví giả lập và truy vấn balance.
- Chuyển tiền với sender, recipient, amount, currency và idempotency key.
- Ghi debit/credit ledger entries trong cùng transaction/atomic boundary đã chọn.
- Từ chối insufficient funds, currency mismatch và amount không hợp lệ.
- Rebuild/check balance từ ledger để phát hiện sai lệch.

## Phi chức năng và ràng buộc

- Chỉ dùng dữ liệu giả; không nhận tiền thật, không tích hợp bank/PSP.
- Dùng integer minor units, không floating point.
- Chạy concurrency test để xác nhận không overspend.
- Mô tả serialization/locking và giới hạn của storage MVP.

## Coding tasks

1. Thiết kế wallet, transfer, idempotency record và append-only ledger.
2. Tạo Express.js balance/transfer/history API.
3. Chọn transaction/locking strategy cho debit và credit nguyên tử.
4. Kiểm tra hai chuyển khoản đồng thời vượt balance, duplicate request và process error giữa chừng.
5. Viết reconciliation/replay kiểm tra balance từ ledger.

## Bài nâng cấp

- Mô hình hóa state machine, event sourcing và CQRS trên giấy.
- Phân tích Raft/replication và quorum; không tự cài Raft cho MVP.
- So sánh Saga/2PC khi chuyển qua nhiều service.

## Tiêu chí tự đánh giá

- [ ] Không thể overspend khi request đồng thời.
- [ ] Debit và credit cùng commit hoặc cùng rollback.
- [ ] Retry cùng idempotency key không chuyển tiền lần hai.
- [ ] Balance khớp tổng ledger entries.
- [ ] Amount/currency validate nghiêm ngặt.
- [ ] Không dùng bank integration hoặc tiền thật.
