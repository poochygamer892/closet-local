#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IOS_DIR="$PROJECT_ROOT/ios"
BUILD_DIR="$PROJECT_ROOT/build-ios"
ARCHIVE_PATH="$BUILD_DIR/ClosetLocal.xcarchive"
PAYLOAD_DIR="$BUILD_DIR/Payload"
IPA_PATH="$PROJECT_ROOT/ClosetLocal-unsigned.ipa"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Este script necesita macOS con Xcode instalado."
  exit 1
fi

command -v xcodebuild >/dev/null || { echo "Falta Xcode/xcodebuild."; exit 1; }
command -v pod >/dev/null || { echo "Falta CocoaPods: sudo gem install cocoapods"; exit 1; }

cd "$IOS_DIR"
pod install

xcodebuild \
  -workspace ClosetLocal.xcworkspace \
  -scheme ClosetLocal \
  -configuration Release \
  -sdk iphoneos \
  -archivePath "$ARCHIVE_PATH" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" \
  archive

APP_PATH="$(find "$ARCHIVE_PATH/Products/Applications" -maxdepth 1 -name '*.app' -print -quit)"
if [[ -z "$APP_PATH" ]]; then
  echo "No se encontró el .app compilado."
  exit 1
fi

mkdir -p "$PAYLOAD_DIR"
cp -R "$APP_PATH" "$PAYLOAD_DIR/"
cd "$BUILD_DIR"
ditto -c -k --sequesterRsrc --keepParent Payload "$IPA_PATH"

echo "IPA sin firma generado: $IPA_PATH"
