# LAB 20: Metrics Monitoring and Alerting System

## Mục tiêu

Thiết kế pipeline nhận metrics, tổng hợp time window, truy vấn và alert rule; triển khai MVP Express.js trên dữ liệu tổng hợp, không cần TSDB production.

## Đề bài

Các service gửi counter/gauge theo timestamp. Operator truy vấn chuỗi metric theo tên và tags, xem aggregate theo window và tạo alert khi điều kiện kéo dài qua ngưỡng.

## Yêu cầu chức năng

- Ingest metric có timestamp/name/value/tags.
- Validate metric và giới hạn số lượng tags/cardinality.
- Query theo time range và aggregate.
- Đánh giá alert rule có pending/firing/resolved state.
- Trả trạng thái rule và lịch sử transition tối thiểu.

## Ràng buộc

- Dùng dữ liệu giả lập, storage trong memory/file đơn giản.
- MVP không phải TSDB; đặt giới hạn retention và sample count.
- Không để input tạo cardinality vô hạn.

## Coding tasks

1. Thiết kế metric sample, series key và alert rule.
2. Tạo API ingest/query/rule bằng Express.js.
3. Tổng hợp count/avg/min/max theo window đã chọn.
4. Đánh giá rule qua nhiều evaluation interval, xử lý missing data.
5. Kiểm tra timestamp sai, tag cardinality, window boundary và alert transition.

## Bài nâng cấp

- So sánh pull scrape với push ingestion.
- Thiết kế downsampling/retention và partition theo thời gian.
- Đề xuất alert deduplication, notification và HA evaluator.

## Tiêu chí tự đánh giá

- [ ] Query chỉ trả samples đúng time range/tags.
- [ ] Window boundary và timezone có định nghĩa rõ.
- [ ] Cardinality/retention được giới hạn.
- [ ] Alert state không nhấp nháy do một sample đơn lẻ nếu rule yêu cầu duration.
- [ ] Missing data có policy xác định.
- [ ] Nêu được điểm khác giữa demo storage và TSDB thật.
