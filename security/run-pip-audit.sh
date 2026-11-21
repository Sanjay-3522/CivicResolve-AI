#!/usr/bin/env bash
# Run pip-audit against backend/requirements.txt, ignoring only reviewed advisories.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
args=()
while read -r id _; do [[ -z "$id" || "$id" == \#* ]] && continue; args+=(--ignore-vuln "$id"); done < "$here/pip-audit-ignore.txt"
pip-audit -r "$here/../backend/requirements.txt" "${args[@]}"
