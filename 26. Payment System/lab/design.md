# Phiếu thiết kế — LAB 26: Payment System

## Scope và safety boundary

- Payment flow:
- Currency:
- Amount representation:
- PSP simulator:
- Dữ liệu không được thu thập:

## API / idempotency

| Operation | Route | Idempotency key | State/result |
| --- | --- | --- | --- |
| | | | |

## State machine

- States:
- Allowed transitions:
- Timeout/unknown result:
- Webhook ordering/duplicate:

## Ledger

- Accounts:
- Debit/credit entries:
- Balance invariant:
- Append-only policy:

## Reconciliation

- Internal records:
- Provider simulator records:
- Mismatch categories:
- Repair / investigation:

## Security và failure

- Authorization boundary:
- Secret handling:
- Retry policy:
- Outbox / recovery:
