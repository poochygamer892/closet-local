#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR/android"

if [[ -z "${ANDROID_HOME:-}" && -z "${ANDROID_SDK_ROOT:-}" ]]; then
  echo "ANDROID_HOME o ANDROID_SDK_ROOT debe apuntar al Android SDK local." >&2
  exit 1
fi

"$ROOT_DIR/android/gradlew" :app:assembleRelease :app:bundleRelease

echo "APK: $ROOT_DIR/android/app/build/outputs/apk/release/app-release.apk"
echo "AAB: $ROOT_DIR/android/app/build/outputs/bundle/release/app-release.aab"
