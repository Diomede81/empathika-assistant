#!/bin/sh
# Turns the Empathika box off or restarts it when Empathika asks: from the screen's menu, by voice, or from
# the control panel. Empathika runs in a container, so she leaves a note in /run/empathika/power-request
# ("poweroff" or "reboot"); empathika-power.path notices it and runs this. /run is emptied at every
# start, so an old note can never turn the box off later.
F="${EMPATHIKA_RUN_DIR:-/run/empathika}/power-request"
[ -f "$F" ] || exit 0
ACTION="$(head -c 20 "$F" | tr -cd 'a-z')"
rm -f "$F"
case "$ACTION" in
  poweroff) logger -t empathika-power "Turning off (asked by Empathika)"; exec systemctl poweroff ;;
  reboot)   logger -t empathika-power "Restarting (asked by Empathika)"; exec systemctl reboot ;;
  *)        logger -t empathika-power "Ignored an unknown request: $ACTION" ;;
esac
