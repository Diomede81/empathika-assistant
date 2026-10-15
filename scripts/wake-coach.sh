#!/usr/bin/env bash
# Wake word coach: records you saying the wake word, then shows how confidently the model
# recognises each attempt and what to change. Works on the Mac and on the Empathika box.
#   ./scripts/wake-coach.sh
# Recordings stay in ./wake-coach/<date> (useful for retraining, see training/README.md).
set -euo pipefail
cd "$(dirname "$0")/.."

compose=(docker compose)
if [[ -f /proc/device-tree/model ]] && grep -qi "raspberry" /proc/device-tree/model 2>/dev/null; then
  compose=(docker compose -f docker-compose.yml -f docker-compose.pi.yml)
fi

setting() { # last value of a setting in .env (the one that wins), or a default
  local v
  v=$(grep -E "^$1=" .env 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"'"'"' ' || true)
  echo "${v:-$2}"
}
names=$(setting WAKEWORD_NAMES hey_jarvis)
threshold=$(setting WAKEWORD_THRESHOLD 0.5)
session="$(date +%Y-%m-%d_%H%M)"
mkdir -p wake-coach

# Empathika would hear the attempts too (and answer): pause him while recording.
was_running=$("${compose[@]}" --profile empathika ps --status running -q empathika 2>/dev/null || true)
if [[ -n "$was_running" ]]; then
  echo "Pausing Empathika while you record..."
  "${compose[@]}" --profile empathika stop empathika >/dev/null
fi
restart() { [[ -n "$was_running" ]] && { echo "Starting Empathika again..."; "${compose[@]}" --profile empathika up -d empathika >/dev/null; } || true; }
trap restart EXIT

echo "Preparing (the first time this builds Empathika, a few minutes)..."
"${compose[@]}" --profile empathika build -q empathika
"${compose[@]}" up -d openwakeword >/dev/null

"${compose[@]}" --profile empathika run --rm --no-deps -v "$PWD/wake-coach:/app/wake-coach" \
  empathika node dist/tools/wake-coach.js "/app/wake-coach/$session"

echo
echo "Scoring your recordings with the same engine Empathika uses..."
"${compose[@]}" run --rm --no-deps -T \
  -v "$PWD/wake-coach:/clips:ro" -v "$PWD/scripts/wake/score.py:/score.py:ro" \
  --entrypoint /usr/src/.venv/bin/python3 openwakeword \
  /score.py "/clips/$session" --names "$names" --threshold "$threshold" --custom-dir /custom
echo
echo "Recordings: wake-coach/$session"
