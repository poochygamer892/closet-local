# Modelos ONNX

Los pesos binarios no se versionan. La app espera dos modelos privados en su directorio `models/`:

- `background.onnx`: entrada float32 `[1,3,256,256]`, salida máscara float32 `[1,1,256,256]` con valores 0–1.
- `fashion-tags.onnx`: entrada float32 `[1,3,256,256]`; salidas `category`, `color`, `material`, `style`, `season` y opcionalmente `confidence`.

Las listas y el orden exacto de etiquetas están declarados en `src/services/localAI.ts`. Los modelos deben convertirse a ONNX y cuantizarse antes de producir APK/IPA. Durante desarrollo también se pueden importar a través de la pantalla de ajustes. La ausencia de modelos no bloquea la app: conserva la foto y abre el formulario manual.
