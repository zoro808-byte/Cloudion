#!/usr/bin/env bash
# =============================================================================
# file_info.sh — returns detailed metadata about one file using stat/file/du.
#
# Usage:
#   file_info.sh <base_dir> <relative_path>
# =============================================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/common.sh"

if [[ $# -lt 2 ]]; then
    echo "Usage: $(basename "$0") <base_dir> <relative_path>" >&2
    exit "$EXIT_INVALID_ARGUMENT"
fi

base_dir="$1"
relative_path="$2"

resolved="$(resolve_within_base "$base_dir" "$relative_path")"

if [[ ! -e "$resolved" ]]; then
    die "$EXIT_FILE_NOT_FOUND" "File not found: $relative_path"
fi

size="$(stat -c%s -- "$resolved")"
size_human="$(du -h -- "$resolved" | cut -f1)"
mime="$(file -b --mime-type -- "$resolved" 2>/dev/null || echo unknown)"
modified="$(stat -c '%y' -- "$resolved" | cut -d'.' -f1)"
created="$(stat -c '%w' -- "$resolved" 2>/dev/null || echo "unavailable")"
perms="$(stat -c '%A' -- "$resolved")"
owner="$(stat -c '%U' -- "$resolved")"

emit STATUS SUCCESS
emit CODE "$EXIT_SUCCESS"
emit FILE_NAME "$(basename -- "$resolved")"
emit PATH "$relative_path"
emit SIZE_BYTES "$size"
emit SIZE_HUMAN "$size_human"
emit FILE_TYPE "$mime"
emit MODIFIED "$modified"
emit CREATED "$created"
emit PERMISSIONS "$perms"
emit OWNER "$owner"

exit "$EXIT_SUCCESS"
