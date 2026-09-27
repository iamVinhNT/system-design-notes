# Phiếu thiết kế — LAB 24: Object Storage

## API contract

| Operation | Route | Input/output | Limits |
| --- | --- | --- | --- |
| | | | |

## Metadata model

- Bucket:
- Object key:
- Size/content type:
- Checksum:
- Multipart session/parts:

## Storage mapping và security

- Key normalization:
- Filesystem mapping:
- Path traversal defense:
- Request size limit:

## Multipart flow

- Initiate:
- Upload part:
- Retry/duplicate part:
- Complete validation:
- Abort/expiry:

## Durability và consistency

- Overwrite semantics:
- Delete semantics:
- Checksum validation:
- Replication/erasure coding design:
- Local MVP limitations:
