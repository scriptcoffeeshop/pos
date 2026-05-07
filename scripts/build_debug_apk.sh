#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/script-coffee-pos"
FALLBACK_JDK_DIR="$CACHE_DIR/temurin-21-x64"
FALLBACK_JDK_URL="https://api.adoptium.net/v3/binary/latest/21/ga/mac/x64/jdk/hotspot/normal/eclipse"

java_works() {
  local java_home="$1"
  [ -x "$java_home/bin/java" ] || return 1
  "$java_home/bin/java" -version >/dev/null 2>&1
}

resolve_java_home() {
  if [ "${POS_APK_USE_NATIVE_JDK:-0}" != "1" ] &&
    [ "$(uname -s)" = "Darwin" ] &&
    [ "$(uname -m)" = "arm64" ] &&
    arch -x86_64 /usr/bin/true >/dev/null 2>&1; then
    if ! java_works "$FALLBACK_JDK_DIR/Contents/Home"; then
      mkdir -p "$CACHE_DIR"
      rm -rf "$FALLBACK_JDK_DIR" "$CACHE_DIR/temurin-21-x64.tar.gz"
      curl -L --fail --retry 2 -o "$CACHE_DIR/temurin-21-x64.tar.gz" "$FALLBACK_JDK_URL"
      mkdir -p "$FALLBACK_JDK_DIR"
      tar -xzf "$CACHE_DIR/temurin-21-x64.tar.gz" -C "$FALLBACK_JDK_DIR" --strip-components=1
    fi

    if java_works "$FALLBACK_JDK_DIR/Contents/Home"; then
      printf '%s\n' "$FALLBACK_JDK_DIR/Contents/Home"
      return 0
    fi
  fi

  if [ -n "${JAVA_HOME:-}" ] && java_works "$JAVA_HOME"; then
    printf '%s\n' "$JAVA_HOME"
    return 0
  fi

  for candidate in \
    /opt/homebrew/opt/openjdk@21 \
    /Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home \
    "$HOME/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home"; do
    if java_works "$candidate"; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  if [ "$(uname -s)" = "Darwin" ] && [ "$(uname -m)" = "arm64" ] && arch -x86_64 /usr/bin/true >/dev/null 2>&1; then
    if ! java_works "$FALLBACK_JDK_DIR/Contents/Home"; then
      mkdir -p "$CACHE_DIR"
      rm -rf "$FALLBACK_JDK_DIR" "$CACHE_DIR/temurin-21-x64.tar.gz"
      curl -L --fail --retry 2 -o "$CACHE_DIR/temurin-21-x64.tar.gz" "$FALLBACK_JDK_URL"
      mkdir -p "$FALLBACK_JDK_DIR"
      tar -xzf "$CACHE_DIR/temurin-21-x64.tar.gz" -C "$FALLBACK_JDK_DIR" --strip-components=1
    fi

    if java_works "$FALLBACK_JDK_DIR/Contents/Home"; then
      printf '%s\n' "$FALLBACK_JDK_DIR/Contents/Home"
      return 0
    fi
  fi

  printf 'No working JDK 21 found. Install JDK 21 or set JAVA_HOME to a working JDK.\n' >&2
  return 1
}

resolve_android_home() {
  if [ -n "${ANDROID_HOME:-}" ] && [ -d "$ANDROID_HOME/platforms" ]; then
    printf '%s\n' "$ANDROID_HOME"
    return 0
  fi

  if [ -n "${ANDROID_SDK_ROOT:-}" ] && [ -d "$ANDROID_SDK_ROOT/platforms" ]; then
    printf '%s\n' "$ANDROID_SDK_ROOT"
    return 0
  fi

  for candidate in \
    "$HOME/Library/Android/sdk" \
    /opt/homebrew/share/android-commandlinetools; do
    if [ -d "$candidate/platforms" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  printf 'No Android SDK found. Install android-commandlinetools and run sdkmanager for android-36/build-tools.\n' >&2
  return 1
}

cd "$ROOT_DIR"
npm run cap:sync

RESOLVED_JAVA_HOME="$(resolve_java_home)"
RESOLVED_ANDROID_HOME="$(resolve_android_home)"
mkdir -p "$CACHE_DIR"
GRADLE_JAVA_TOOL_OPTIONS="-XX:ErrorFile=$CACHE_DIR/hs_err_pid%p.log"
if [ -n "${JAVA_TOOL_OPTIONS:-}" ]; then
  GRADLE_JAVA_TOOL_OPTIONS="$GRADLE_JAVA_TOOL_OPTIONS $JAVA_TOOL_OPTIONS"
fi

cd "$ROOT_DIR/android"
env \
  JAVA_HOME="$RESOLVED_JAVA_HOME" \
  JAVA_TOOL_OPTIONS="$GRADLE_JAVA_TOOL_OPTIONS" \
  PATH="$RESOLVED_JAVA_HOME/bin:$PATH" \
  ANDROID_HOME="$RESOLVED_ANDROID_HOME" \
  ANDROID_SDK_ROOT="$RESOLVED_ANDROID_HOME" \
  ./gradlew assembleDebug --no-daemon
