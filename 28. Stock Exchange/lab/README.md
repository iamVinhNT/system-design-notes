# LAB 28: Stock Exchange Matching Engine

## Mục tiêu

Mô phỏng order book và deterministic matching bằng Node.js/Express.js; luyện quy tắc price-time priority, order lifecycle và replay.

## Đề bài

Một exchange mô phỏng một symbol. Client gửi limit order buy/sell; engine khớp lệnh theo price-time priority, cập nhật phần còn lại trong order book và phát trade record.

## Yêu cầu chức năng

- Submit/cancel limit order.
- Validate side, price integer ticks và quantity dương.
- Match crossing orders theo price-time priority.
- Xử lý partial fill, remaining quantity và cancel.
- Tạo trade record bất biến với sequence tăng dần.

## Phi chức năng và ràng buộc

- Chỉ một symbol, một process, dữ liệu giả; không nhận lệnh/giao dịch thật.
- Matching deterministic: cùng input sequence phải tạo cùng order book/trades.
- Quy định behavior khi cùng price/time và order ID trùng.
- Không cần FIX gateway, mmap bus hoặc low-latency production.

## Coding tasks

1. Định nghĩa order state machine và price-time priority.
2. Viết matching core tách biệt API Express.js.
3. Tạo order submit/cancel/book/trades API.
4. Ghi event sequence để replay và so sánh state cuối.
5. Test crossing/non-crossing, partial fill, cancel, tie-break và invalid order.

## Bài nâng cấp

- Mô phỏng nhiều symbol partitioned qua nhiều engine.
- Thiết kế recovery snapshot + event log.
- Thảo luận deterministic event loop, FIX gateway và latency measurement ở mức kiến trúc.

## Tiêu chí tự đánh giá

- [ ] Best price được khớp trước, cùng giá theo thứ tự thời gian.
- [ ] Partial fill cập nhật đúng quantity còn lại.
- [ ] Cancel không hủy quantity đã khớp.
- [ ] Trade sequence và order book replay deterministic.
- [ ] Invalid order bị từ chối trước khi thay đổi state.
- [ ] Không mô tả demo như hệ thống giao dịch production.
