# Phiếu thiết kế — LAB 04: Rate Limiter

## Scope và policy

- Route / API cần giới hạn:
- Định danh client và trust boundary:
- Quota, window, burst:
- Hành vi khi store lỗi:

## API contract

| Route / method | Request | Response thành công | Response bị giới hạn |
| --- | --- | --- | --- |
| | | | |

## Thuật toán

- Thuật toán MVP:
- Thuật toán đối chiếu:
- State cần lưu và thời điểm hết hạn:
- Boundary/burst behavior:

## Middleware flow

- Thứ tự middleware:
- Quyết định allow/reject:
- Header trả về:

## Test và failure handling

- Quota boundary:
- Nhiều client:
- Clock/reset:
- Store/process restart:
- Nhiều instance và atomicity:

## Trade-offs và nâng cấp

- Accuracy / memory / latency:
- Fail-open vs fail-closed:
- Cách mở rộng shared store:
