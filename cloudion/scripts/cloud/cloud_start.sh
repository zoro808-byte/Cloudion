#!/usr/bin/env bash
# =============================================================================
# cloud_start.sh — starts the Cloudion backend server as a background process.
#
# This is the script an integrating terminal (e.g. AzTerm's `cloud start`)
# should exec. It is independently runnable from any shell too.
#
# Usage: cloud_start.sh
# =============================================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/common.sh"

PID_FILE="${PROJECT_ROOT}/.cloudion.pid"
PROCESS_LOG="${LOGS_ROOT}/cloudion_process.log"

if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    die "$EXIT_GENERAL_ERROR" "Cloudion is already running (PID $(cat "$PID_FILE"))"
fi

if [[ ! -d "${PROJECT_ROOT}/backend/node_modules" ]]; then
    die "$EXIT_GENERAL_ERROR" "Backend dependencies not installed — run 'npm install' in backend/ first"
fi

ensure_dir "$LOGS_ROOT" 0750

# We need the PID file to hold node's actual PID, not the PID of some
# intermediary process. `setsid CMD &` alone would put setsid's own PID in
# $! (setsid forks before it execs), which goes stale the instant setsid
# hands off — so instead we setsid a tiny bash wrapper that writes its OWN
# pid to the file and then `exec`s node in place. exec replaces the
# process image without forking, so the PID bash just wrote is exactly
# node's real PID.
setsid bash -c "cd '${PROJECT_ROOT}/backend' && echo \$\$ > '${PID_FILE}' && exec node server.js < /dev/null > '${PROCESS_LOG}' 2>&1" &
disown 2>/dev/null || true

sleep 1

if ! kill -0 "$(cat "$PID_FILE" 2>/dev/null)" 2>/dev/null; then
    rm -f "$PID_FILE"
    die "$EXIT_GENERAL_ERROR" "Cloudion failed to start — see logs/cloudion_process.log"
fi

pid="$(cat "$PID_FILE")"
log_event server CLOUD_START system "pid=${pid}"

emit STATUS SUCCESS
emit CODE "$EXIT_SUCCESS"
emit MESSAGE "Cloudion started"
emit PID "$pid"
exit "$EXIT_SUCCESS"
