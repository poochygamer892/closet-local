# No Local Mobile — Android + iOS

Aplicación open source independiente para organizar un armario, guardar prendas y crear looks en Android y iOS. Está inspirada en la categoría de productos de armario digital; no contiene código, marca, imágenes ni recursos privados de Fitted.

La aplicación funciona localmente: no inicia FastAPI, no necesita Ollama y no realiza peticiones HTTP. Los datos viven en SQLite, las fotografías en el sandbox privado y la sesión en Android Keystore/iOS Keychain.

## Funciones

- Catálogo local de prendas con fotografías y metadatos.
- Valor total del armario y coste por uso.
- Constructor de looks y exportación de lookbooks.
- Lista de equipaje.
- Análisis de prendas con modelos ONNX locales opcionales.
- Experiencia disponible para Android y iOS.

## Requisitos

- Node 20+
- Android Studio y JDK 17 para APK/AAB
- macOS, Xcode 16 y CocoaPods para IPA

## Instalar y ejecutar

```bash
npm install
npx expo prebuild
npm run android
# o
npm run ios
```

Esto crea los proyectos nativos `android/` e `ios/`. `onnxruntime-react-native` requiere una compilación nativa; Expo Go no sirve para probar la IA local.

## APK Android

```bash
cd android
./gradlew assembleRelease
./gradlew bundleRelease
```

El APK queda en `android/app/build/outputs/apk/release/app-release.apk`. Para distribuirlo hay que configurar una clave de firma en Gradle. El AAB es el formato para Google Play.

## IPA iOS

```bash
npm run ios
open ios/ClosetLocal.xcworkspace
```

En Xcode selecciona tu equipo de firma y un dispositivo genérico, después usa **Product → Archive → Distribute App**. Apple exige macOS, Xcode y una cuenta de desarrollador para crear un IPA instalable.

Para pruebas con amigos, usa TestFlight o distribución Ad Hoc según el tipo de cuenta y los dispositivos autorizados.

## Modelos locales

Consulta `assets/models/README.md`. La aplicación sigue funcionando sin pesos y muestra el etiquetado manual. Los modelos ONNX deben distribuirse con sus licencias y avisos correspondientes.

## Privacidad

Las consultas SQLite se filtran por `user_id`. Las imágenes no se publican mediante un servidor. El cifrado del dispositivo y el bloqueo del sistema operativo siguen siendo responsabilidad de cada instalación.

## Licencia

MIT. Consulta [LICENSE](LICENSE).
