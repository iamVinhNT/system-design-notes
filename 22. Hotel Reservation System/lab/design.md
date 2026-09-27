# Phiếu thiết kế — LAB 22: Hotel Reservation

## Inventory invariant

- Inventory key/granularity:
- Số phòng khả dụng:
- Reservation state:
- Invariant chống overbooking:

## API

| Operation | Route | Idempotency | Error cases |
| --- | --- | --- | --- |
| Search | | | |
| Hold | | | |
| Confirm | | | |
| Cancel | | | |

## Concurrency strategy

- Storage transaction:
- Lock/constraint:
- Isolation:
- Retry khi conflict:

## Expiry và failure

- Hold expiration:
- Confirm-expiry race:
- Worker dừng:
- Payment failure:
- Rollback:

## Kiểm tra

- Hai khách cùng phòng cuối:
- Confirm lặp:
- Cancel sau confirm:
- Inventory trước/sau transaction:
