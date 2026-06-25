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

## Notificaciones push (FCM)

El código de push ya está integrado (`services/push_service.dart`) y el
proyecto Firebase **GMAO EBIM** (`project_id: gmao-ebim`) ya está creado. El
`google-services.json` está en `mobile/google-services.json`.

Tras `flutter create .`:

1. **Fija el applicationId** a `pe.ebim.gmao` (debe coincidir con Firebase).
   En `android/app/build.gradle` (o `build.gradle.kts`):
   ```
   namespace = "pe.ebim.gmao"
   applicationId = "pe.ebim.gmao"
   ```
2. **Copia** el config a su lugar:
   ```bash
   cp google-services.json android/app/google-services.json
   ```
3. Habilita el plugin de Google Services (lo más simple:
   `dart pub global activate flutterfire_cli` y luego `flutterfire configure`,
   que ajusta gradle automáticamente).
4. En el **backend**, guarda el service account de Firebase como secret:
   ```bash
   supabase secrets set FCM_SERVICE_ACCOUNT="$(cat service-account.json)" --project-ref xikbhkfeaosasdltartg
   ```
   (en Windows PowerShell: `supabase secrets set "FCM_SERVICE_ACCOUNT=$(Get-Content service-account.json -Raw)" --project-ref xikbhkfeaosasdltartg`)

Con eso, al asignar una OT a un técnico se le envía push automáticamente
(además de la notificación in-app y el email). Si el secret o el
`google-services.json` no están, todo sigue funcionando sin push (degradación
elegante).

## Próximos pasos

- Push enriquecido (deep-link al tocar la notificación abre la OT).
- Soporte offline (cola de cambios sin conexión).
