#!/usr/bin/env bash
# =============================================================================
# cpu_usage.sh — reports current CPU utilization.
#
# Reads /proc/stat twice with a short interval and computes utilization
# from the delta, which is how tools like `top` do it under the hood —
# more reliable in constrained/container environments than parsing `top`'s
# interactive output.
# Usage: cpu_usage.sh
# =============================================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/common.sh"

read_cpu() {
    read -r _ user nice system idle iowait irq softirq steal _ _ < <(grep '^cpu ' /proc/stat)
    echo "$user $nice $system $idle $iowait $irq $softirq $steal"
}

read -r u1 n1 s1 i1 w1 q1 sq1 st1 <<< "$(read_cpu)"
sleep 0.3
read -r u2 n2 s2 i2 w2 q2 sq2 st2 <<< "$(read_cpu)"

idle1=$(( i1 + w1 ))
idle2=$(( i2 + w2 ))
total1=$(( u1 + n1 + s1 + i1 + w1 + q1 + sq1 + st1 ))
total2=$(( u2 + n2 + s2 + i2 + w2 + q2 + sq2 + st2 ))

total_delta=$(( total2 - total1 ))
idle_delta=$(( idle2 - idle1 ))

if (( total_delta <= 0 )); then
    usage_pct=0
else
    usage_pct=$(( (100 * (total_delta - idle_delta)) / total_delta ))
fi

cores="$(nproc 2>/dev/null || grep -c ^processor /proc/cpuinfo)"

emit STATUS SUCCESS
emit CODE "$EXIT_SUCCESS"
emit CPU_USAGE_PERCENT "$usage_pct"
emit CPU_CORES "$cores"
exit "$EXIT_SUCCESS"
