#!/bin/sh
# Sets the screen's brightness when Empathika asks (screen menu, voice, control panel). Empathika runs in a
# container, so she writes the level (5-100) to /run/empathika/brightness-request; empathika-brightness.path
# notices and runs this. It tells Empathika whether the screen supports it in /run/empathika/backlight.json.
RUN="${EMPATHIKA_RUN_DIR:-/run/empathika}"
REQ="$RUN/brightness-request"
[ -f "$REQ" ] || exit 0
PCT="$(head -c 4 "$REQ" | tr -cd '0-9')"
[ -n "$PCT" ] || exit 0
[ "$PCT" -gt 100 ] && PCT=100
[ "$PCT" -lt 5 ] && PCT=5
FOUND=false
BL="${BACKLIGHT_DIR:-/sys/class/backlight}"
for B in "$BL"/*; do
  [ -f "$B/max_brightness" ] || continue
  MAX="$(cat "$B/max_brightness")"
  VAL=$(( (MAX * PCT + 50) / 100 ))
  [ "$VAL" -lt 1 ] && VAL=1
  echo "$VAL" > "$B/brightness" 2>/dev/null && FOUND=true
done
printf '{"supported":%s,"level":%s}\n' "$FOUND" "$PCT" > "$RUN/backlight.json"
chmod 644 "$RUN/backlight.json"
[ "$FOUND" = true ] || logger -t empathika-brightness "No adjustable screen backlight found (/sys/class/backlight is empty)"
