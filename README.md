# Closet Local Mobile — Android + iOS

Aplicación autónoma React Native. No inicia FastAPI, no necesita Ollama y no realiza peticiones HTTP. Los datos viven en SQLite, las fotos en el sandbox privado de la app y la sesión en Android Keystore/iOS Keychain.

## Requisitos

- Node 20+
- Android Studio + JDK 17 para APK/AAB
- macOS + Xcode 16 para IPA
- CocoaPods para iOS

## Modelos locales

Consulta `assets/models/README.md`. Antes de una distribución final, incluye modelos ONNX cuantizados compatibles con los contratos descritos allí. Sin pesos, la app sigue siendo utilizable y muestra el formulario de etiquetado manual.

## Instalar y generar proyectos nativos

```bash
cd mobile
npm install
npx expo prebuild
```

Esto crea `android/` e `ios/`. `onnxruntime-react-native` requiere una compilación nativa; Expo Go no sirve para probar la IA.

## APK Android local

```bash
npm run android                 # prueba en dispositivo/emulador
cd android
./gradlew assembleRelease       # APK
./gradlew bundleRelease         # AAB para Play Store
```

El APK queda en `android/app/build/outputs/apk/release/app-release.apk`. Para distribuirlo debes configurar una clave de firma en `android/gradle.properties` y `android/app/build.gradle`.

## IPA iPhone local

```bash
npm run ios
open ios/ClosetLocal.xcworkspace
```

En Xcode selecciona tu equipo de firma y un dispositivo genérico, luego `Product > Archive > Distribute App`. Apple exige macOS, Xcode y una cuenta de desarrollador para firmar un IPA instalable.

### IPA sin firma para Sideloadly/AltStore

En un Mac con Xcode y CocoaPods:

```bash
chmod +x scripts/build-unsigned-ipa.sh
./scripts/build-unsigned-ipa.sh
```

El resultado será `ClosetLocal-unsigned.ipa`. El script compila con `CODE_SIGNING_ALLOWED=NO`; después Sideloadly, AltStore u otra herramienta deberá firmarlo para tu dispositivo.

## Privacidad entre cuentas

Cada consulta SQLite exige `user_id`. Las imágenes se guardan bajo el sandbox de la app y nunca se publican mediante un servidor. La separación protege frente a otros usuarios de la app; para proteger contra alguien con control total del dispositivo, activa el cifrado y bloqueo del sistema operativo.
