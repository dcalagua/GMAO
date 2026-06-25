# GMAO Móvil (Flutter)

App de campo para técnicos del GMAO de GRUPO EBIM. Consume las mismas Edge
Functions de Supabase que la web.

## Funcionalidad (v1)

- Login con Supabase Auth (email/contraseña).
- **Mis OTs** / Todas: lista de órdenes de trabajo con estado y prioridad.
- Detalle de OT:
  - Flujo de cierre: **Iniciar → Completar** (horas + notas) **→ Cerrar**.
  - Materiales consumidos (lectura).
  - **Adjuntos / fotos**: tomar foto con la cámara o elegir de galería,
    ver en grande y eliminar (mantener presionado).

## Requisitos

- Flutter SDK 3.3+ (`flutter --version`).
- Un emulador o dispositivo Android/iOS.

## Puesta en marcha

Este repo contiene solo `lib/` y `pubspec.yaml`. Genera las carpetas de
plataforma (android/ios) la primera vez:

```bash
cd mobile
flutter create .          # crea android/, ios/, etc. sin tocar lib/
flutter pub get
flutter run
```

### Permisos de cámara

`image_picker` requiere permisos. Tras `flutter create .`:

- **Android** — `android/app/src/main/AndroidManifest.xml` ya funciona para
  galería; para cámara agrega dentro de `<manifest>`:
  ```xml
  <uses-permission android:name="android.permission.CAMERA"/>
  ```
- **iOS** — en `ios/Runner/Info.plist` agrega:
  ```xml
  <key>NSCameraUsageDescription</key>
  <string>Para adjuntar fotos del trabajo realizado</string>
  <key>NSPhotoLibraryUsageDescription</key>
  <string>Para adjuntar imágenes a las órdenes de trabajo</string>
  ```

## Configuración

`lib/config.dart` tiene la URL de Supabase y la anon key (pública). Apunta al
mismo proyecto que la web (`xikbhkfeaosasdltartg`).

## Arquitectura

- `services/api.dart` — wrapper de `functions.invoke` (agrega JWT + apikey).
- `models/work_order.dart` — modelo + etiquetas de estado/tipo/prioridad
  (alineadas con los CHECK de la BD).
- `screens/` — login, lista de OTs, detalle.

La seguridad multi-tenant la resuelve el backend: cada Edge Function resuelve
el tenant del usuario por su JWT; la app no maneja `tenant_id`.

## Próximos pasos

- Agregar consumo de materiales desde el móvil (hoy es lectura).
- Escaneo de QR de equipos (abrir ficha / crear OT en campo).
- Notificaciones push (FCM) para OTs asignadas.
