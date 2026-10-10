#!/bin/zsh
cd "$(dirname "$0")" || exit 1
echo "Patient tablet: http://localhost:8765/index.html"
echo "Staff dashboard: http://localhost:8765/dashboard.html"
echo "Keep this window open while using the local demo. Press Ctrl+C to stop."
python3 -m http.server 8765 --bind 127.0.0.1
