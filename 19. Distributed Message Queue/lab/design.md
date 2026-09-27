# Phiếu thiết kế — LAB 19: Message Queue

## Queue contract

- Topics / partitions:
- Message key:
- Ordering guarantee:
- Delivery semantics:
- Retention:

## API và data model

| Operation | Route | Input/output | Error |
| --- | --- | --- | --- |
| | | | |

- Message:
- Partition log:
- Consumer group:
- Offset:

## Consumer flow

- Poll:
- Process:
- Ack/commit:
- Retry / DLQ:
- Idempotent side effect:

## Failure cases

- Crash before processing:
- Crash after processing before commit:
- Commit failure:
- Restart / replay:

## Scale design

- WAL / durability:
- Replication / ISR:
- Rebalance:
- MVP limitations:
