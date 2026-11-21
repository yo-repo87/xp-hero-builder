#!/usr/bin/env bash
# Apply any not-yet-applied db/migrations/*.sql to the xpherobuilder database, in filename order.
# Tracks applied files in schema_migrations. Each file runs in one transaction.
# Usage: server/db/migrate.sh   (set PG_CONTAINER to override; default shared_postgres)
set -euo pipefail
cd "$(dirname "$0")/migrations"
C=${PG_CONTAINER:-shared_postgres}
psql() { docker exec -i "$C" psql -v ON_ERROR_STOP=1 -U xpherobuilder -d xpherobuilder -qAt "$@"; }
psql -c "CREATE TABLE IF NOT EXISTS schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"
for f in *.sql; do
  if [ -n "$(psql -c "SELECT 1 FROM schema_migrations WHERE filename='$f'")" ]; then continue; fi
  echo "Applying $f"
  { echo "BEGIN;"; cat "$f"; echo "INSERT INTO schema_migrations(filename) VALUES ('$f'); COMMIT;"; } | psql
done
echo "Migrations up to date."
