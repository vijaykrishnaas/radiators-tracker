#!/usr/bin/env bash
# Nightly Atlas backup via mongodump — the free M0 tier has NO automated
# backups, so this cron is the safety net. Keeps the last 14 archives.
#
# Setup on the EC2 instance (uses the mongodump bundled in the mongo image):
#   crontab -e
#   30 2 * * * /home/ubuntu/codebase/deploy/backup-mongo.sh >> /home/ubuntu/backup.log 2>&1
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-$HOME/mongo-backups}"
ENV_FILE="$(dirname "$0")/.env"

# Read MONGO_URI from the deploy .env without exporting everything.
MONGO_URI="$(grep -E '^MONGO_URI=' "$ENV_FILE" | cut -d= -f2-)"
[ -n "$MONGO_URI" ] || { echo "MONGO_URI not found in $ENV_FILE"; exit 1; }

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y-%m-%d_%H%M)"

docker run --rm -v "$BACKUP_DIR":/backup mongo:7 \
  mongodump --uri="$MONGO_URI" --archive=/backup/radiator-"$STAMP".gz --gzip

# Retention: keep the newest 14
ls -1t "$BACKUP_DIR"/radiator-*.gz 2>/dev/null | tail -n +15 | xargs -r rm -f
echo "backup done: radiator-$STAMP.gz"
