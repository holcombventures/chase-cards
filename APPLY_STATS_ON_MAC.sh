#!/bin/bash
# Apply stats patch onto Mac live copy. Run on Mac:
#   bash APPLY_STATS_ON_MAC.sh /path/to/pokemon-chase-stats-patch.tgz
set -euo pipefail
PATCH="${1:?patch tgz path}"
DEST="${2:-/Users/bobbyholcomb/Downloads/pokemon-chase-cards}"
if [[ ! -d "$DEST" ]]; then
  echo "Missing dest: $DEST" >&2
  exit 1
fi
tar -xzf "$PATCH" -C "$DEST"
echo "Applied stats patch to $DEST"
echo "Files:"
tar -tzf "$PATCH"
echo "Refresh http://localhost:3000 if next dev is running."
