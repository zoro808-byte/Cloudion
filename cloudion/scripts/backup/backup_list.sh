#!/usr/bin/env bash
# backup_list.sh — lists available backup archives, newest first.
# Usage: backup_list.sh
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/common.sh"

ensure_dir "$BACKUPS_ROOT" 0750

mapfile -t archives < <(find "$BACKUPS_ROOT" -maxdepth 1 -name '*.tar.gz' -printf '%T@\t%p\n' 2>/dev/null | sort -rn -k1,1 | cut -f2-)

count="${#archives[@]}"
emit STATUS SUCCESS
emit CODE "$EXIT_SUCCESS"
emit COUNT "$count"

index=0
for a in "${archives[@]}"; do
    size="$(stat -c%s -- "$a")"
    modified="$(stat -c '%y' -- "$a" | cut -d'.' -f1)"
    emit "BACKUP_${index}_NAME" "$(basename -- "$a")"
    emit "BACKUP_${index}_SIZE" "$size"
    emit "BACKUP_${index}_DATE" "$modified"
    index=$((index + 1))
done
exit "$EXIT_SUCCESS"
