#!/usr/bin/env bash
# Empathika box setup for a Raspberry Pi 5 running Raspberry Pi OS (64-bit, Bookworm or later).
#
# Run once, from the empathika-assistant folder on the Pi:
#     sudo ./scripts/pi/setup.sh
#
# It is safe to run again (after updates, or to change the screen type). What it does:
#   1. Installs Docker, the sound system (PipeWire), the kiosk browser and NetworkManager tools
#   2. Names the box "empathika" (reachable as empathika.local on your network)
#   3. Sets up sound so the ReSpeaker mic board is the default microphone and speaker
#   4. Configures the round screen and shows Empathika's face full-screen at boot
#   5. Installs WiFi setup mode (the "Empathika-Setup" network with a QR code on the face)
#   6. Builds and starts Empathika
#
# Options (environment variables):
#   EMPATHIKA_SCREEN=dsi|hdmi|none   which round screen is fitted (asked if not set)
#   EMPATHIKA_DSI_PORT=0|1           Pi 5: which display connector the screen's ribbon is in (asked if not set)
#   EMPATHIKA_HOSTNAME=empathika     network name of the box
#   EMPATHIKA_SKIP_START=1           install everything but don't build/start Empathika yet
#
# Your answers (screen, connector, user, name) are remembered in /etc/empathika/box.conf, so running it
# again, and the automatic updates (scripts/pi/empathika-update.py), never need to ask.
set -euo pipefail

say()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!!  %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31mXX  %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run with sudo: sudo ./scripts/pi/setup.sh"
BOX_CONF=/etc/empathika/box.conf
# A saved answer, or nothing (never an error: on the first run there's no file yet).
saved() { [ -f "$BOX_CONF" ] && sed -n "/^$1=/{s/^$1=//p;q}" "$BOX_CONF" || true; }
# The updater runs this as root, naming the user in EMPATHIKA_USER.
USER_NAME="${SUDO_USER:-${EMPATHIKA_USER:-}}"
[ -n "$USER_NAME" ] && [ "$USER_NAME" != root ] || die "Run with sudo from your normal user account (not as root)."
USER_ID="$(id -u "$USER_NAME")"
USER_GID="$(id -g "$USER_NAME")"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
[ -f "$REPO/docker-compose.yml" ] || die "Run this from inside the empathika-assistant folder."
[ "$(uname -m)" = aarch64 ] || warn "This is meant for 64-bit Raspberry Pi OS (aarch64); continuing anyway."
grep -q 'Raspberry Pi 5' /proc/device-tree/model 2>/dev/null || warn "This doesn't look like a Raspberry Pi 5; continuing anyway."
. /etc/os-release
CONFIG_TXT=/boot/firmware/config.txt; [ -f "$CONFIG_TXT" ] || CONFIG_TXT=/boot/config.txt

SCREEN="${EMPATHIKA_SCREEN:-$(saved EMPATHIKA_SCREEN)}"
if [ -z "$SCREEN" ]; then
  echo "Which screen is fitted?  1) round DSI (ribbon cable)   2) round HDMI   3) none"
  read -r -p "Choose 1, 2 or 3 [1]: " choice </dev/tty || choice=1
  case "${choice:-1}" in 2) SCREEN=hdmi ;; 3) SCREEN=none ;; *) SCREEN=dsi ;; esac
fi

# ---------------------------------------------------------------- 1. packages
say "Installing system packages (this takes a few minutes)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
CHROMIUM=chromium; apt-cache show chromium >/dev/null 2>&1 || CHROMIUM=chromium-browser
apt-get install -y -q ca-certificates curl git python3 network-manager avahi-daemon \
  pipewire pipewire-pulse wireplumber pulseaudio-utils cage "$CHROMIUM" fonts-noto-color-emoji
if ! command -v docker >/dev/null; then
  say "Installing Docker"
  curl -fsSL https://get.docker.com | sh
fi
usermod -aG docker,audio,video,render,input "$USER_NAME" || true

# ---------------------------------------------------------------- 2. name on the network
# The network name: given on the command line, or EMPATHIKA_HOSTNAME in .env, or the one chosen before.
ENV_NAME="$( [ -f "$REPO/.env" ] && sed -n 's/^EMPATHIKA_HOSTNAME=//p' "$REPO/.env" | tail -1 | tr -d ' "' || true)"
NAME="${EMPATHIKA_HOSTNAME:-${ENV_NAME:-$(saved EMPATHIKA_HOSTNAME)}}"; NAME="${NAME:-empathika}"
if [ "$(hostname)" != "$NAME" ]; then
  say "Naming the box \"$NAME\" (reachable as $NAME.local)"
  hostnamectl set-hostname "$NAME"
  sed -i "s/^127\.0\.1\.1.*/127.0.1.1\t$NAME/" /etc/hosts || true
  grep -q "127.0.1.1" /etc/hosts || echo -e "127.0.1.1\t$NAME" >> /etc/hosts
fi

# ---------------------------------------------------------------- 3. sound
say "Setting up sound (PipeWire, mic board as default)"
loginctl enable-linger "$USER_NAME"   # sound runs at boot, without anyone logging in
install -m 755 "$REPO/scripts/pi/empathika-audio-defaults.sh" /usr/local/bin/empathika-audio-defaults
install -D -m 644 "$REPO/scripts/pi/systemd/empathika-audio-defaults.service" /etc/systemd/user/empathika-audio-defaults.service
USER_SYSTEMCTL=(sudo -u "$USER_NAME" XDG_RUNTIME_DIR="/run/user/$USER_ID" systemctl --user)
sleep 2
"${USER_SYSTEMCTL[@]}" daemon-reload || true
"${USER_SYSTEMCTL[@]}" enable --now pipewire pipewire-pulse wireplumber || warn "Could not start PipeWire yet; it starts after a reboot."
"${USER_SYSTEMCTL[@]}" enable empathika-audio-defaults.service || true

# ---------------------------------------------------------------- 4. screen + face
say "Setting up the screen ($SCREEN)"
sed -i '/# empathika-box screen/,+1d' "$CONFIG_TXT"
if [ "$SCREEN" = dsi ]; then
  # Waveshare 4inch DSI LCD (C), round 720x720. A Pi 5 has two display connectors
  # (CAM/DISP 0 and CAM/DISP 1): the line must name the one the ribbon cable is in.
  PORT_SUFFIX=""
  if grep -qi "raspberry pi 5" /proc/device-tree/model 2>/dev/null; then
    PORT="${EMPATHIKA_DSI_PORT:-$(saved EMPATHIKA_DSI_PORT)}"
    if [ -z "$PORT" ]; then
      echo "Which connector is the screen's ribbon cable in? It's printed next to it on the Pi:"
      echo "  0) CAM/DISP 0     1) CAM/DISP 1"
      read -r -p "Choose 0 or 1 [1]: " PORT </dev/tty || PORT=1
    fi
    DSI_PORT="${PORT:-1}"
    case "${PORT:-1}" in 0) PORT_SUFFIX=",dsi0" ;; *) PORT_SUFFIX=",dsi1" ;; esac
  fi
  printf '# empathika-box screen\ndtoverlay=vc4-kms-dsi-waveshare-panel,4_0_inchC%s\n' "$PORT_SUFFIX" >> "$CONFIG_TXT"
fi
if [ "$SCREEN" != none ]; then
  install -m 755 "$REPO/scripts/pi/empathika-face-kiosk.sh" /usr/local/bin/empathika-face-kiosk
  python3 "$REPO/scripts/pi/make-invisible-cursor.py" /usr/share/icons
  sed "s/__USER__/$USER_NAME/" "$REPO/scripts/pi/systemd/empathika-face.service" > /etc/systemd/system/empathika-face.service
  systemctl disable getty@tty1.service 2>/dev/null || true
  systemctl set-default graphical.target
  systemctl enable empathika-face.service
  # Raspberry Pi OS with desktop: its desktop (started by a display manager) would take the screen
  # instead of the face. Switch it off at boot; nothing is uninstalled.
  for DM in lightdm gdm3 sddm; do
    if systemctl is-enabled "$DM.service" >/dev/null 2>&1; then
      systemctl disable "$DM.service"
      DESKTOP_OFF="$DM"
    fi
  done
  [ -n "${DESKTOP_OFF:-}" ] && warn "The desktop no longer starts at boot, so the screen shows Empathika's face. To get the desktop back: sudo systemctl enable $DESKTOP_OFF && sudo reboot"
  # Never blank the console underneath the face.
  CMDLINE=/boot/firmware/cmdline.txt; [ -f "$CMDLINE" ] || CMDLINE=/boot/cmdline.txt
  grep -q 'consoleblank=0' "$CMDLINE" || sed -i 's/$/ consoleblank=0/' "$CMDLINE"
else
  systemctl disable empathika-face.service 2>/dev/null || true
fi

# ---------------------------------------------------------------- 4b. boot screen
# Empathika's face (or your own logo: put a PNG called boot-logo.png in the empathika-assistant folder)
# while the box starts and shuts down, instead of raspberries and scrolling text.
if [ "$SCREEN" != none ] && [ "${EMPATHIKA_BOOT_LOGO:-on}" != off ]; then
  say "Setting up the boot screen"
  LOGO="$REPO/boot-logo.png"; [ -f "$LOGO" ] || LOGO="$REPO/scripts/pi/boot/logo.png"
  if [ "$(head -c 8 "$LOGO" | od -An -tx1 | tr -d ' \n')" != 89504e470d0a1a0a ]; then
    warn "$LOGO is not a PNG picture; using Empathika's face instead."
    LOGO="$REPO/scripts/pi/boot/logo.png"
  fi
  command -v plymouth-set-default-theme >/dev/null 2>&1 || apt-get install -y -q plymouth plymouth-themes
  THEME_DIR=/usr/share/plymouth/themes/empathika
  install -d "$THEME_DIR"
  install -m 644 "$REPO/scripts/pi/boot/empathika.plymouth" "$REPO/scripts/pi/boot/empathika.script" "$THEME_DIR/"
  install -m 644 "$LOGO" "$THEME_DIR/logo.png"
  # No rainbow square from the firmware, no raspberries or blinking cursor from Linux.
  grep -q '^disable_splash=1' "$CONFIG_TXT" || echo 'disable_splash=1' >> "$CONFIG_TXT"
  CMDLINE=/boot/firmware/cmdline.txt; [ -f "$CMDLINE" ] || CMDLINE=/boot/cmdline.txt
  for OPT in quiet splash logo.nologo vt.global_cursor_default=0; do
    grep -qw -- "$OPT" "$CMDLINE" || sed -i "s/\$/ $OPT/" "$CMDLINE"
  done
  # Rebuilds the start-up files with the new theme (takes a minute).
  plymouth-set-default-theme -R empathika >/dev/null || warn "Could not apply the boot screen; the box starts as before."
  echo "  Boot screen: $( [ "$LOGO" = "$REPO/boot-logo.png" ] && echo 'your boot-logo.png' || echo "Empathika's face" )"
fi

# ---------------------------------------------------------------- 5. WiFi setup mode
say "Installing WiFi setup mode"
install -D -m 755 "$REPO/scripts/pi/empathika-wifi-setup.py" /usr/local/lib/empathika/empathika-wifi-setup.py
install -m 644 "$REPO/scripts/pi/systemd/empathika-wifi.service" /etc/systemd/system/empathika-wifi.service
# Shared folder between the WiFi service and Empathika (status for the face, requests from the screen).
echo "d /run/empathika 0775 $USER_NAME $USER_NAME -" > /etc/tmpfiles.d/empathika.conf
systemd-tmpfiles --create /etc/tmpfiles.d/empathika.conf
# While the setup network is up, answer every web address with the setup page (captive portal).
mkdir -p /etc/NetworkManager/dnsmasq-shared.d
echo "address=/#/10.42.0.1" > /etc/NetworkManager/dnsmasq-shared.d/empathika-captive.conf
systemctl daemon-reload
systemctl enable --now empathika-wifi.service

# ---------------------------------------------------------------- 5b. turning off / on
say "Installing turn off / restart and screen brightness (screen menu, voice, control panel, power button)"
install -D -m 755 "$REPO/scripts/pi/empathika-power.sh" /usr/local/lib/empathika/empathika-power.sh
install -m 644 "$REPO/scripts/pi/systemd/empathika-power.path" /etc/systemd/system/empathika-power.path
install -m 644 "$REPO/scripts/pi/systemd/empathika-power.service" /etc/systemd/system/empathika-power.service
# The Pi 5's own power button: a short press turns the box off safely (pressed again, it starts).
mkdir -p /etc/systemd/logind.conf.d
printf '[Login]\nHandlePowerKey=poweroff\nHandlePowerKeyLongPress=poweroff\n' > /etc/systemd/logind.conf.d/empathika-power-key.conf
install -D -m 755 "$REPO/scripts/pi/empathika-brightness.sh" /usr/local/lib/empathika/empathika-brightness.sh
install -m 644 "$REPO/scripts/pi/systemd/empathika-brightness.path" /etc/systemd/system/empathika-brightness.path
install -m 644 "$REPO/scripts/pi/systemd/empathika-brightness.service" /etc/systemd/system/empathika-brightness.service
systemctl daemon-reload
systemctl enable --now empathika-power.path empathika-brightness.path

# ---------------------------------------------------------------- SD card care
mkdir -p /etc/systemd/journald.conf.d
printf '[Journal]\nSystemMaxUse=50M\n' > /etc/systemd/journald.conf.d/empathika.conf
systemctl restart systemd-journald || true

# ---------------------------------------------------------------- 6. Empathika
cd "$REPO"
if [ ! -f .env ]; then
  cp .env.example .env
  chown "$USER_NAME:$USER_NAME" .env
  warn "Created .env from the example. Copy your real .env from your Mac (see docs/PI.md), then run this script again."
  EMPATHIKA_SKIP_START=1
fi
set_env() { grep -q "^$1=" .env && sed -i "s|^$1=.*|$1=$2|" .env || echo "$1=$2" >> .env; }
set_env EMPATHIKA_UID "$USER_ID"
set_env EMPATHIKA_GID "$USER_GID"
grep -q '^CONTROL_PANEL_URL=' .env || set_env CONTROL_PANEL_URL "http://$NAME.local:8099"
# A .env copied from Max may replace Empathika's care rules with Max's: say so.
for K in LLM_SYSTEM_PROMPT REALTIME_STYLE TTS_INSTRUCTIONS; do
  # The last line counts (the trial block at the end of .env empties them).
  [ -n "$(sed -n "s/^$K=//p" .env | tail -1)" ] && warn "$K is set in .env (from Max?): it replaces Empathika's own care-home wording. Remove it unless you wrote it for Empathika."
done
# The settings the trial needs (.env.trial), by their last line in .env.
last() { sed -n "s/^$1=//p" .env | tail -1; }
if [ "$(last VOICE_MODE)" = realtime ] && [ "$(last REALTIME_PROVIDER)" = gemini ] && [ -z "$(last GEMINI_API_KEY)$(last GOOGLE_API_KEY)$(last REALTIME_API_KEY)" ]; then
  warn "Real-time voice with Gemini is on, but there is no GEMINI_API_KEY in .env: she won't be able to talk."
fi
[ -n "$(last EMPATHIKA_APP_MCP_URL)" ] || warn "EMPATHIKA_APP_MCP_URL is empty in .env: no care record, family messages or memory backup until it is set."
grep -q '^PANEL_PASSWORD=.\+' .env || warn "PANEL_PASSWORD is not set in .env. On the box the control panel is reachable from your home network, so set one."
# A .env copied from Max starts the "max" profile: here it is "empathika" (and there is no Spotify "music" profile).
PROFILES="$(sed -n 's/^COMPOSE_PROFILES=//p' .env | tail -1 | tr ',' '\n' | sed 's/^max$/empathika/' | grep -v '^music$' | grep -v '^$' | sort -u | paste -sd, - || true)"
case ",$PROFILES," in *,empathika,*) ;; *) PROFILES="empathika${PROFILES:+,$PROFILES}" ;; esac
set_env COMPOSE_PROFILES "$PROFILES"
# Every "docker compose" command on the box includes the Pi settings (sound, control panel on the
# home network), so a plain "docker compose up -d" can't lock the control panel to the box itself.
set_env COMPOSE_FILE docker-compose.yml:docker-compose.pi.yml

if [ "${EMPATHIKA_SKIP_START:-}" != 1 ]; then
  say "Building and starting Empathika (the first build takes 10-15 minutes on a Pi 5)"
  docker compose -f docker-compose.yml -f docker-compose.pi.yml up -d --build
fi

# ---------------------------------------------------------------- 7. updates
say "Installing updates from GitHub (control panel: Settings, Updates)"
mkdir -p /etc/empathika
cat > "$BOX_CONF" <<CONF
# Written by scripts/pi/setup.sh: the answers it was given, reused by updates.
EMPATHIKA_USER=$USER_NAME
EMPATHIKA_REPO=$REPO
EMPATHIKA_SCREEN=$SCREEN
EMPATHIKA_DSI_PORT=${DSI_PORT:-$(saved EMPATHIKA_DSI_PORT)}
EMPATHIKA_HOSTNAME=$NAME
CONF
install -D -m 755 "$REPO/scripts/pi/empathika-update.py" /usr/local/lib/empathika/empathika-update.py
for UNIT in empathika-update.path empathika-update.service empathika-version.service; do
  install -m 644 "$REPO/scripts/pi/systemd/$UNIT" "/etc/systemd/system/$UNIT"
done
systemctl daemon-reload
systemctl enable --now empathika-update.path
systemctl enable empathika-version.service
python3 /usr/local/lib/empathika/empathika-update.py version || true

say "Done."
echo "  Control panel: http://$NAME.local:8099   Face (on the box): http://localhost:8098"
echo "  Logs: cd $REPO && docker compose logs -f empathika"
echo "  Hold the screen for 2 seconds for the menu: volume, brightness, Turn off, Restart, WiFi setup."
echo "  Turn on: the Pi's power button."
echo "  WiFi setup also starts by itself if the box is offline for a minute."
[ "$SCREEN" = dsi ] && echo "  Reboot now to activate the screen: sudo reboot"
exit 0
