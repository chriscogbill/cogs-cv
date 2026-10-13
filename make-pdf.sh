#!/usr/bin/env bash
# Regenerate the downloadable CV PDFs from index.html (the single source of truth).
# Renders both framings via headless Chrome and writes them into assets/.
# Run this whenever the CV content changes, before deploying.
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
PORT=4781
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

cd "$DIR"
python3 -m http.server "$PORT" >/dev/null 2>&1 &
SRV=$!
trap 'kill "$SRV" 2>/dev/null || true' EXIT
sleep 1

"$CHROME" --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="assets/cv-unit4.pdf" "http://localhost:$PORT/?cv=unit4" 2>/dev/null
"$CHROME" --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="assets/cv-ai.pdf" "http://localhost:$PORT/?cv=ai" 2>/dev/null

echo "Wrote assets/cv-unit4.pdf and assets/cv-ai.pdf"
