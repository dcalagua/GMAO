import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:connectivity_plus/connectivity_plus.dart';

import 'offline_store.dart';

/// Helper para invocar Edge Functions del GMAO, con soporte offline.
class Api {
  static SupabaseClient get client => Supabase.instance.client;

  static String? get currentUserId => client.auth.currentUser?.id;
  static String? get currentEmail => client.auth.currentUser?.email;

  static Future<bool> isOnline() async {
    final r = await Connectivity().checkConnectivity();
    return !r.contains(ConnectivityResult.none);
  }

  /// Llamada directa (lanza excepción en error).
  static Future<dynamic> call(String fn, Map<String, dynamic> body) async {
    try {
      final res = await client.functions.invoke(fn, body: body);
      return res.data;
    } on FunctionException catch (e) {
      final d = e.details;
      final msg = (d is Map && d['error'] != null)
          ? d['error'].toString()
          : (e.reasonPhrase ?? 'Error de red');
      throw Exception(msg);
    }
  }

  /// Lista con respaldo en caché: si no hay red, devuelve la última caché.
  static Future<List<dynamic>> cachedList(
      String fn, Map<String, dynamic> body, String cacheKey) async {
    try {
      final res = await call(fn, body);
      final data = (res is Map ? res['data'] : null) as List? ?? [];
      await OfflineStore.setCache(cacheKey, data);
      return data;
    } catch (e) {
      final cached = await OfflineStore.getCache(cacheKey);
      if (cached is List) return cached;
      rethrow;
    }
  }

  /// Mutación con cola offline: si no hay red (o falla), encola y reintenta luego.
  /// Devuelve {'queued': true} si quedó pendiente, o {'data': ...} si se envió.
  static Future<Map<String, dynamic>> mutate(
      String fn, Map<String, dynamic> body) async {
    if (!await isOnline()) {
      await OfflineStore.enqueue(fn, body);
      return {'queued': true};
    }
    try {
      final res = await call(fn, body);
      return {'queued': false, 'data': res is Map ? res['data'] : res};
    } catch (e) {
      await OfflineStore.enqueue(fn, body);
      return {'queued': true};
    }
  }

  /// Reenvía las operaciones pendientes. Devuelve cuántas se enviaron.
  static Future<int> flushQueue() async {
    if (!await isOnline()) return 0;
    final q = await OfflineStore.queue();
    if (q.isEmpty) return 0;
    final remaining = <Map<String, dynamic>>[];
    int sent = 0;
    for (final op in q) {
      try {
        await call(op['fn'] as String, (op['body'] as Map).cast<String, dynamic>());
        sent++;
      } catch (_) {
        remaining.add(op);
      }
    }
    await OfflineStore.setQueue(remaining);
    return sent;
  }
}
