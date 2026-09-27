# Phiếu thiết kế — LAB 27: Digital Wallet

## Money model và invariant

- Currency / minor units:
- Amount range:
- Balance invariant:
- Ledger invariant:

## API và idempotency

| Operation | Route | Request | Retry behavior |
| --- | --- | --- | --- |
| | | | |

- Idempotency key scope/retention:
- Transfer ID:

## Data model

- Wallet:
- Transfer:
- Ledger debit:
- Ledger credit:
- Balance projection:

## Atomicity và concurrency

- Transaction boundary:
- Lock/version strategy:
- Concurrent overspend test:
- Crash giữa debit/credit:

## Reconciliation/replay

- Rebuild balance:
- Mismatch detection:
- Repair policy:

## Mở rộng và giới hạn

- Event sourcing/CQRS:
- Replication/Raft:
- Saga/2PC:
- Ranh giới mô phỏng:
