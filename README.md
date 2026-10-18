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

El alcance se definió a partir de observaciones públicas y análisis estático documentados en [`docs/REA-ANALYSIS.md`](docs/REA-ANALYSIS.md). Las funciones que dependen de servicios externos —marketplace, feed social, clima, calendario, pagos y try-on— quedan como adaptadores futuros.

## Requisitos

- Node 20+
- Android Studio y JDK 17 para APK/AAB
- macOS, Xcode 16 y CocoaPods para IPA

## Política de compilación

- Android se compila siempre en local con Gradle. Este repositorio no ejecuta builds Android en GitHub Actions.
- iOS se compila siempre en GitHub Actions mediante `Build unsigned iOS IPA`; el workflow acepta ejecución manual y cambios en `main` o `no-local`.

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
./scripts/build-android-local.sh
```

El APK queda en `android/app/build/outputs/apk/release/app-release.apk`. Para distribuirlo hay que configurar una clave de firma en Gradle. El AAB es el formato para Google Play.

## IPA iOS

En GitHub abre **Actions → Build unsigned iOS IPA → Run workflow** y descarga el artefacto `ClosetLocal-unsigned-ipa`. También se ejecuta automáticamente en pushes de `main` y `no-local` que cambien código.

El workflow crea un IPA sin firma. Para distribución real, abre el proyecto en Xcode en un entorno macOS, selecciona tu equipo de firma y usa **Product → Archive → Distribute App**. Apple exige macOS, Xcode y una cuenta de desarrollador para crear un IPA instalable.

Para pruebas con amigos, usa TestFlight o distribución Ad Hoc según el tipo de cuenta y los dispositivos autorizados.

## Modelos locales

Consulta `assets/models/README.md`. La aplicación sigue funcionando sin pesos y muestra el etiquetado manual. Los modelos ONNX deben distribuirse con sus licencias y avisos correspondientes.

## Privacidad

Las consultas SQLite se filtran por `user_id`. Las imágenes no se publican mediante un servidor. El cifrado del dispositivo y el bloqueo del sistema operativo siguen siendo responsabilidad de cada instalación.

## Licencia

MIT. Consulta [LICENSE](LICENSE).
