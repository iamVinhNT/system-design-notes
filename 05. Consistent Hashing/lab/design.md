# Phiếu thiết kế — LAB 05: Consistent Hashing

## Mô hình

- Hash function và input encoding:
- Ring representation:
- Virtual node naming:
- Collision handling:

## Interfaces

| Operation | Input | Output | Error cases |
| --- | --- | --- | --- |
| Add node | | | |
| Remove node | | | |
| Lookup key | | | |
| Lookup replicas | | | |

## Invariants

- Ring rỗng:
- Physical node mapping:
- Replica distinctness:
- Determinism:

## Đo lường

| Node count | Virtual nodes/node | Key count | Max/min ownership | Remapped keys |
| --- | --- | --- | --- | --- |
| | | | | |

## API Express.js

- Route:
- Request / response:
- Validation:

## Failure, trade-offs và mở rộng

- Node thêm/xóa trong lúc lookup:
- Hash collision:
- Weight/failure domain:
- Mức độ phù hợp khi node count lớn:
