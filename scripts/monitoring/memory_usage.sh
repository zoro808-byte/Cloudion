#!/usr/bin/env bash
# memory_usage.sh — reports memory usage via `free`.
# Usage: memory_usage.sh
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/common.sh"

read -r _ total used free_ shared buffcache available < <(free -b | awk '/^Mem:/ {print}')

usage_pct=0
if (( total > 0 )); then
    usage_pct=$(( (used * 100) / total ))
fi

emit STATUS SUCCESS
emit CODE "$EXIT_SUCCESS"
emit MEMORY_TOTAL_BYTES "$total"
emit MEMORY_USED_BYTES "$used"
emit MEMORY_FREE_BYTES "$free_"
emit MEMORY_AVAILABLE_BYTES "$available"
emit MEMORY_USAGE_PERCENT "$usage_pct"
exit "$EXIT_SUCCESS"
