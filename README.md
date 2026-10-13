# Closet Local Mobile — Android + iOS

Aplicación autónoma React Native. No inicia FastAPI, no necesita Ollama y no realiza peticiones HTTP. Los datos viven en SQLite, las fotos en el sandbox privado de la app y la sesión en Android Keystore/iOS Keychain.

## Requisitos

- Node 20+
- Android Studio + JDK 17 para APK/AAB
- macOS + Xcode 16 para IPA
- CocoaPods para iOS

## IA local

La app no usa servidor ni cuenta. En iOS 17 o posterior emplea Vision para recorte, instancias y clasificación. En Android el módulo incluye un recorte local por componentes conectados y, en las compilaciones preparadas para ello, MediaPipe Stable Diffusion 1.5.

El importador de un outfit puesto no trata Stable Diffusion como si fuera imagen-a-imagen: ese runtime es texto-a-imagen y puede inventar detalles. Para reconstruir una prenda se conserva la mejor vista localmente; la difusión queda reservada para prompts generativos explícitos y tiene un fallback determinista si el dispositivo no puede reservar memoria.

El Stylist de la pestaña Looks funciona sin modelo: combina intención, colores, favoritos y rotación de uso. Esto mantiene la función disponible en ambos sistemas y hace que cada recomendación sea explicable.

## Instalar y generar proyectos nativos

```bash
cd closet-local
npm install
npx expo prebuild
```

Esto crea `android/` e `ios/`. `onnxruntime-react-native` requiere una compilación nativa; Expo Go no sirve para probar la IA.

## APK Android local con Stable Diffusion

```bash
./scripts/build-android-local.sh
```

El script descarga `sd15.zip` (aprox. 1,9 GB), lo incorpora sin comprimir al APK y verifica que el modelo esté presente. Para una compilación normal también puedes usar `npm run android`, `cd android && ./gradlew assembleRelease` o `./gradlew bundleRelease`. Para distribuirlo debes configurar una clave de firma en `android/gradle.properties` y `android/app/build.gradle`.

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
