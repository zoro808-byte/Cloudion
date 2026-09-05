#!/usr/bin/env bash
# process_status.sh — reports process counts and system uptime.
# Usage: process_status.sh
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/common.sh"

process_count="$(ps -e --no-headers | wc -l)"
uptime_seconds="$(cut -d'.' -f1 /proc/uptime)"
load_avg="$(cut -d' ' -f1-3 /proc/loadavg)"

emit STATUS SUCCESS
emit CODE "$EXIT_SUCCESS"
emit PROCESS_COUNT "$process_count"
emit UPTIME_SECONDS "$uptime_seconds"
emit LOAD_AVERAGE "$load_avg"
exit "$EXIT_SUCCESS"
