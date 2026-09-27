# Phiếu thiết kế — LAB 07: Unique ID Generator

## ID layout

| Field | Số bit | Miền giá trị | Ghi chú |
| --- | --- | --- | --- |
| Timestamp | | | |
| Worker ID | | | |
| Sequence | | | |

- Epoch:
- Signed/unsigned representation:
- Thời điểm hết hạn cấu trúc:

## Generator contract

- API cấp một ID:
- API cấp batch:
- Worker identity:
- Clock source:

## Boundary và failure

- Sequence overflow:
- Clock rollback:
- Worker ID bị trùng:
- Restart:

## Test vectors

| Timestamp | Worker | Sequence | ID mong đợi / invariant |
| --- | --- | --- | --- |
| | | | |

## Trade-offs

- Sortability:
- Throughput:
- Information leakage:
- So sánh UUID / Ticket Server:
- Điều kiện production còn thiếu:
