#!/usr/bin/env bash
# =============================================================================
# storage_report.sh — per-user breakdown of Personal Cloud usage.
# Uses du across storage/users/*, sorted largest-first, for an admin view of
# who is consuming the most space.
# Usage: storage_report.sh
# =============================================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/common.sh"

users_dir="${STORAGE_ROOT}/users"
ensure_dir "$users_dir" 0750

emit STATUS SUCCESS
emit CODE "$EXIT_SUCCESS"

if [[ -z "$(ls -A "$users_dir" 2>/dev/null)" ]]; then
    emit COUNT 0
    exit "$EXIT_SUCCESS"
fi

mapfile -t rows < <(du -sb "${users_dir}"/*/ 2>/dev/null | sort -rn -k1,1)
count="${#rows[@]}"
emit COUNT "$count"

index=0
for row in "${rows[@]}"; do
    size_bytes="$(echo "$row" | cut -f1)"
    path="$(echo "$row" | cut -f2-)"
    username="$(basename "$path")"
    emit "USER_${index}_NAME" "$username"
    emit "USER_${index}_BYTES" "$size_bytes"
    index=$((index + 1))
done

exit "$EXIT_SUCCESS"
