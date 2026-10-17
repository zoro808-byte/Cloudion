#!/usr/bin/env bash
# =============================================================================
# file_list.sh — lists all files within an authorized base directory.
#
# Usage:
#   file_list.sh <base_dir> [relative_subdir]
# =============================================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/common.sh"

if [[ $# -lt 1 ]]; then
    echo "Usage: $(basename "$0") <base_dir> [relative_subdir]" >&2
    exit "$EXIT_INVALID_ARGUMENT"
fi

base_dir="$1"
subdir="${2:-.}"

target="$(resolve_within_base "$base_dir" "$subdir")"

if [[ ! -d "$target" ]]; then
    die "$EXIT_FILE_NOT_FOUND" "Directory not found: $subdir"
fi

mapfile -t files < <(find "$target" -maxdepth 1 -type f -not -path '*/.*' | sort)

count="${#files[@]}"
emit STATUS SUCCESS
emit CODE "$EXIT_SUCCESS"
emit COUNT "$count"

index=0
for f in "${files[@]}"; do
    size="$(stat -c%s -- "$f")"
    modified="$(stat -c '%y' -- "$f" | cut -d'.' -f1)"
    emit "FILE_${index}_NAME" "$(basename -- "$f")"
    emit "FILE_${index}_SIZE" "$size"
    emit "FILE_${index}_MODIFIED" "$modified"
    index=$((index + 1))
done

exit "$EXIT_SUCCESS"
