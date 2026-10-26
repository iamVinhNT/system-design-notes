#!/bin/sh
# Runs once, when the primary data directory is first initialized.
set -e
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD '$REPLICATION_PASSWORD'"
echo "host replication replicator all md5" >> "$PGDATA/pg_hba.conf"
