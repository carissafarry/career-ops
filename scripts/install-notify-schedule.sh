#!/bin/sh
# Install the new-role notifier for the current user (macOS LaunchAgent).
# It runs scripts/notify-new-roles.mjs every 2 minutes. The script shows a notification only
# when a scan has added roles since it last looked, so a quiet run does nothing.
#
#   sh scripts/install-notify-schedule.sh
#   sh scripts/install-notify-schedule.sh --remove
set -eu

LABEL=io.career-ops.notify
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

if [ "$(id -u)" -eq 0 ]; then
  echo "must not run as root: the notifier belongs to the current user" >&2
  exit 1
fi
if [ "$(uname -s)" != Darwin ]; then
  echo "macOS only" >&2
  exit 1
fi

if [ "${1:-}" = "--remove" ]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  echo "removed $LABEL"
  exit 0
fi

ROOT=$(cd "$(dirname "$0")/.." && pwd)
SCRIPT="$ROOT/scripts/notify-new-roles.mjs"
[ -f "$SCRIPT" ] || { echo "not found: $SCRIPT" >&2; exit 1; }

NODE=$(command -v node || true)
[ -n "$NODE" ] || { echo "node not found on PATH" >&2; exit 1; }
# Pin the real binary: version-manager shims do not exist in a LaunchAgent's environment.
NODE=$("$NODE" -e 'process.stdout.write(process.execPath)')

case "$ROOT$NODE" in
  *"'"* | *"<"* | *"&"*) echo "paths containing quotes, < or & are not supported" >&2; exit 1 ;;
esac

LOG="$ROOT/data/notify.log"
mkdir -p "$ROOT/data" "$(dirname "$PLIST")"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$SCRIPT</string>
  </array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>StartInterval</key><integer>120</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "installed $LABEL (every 2 minutes), log: $LOG"
