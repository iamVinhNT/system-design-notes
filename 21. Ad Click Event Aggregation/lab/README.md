# LAB 21: Ad Click Event Aggregation

## Mục tiêu

Xử lý event click, deduplicate và tổng hợp theo cửa sổ thời gian; thực hành event trễ, replay và khác biệt processing time/event time.

## Đề bài

Ad platform nhận click event và cung cấp số click theo ad/campaign mỗi phút. Client có thể retry event, event đến trễ hoặc sai thứ tự. API phải hiển thị aggregate và mức độ hoàn tất window.

## Yêu cầu chức năng

- Ingest event có event ID, ad ID, event time và payload tối thiểu.
- Deduplicate theo event ID trong retention đã chọn.
- Aggregate count theo tumbling window và dimensions.
- Quy định xử lý late events, watermark/allowed lateness và replay.

## Phi chức năng và ràng buộc

- MVP trong một process với dataset giới hạn.
- Không xử lý dữ liệu quảng cáo thật hoặc user identifier thật.
- At-least-once input có thể tạo duplicate; aggregation phải có semantics rõ.
- Không tuyên bố exactly-once end-to-end.

## Coding tasks

1. Xác định event schema, event-time window và dedupe key.
2. Tạo Express.js ingest/query endpoints.
3. Tính aggregate theo window và campaign/ad.
4. Xử lý out-of-order/late events; phân biệt provisional và finalized result.
5. Mô phỏng replay từ event log và xác minh kết quả không tăng gấp đôi.

## Bài nâng cấp

- So sánh tumbling/sliding window.
- Thiết kế checkpoint và recovery sau process restart.
- Phân tích hot key, partitioning và approximate counting.

## Tiêu chí tự đánh giá

- [ ] Event duplicate không tăng aggregate quá một lần theo policy.
- [ ] Event-time window boundary được kiểm tra.
- [ ] Late event có kết quả và trạng thái window xác định.
- [ ] Replay tạo cùng kết quả cuối như xử lý ban đầu.
- [ ] Provisional/final result được phân biệt.
- [ ] Nêu rõ vì sao chưa đạt exactly-once end-to-end.
