#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ANDROID_DIR="$PROJECT_ROOT/android"
MODEL_DIR="$PROJECT_ROOT/modules/closet-local-ai/android/src/main/assets/models"
MODEL_ZIP="$MODEL_DIR/sd15.zip"
MODEL_URL="https://huggingface.co/On-device/stable-diffusion-v1-5-mediapipe/resolve/main/sd15.zip?download=true"
MODEL_SIZE_BYTES=1906219565
OUTPUT_APK="$PROJECT_ROOT/ClosetLocal-v0.3.10-android-local-diffusion.apk"

mkdir -p "$MODEL_DIR"

if [[ ! -f "$MODEL_ZIP" ]] || [[ "$(stat -c '%s' "$MODEL_ZIP" 2>/dev/null || echo 0)" -ne "$MODEL_SIZE_BYTES" ]]; then
  echo "Descargando el modelo Stable Diffusion local (aprox. 1,9 GB)..."
  TEMP_MODEL="$(mktemp "$MODEL_DIR/sd15.zip.XXXXXX")"
  trap 'rm -f "$TEMP_MODEL"' EXIT
  curl -L --fail --retry 3 --retry-delay 5 --progress-bar -o "$TEMP_MODEL" "$MODEL_URL"
  if [[ "$(stat -c '%s' "$TEMP_MODEL")" -ne "$MODEL_SIZE_BYTES" ]]; then
    echo "El modelo descargado no tiene el tamaño esperado." >&2
    exit 1
  fi
  unzip -t "$TEMP_MODEL" >/dev/null
  mv "$TEMP_MODEL" "$MODEL_ZIP"
  trap - EXIT
else
  echo "Modelo Stable Diffusion local ya disponible."
fi

export JAVA_HOME="${JAVA_HOME:-/workspace/jdk17}"
export PATH="$JAVA_HOME/bin:$PATH"
export ANDROID_HOME="${ANDROID_HOME:-/workspace/android-sdk-staging}"
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"

if [[ ! -x "$JAVA_HOME/bin/java" ]]; then
  echo "No se encontró Java 17 en $JAVA_HOME." >&2
  exit 1
fi

cd "$ANDROID_DIR"

# AAPT2 intenta comprimir cualquier asset grande antes de que pueda aplicar
# androidResources.noCompress. Apartamos el checkpoint durante Gradle y lo
# añadimos después como una entrada ZIP almacenada sin compresión.
STAGED_MODEL="$MODEL_DIR/.sd15.zip.build-staging"
restore_model() {
  if [[ -f "$STAGED_MODEL" ]]; then
    mv "$STAGED_MODEL" "$MODEL_ZIP"
  fi
}
trap restore_model EXIT
mv "$MODEL_ZIP" "$STAGED_MODEL"

./gradlew --no-daemon --stacktrace -Pandroid.kotlinVersion=1.9.24 assembleRelease

restore_model
trap - EXIT

SOURCE_APK="$ANDROID_DIR/app/build/outputs/apk/release/app-release.apk"
if [[ ! -f "$SOURCE_APK" ]]; then
  echo "Gradle terminó sin generar $SOURCE_APK." >&2
  exit 1
fi

if unzip -l "$SOURCE_APK" | grep -q 'assets/models/sd15.zip'; then
  echo "El APK ya contiene el checkpoint; no se vuelve a insertar."
else
  (cd "$PROJECT_ROOT/modules/closet-local-ai/android/src/main" && zip -0 -q "$SOURCE_APK" assets/models/sd15.zip)
fi

APKSIGNER="$(find "$ANDROID_HOME/build-tools" -type f -name apksigner -print | sort -V | tail -n 1)"
if [[ -z "$APKSIGNER" ]]; then
  echo "No se encontró apksigner en $ANDROID_HOME/build-tools." >&2
  exit 1
fi

"$APKSIGNER" sign \
  --ks "$ANDROID_DIR/app/debug.keystore" \
  --ks-pass pass:android \
  --ks-key-alias androiddebugkey \
  --key-pass pass:android \
  "$SOURCE_APK"
"$APKSIGNER" verify "$SOURCE_APK"

if ! unzip -l "$SOURCE_APK" | grep -q 'assets/models/sd15.zip'; then
  echo "El APK no contiene assets/models/sd15.zip; se detiene para no entregar un APK sin IA." >&2
  exit 1
fi

cp "$SOURCE_APK" "$OUTPUT_APK"
echo "APK local con IA generativa: $OUTPUT_APK"
echo "Tamaño: $(du -h "$OUTPUT_APK" | cut -f1)"
sha256sum "$OUTPUT_APK"
