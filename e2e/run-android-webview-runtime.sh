#!/usr/bin/env bash
set -euo pipefail

PACKAGE="com.ttrofx.vistaplay"
ACTIVITY="${PACKAGE}/.MainActivity"
APK="android/app/build/outputs/apk/debug/app-debug.apk"
CDP_PORT="9222"

if [[ ! -f "$APK" ]]; then
  echo "Missing APK: $APK" >&2
  exit 1
fi

adb logcat -c || true
adb install -r -t "$APK"
adb shell am force-stop "$PACKAGE" || true
adb shell am start -W -n "$ACTIVITY"

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
  echo "WebView DevTools socket was not exposed" >&2
  adb shell cat /proc/net/unix | grep webview_devtools_remote || true
  adb logcat -d | tail -n 500 || true
  exit 1
fi

socket="${socket#@}"
echo "Using WebView DevTools socket: $socket"
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
  echo "Forwarded WebView CDP endpoint did not become ready" >&2
  adb logcat -d | tail -n 500 || true
  exit 1
fi

cat /tmp/vistaplay-webview-targets.json
set +e
WEBVIEW_CDP_ENDPOINT="http://127.0.0.1:${CDP_PORT}" node e2e/android-webview-live.mjs
status=$?
set -e

if [[ "$status" -ne 0 ]]; then
  echo "--- Android logcat (tail) ---" >&2
  adb logcat -d | tail -n 800 >&2 || true
  exit "$status"
fi
