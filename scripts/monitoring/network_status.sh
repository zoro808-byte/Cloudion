#!/usr/bin/env bash
# =============================================================================
# network_status.sh — reports basic network interface and listening-socket
# information using `ip` and `ss`.
# Usage: network_status.sh
# =============================================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/common.sh"

interface_count=0
if command -v ip >/dev/null 2>&1; then
    interface_count="$(ip -o link show 2>/dev/null | wc -l)"
fi

listening_count=0
if command -v ss >/dev/null 2>&1; then
    listening_count="$(ss -ltn 2>/dev/null | tail -n +2 | wc -l)"
fi

emit STATUS SUCCESS
emit CODE "$EXIT_SUCCESS"
emit INTERFACE_COUNT "$interface_count"
emit LISTENING_SOCKET_COUNT "$listening_count"
exit "$EXIT_SUCCESS"
