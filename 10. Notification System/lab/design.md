# Phiếu thiết kế — LAB 10: Notification System

## Yêu cầu và policy

- Event / notification types:
- Channels:
- Recipient preferences:
- Idempotency scope:
- Retention:

## API và data model

| Operation | Request | Response | Idempotency / errors |
| --- | --- | --- | --- |
| | | | |

- Notification states:
- Attempt history:
- Template/version:

## Pipeline

- API acceptance:
- Queue:
- Worker:
- Provider simulator:
- Status query:

## Retry và delivery semantics

- Transient vs permanent errors:
- Retry count / backoff:
- Duplicate delivery handling:
- Dead-letter behavior:

## Failure và vận hành

- Worker restart:
- Queue unavailable:
- Provider timeout:
- Monitoring / alert:
- Privacy/logging:

## Mở rộng

- Provider rate limit:
- Priority/scheduling:
- Outbox / broker:
