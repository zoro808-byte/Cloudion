#!/usr/bin/env bash
# =============================================================================
# cloud_info.sh — static + light dynamic details about this Cloudion instance.
#
# Usage: cloud_info.sh
# =============================================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/common.sh"

VERSION_FILE="${PROJECT_ROOT}/VERSION"
version="unknown"
[[ -f "$VERSION_FILE" ]] && version="$(tr -d '[:space:]' < "$VERSION_FILE")"

PID_FILE="${PROJECT_ROOT}/.cloudion.pid"
state="STOPPED"
pid=""
uptime_seconds=""
if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    state="RUNNING"
    pid="$(cat "$PID_FILE")"
    # /proc/<pid>/stat field 22 (starttime, in clock ticks since boot) lets
    # us compute how long the process has been up without extra tools.
    if [[ -r "/proc/${pid}/stat" ]]; then
        clk_tck="$(getconf CLK_TCK 2>/dev/null || echo 100)"
        start_ticks="$(awk '{print $22}' "/proc/${pid}/stat")"
        boot_uptime="$(cut -d'.' -f1 /proc/uptime)"
        start_seconds=$(( start_ticks / clk_tck ))
        uptime_seconds=$(( boot_uptime - start_seconds ))
    fi
fi

script_count="$(find "${PROJECT_ROOT}/scripts" -name '*.sh' | wc -l)"

emit STATUS SUCCESS
emit CODE "$EXIT_SUCCESS"
emit NAME "Cloudion"
emit VERSION "$version"
emit STATE "$state"
[[ -n "$pid" ]] && emit PID "$pid"
[[ -n "$uptime_seconds" ]] && emit UPTIME_SECONDS "$uptime_seconds"
emit PROJECT_ROOT "$PROJECT_ROOT"
emit STORAGE_ROOT "$STORAGE_ROOT"
emit LOGS_ROOT "$LOGS_ROOT"
emit BACKUPS_ROOT "$BACKUPS_ROOT"
emit SCRIPT_COUNT "$script_count"
emit CLOUD_AREAS "personal,one_to_one,groups,global"

exit "$EXIT_SUCCESS"
