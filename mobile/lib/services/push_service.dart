import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import 'api.dart';

/// Manejo de notificaciones push (FCM).
/// En Android lee la config de google-services.json automáticamente
/// (no requiere firebase_options.dart si el plugin gradle está aplicado).
class PushService {
  static bool _initialized = false;

  /// Inicializa Firebase. Llamar una vez al arrancar la app.
  /// Es tolerante a fallos: si Firebase no está configurado, la app sigue.
  static Future<void> init() async {
    if (_initialized) return;
    try {
      await Firebase.initializeApp();
      _initialized = true;
    } catch (e) {
      debugPrint('Firebase no inicializado (push deshabilitado): $e');
    }
  }

  /// Solicita permiso, obtiene el token y lo registra en el backend.
  /// Llamar cuando el usuario ya tiene sesión iniciada.
  static Future<void> registerForUser() async {
    if (!_initialized) return;
    try {
      final messaging = FirebaseMessaging.instance;
      await messaging.requestPermission(alert: true, badge: true, sound: true);

      final platform = defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android';
      final token = await messaging.getToken();
      if (token != null) {
        await Api.call('tenant-register-device',
            {'action': 'register', 'token': token, 'platform': platform});
      }

      // Re-registrar si Firebase rota el token
      messaging.onTokenRefresh.listen((t) {
        Api.call('tenant-register-device',
                {'action': 'register', 'token': t, 'platform': platform})
            .catchError((_) => null);
      });
    } catch (e) {
      debugPrint('No se pudo registrar el token push: $e');
    }
  }

  /// Da de baja el token actual (al cerrar sesión).
  static Future<void> unregister() async {
    if (!_initialized) return;
    try {
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null) {
        await Api.call('tenant-register-device',
            {'action': 'unregister', 'token': token});
      }
    } catch (_) {/* ignore */}
  }
}
