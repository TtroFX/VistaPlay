#!/usr/bin/env bash
set -euo pipefail

PACKAGE="com.ttrofx.vistaplay"
ACTIVITY="${PACKAGE}/.MainActivity"
APK="android/app/build/outputs/apk/debug/app-debug.apk"
CDP_PORT="9222"
DIAG_DIR="runtime-diagnostics"
PROBE_LOG="${DIAG_DIR}/probe.log"

mkdir -p "$DIAG_DIR"

collect_diagnostics() {
  local status=$?
  set +e
  adb logcat -d > "${DIAG_DIR}/logcat.txt" 2>&1
  adb shell cat /proc/net/unix > "${DIAG_DIR}/unix-sockets.txt" 2>&1
  adb shell dumpsys package "$PACKAGE" > "${DIAG_DIR}/package.txt" 2>&1
  adb shell dumpsys activity activities > "${DIAG_DIR}/activities.txt" 2>&1
  adb shell dumpsys connectivity > "${DIAG_DIR}/connectivity.txt" 2>&1
  adb forward --list > "${DIAG_DIR}/adb-forwards.txt" 2>&1
  if [[ -f /tmp/vistaplay-webview-targets.json ]]; then
    cp /tmp/vistaplay-webview-targets.json "${DIAG_DIR}/webview-targets.json"
  fi
  printf 'exit_status=%s\n' "$status" > "${DIAG_DIR}/status.txt"
  exit "$status"
}
trap collect_diagnostics EXIT

if [[ ! -f "$APK" ]]; then
  echo "Missing APK: $APK" | tee -a "$PROBE_LOG" >&2
  exit 1
fi

adb logcat -c || true
adb install -r -t "$APK" 2>&1 | tee -a "$PROBE_LOG"

network_ready=0
for _ in $(seq 1 90); do
  if adb shell dumpsys connectivity 2>/dev/null | grep -Eq 'Capabilities:.*INTERNET.*VALIDATED|Capabilities:.*VALIDATED.*INTERNET'; then
    network_ready=1
    break
  fi
  sleep 1
done

if [[ "$network_ready" != "1" ]]; then
  echo "Android emulator network did not become validated" | tee -a "$PROBE_LOG" >&2
  adb shell dumpsys connectivity | tail -n 300 | tee -a "$PROBE_LOG" || true
  exit 1
fi

echo "Android emulator network is validated" | tee -a "$PROBE_LOG"
adb shell am force-stop "$PACKAGE" || true
adb shell am start -W -n "$ACTIVITY" 2>&1 | tee -a "$PROBE_LOG"

socket=""
for _ in $(seq 1 90); do
  pid="$(adb shell pidof "$PACKAGE" 2>/dev/null | tr -d '\r' | awk '{print $1}')"
  if [[ -n "$pid" ]]; then
    socket="$(adb shell cat /proc/net/unix 2>/dev/null | tr -d '\r' | awk -v pid="$pid" '$0 ~ "webview_devtools_remote_" pid {print $NF; exit}')"
    if [[ -z "$socket" ]]; then
      socket="$(adb shell cat /proc/net/unix 2>/dev/null | tr -d '\r' | awk '$0 ~ /webview_devtools_remote/ {print $NF; exit}')"
    fi
  fi
  if [[ -n "$socket" ]]; then break; fi
  sleep 1
done

if [[ -z "$socket" ]]; then
  echo "WebView DevTools socket was not exposed" | tee -a "$PROBE_LOG" >&2
  adb shell cat /proc/net/unix | grep webview_devtools_remote | tee -a "$PROBE_LOG" || true
  exit 1
fi

socket="${socket#@}"
echo "Using WebView DevTools socket: $socket" | tee -a "$PROBE_LOG"
adb forward --remove "tcp:${CDP_PORT}" >/dev/null 2>&1 || true
adb forward "tcp:${CDP_PORT}" "localabstract:${socket}"

ready=0
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${CDP_PORT}/json" > /tmp/vistaplay-webview-targets.json; then
    ready=1
    break
  fi
  sleep 1
done

if [[ "$ready" != "1" ]]; then
  echo "Forwarded WebView CDP endpoint did not become ready" | tee -a "$PROBE_LOG" >&2
  exit 1
fi

cat /tmp/vistaplay-webview-targets.json | tee -a "$PROBE_LOG"
set +e
WEBVIEW_CDP_ENDPOINT="http://127.0.0.1:${CDP_PORT}" node e2e/android-webview-live.mjs 2>&1 | tee -a "$PROBE_LOG"
status=${PIPESTATUS[0]}
set -e
exit "$status"
