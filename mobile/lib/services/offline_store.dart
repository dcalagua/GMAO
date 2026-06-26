import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

/// Almacenamiento local para modo offline: caché de listas + cola de
/// operaciones pendientes (mutaciones hechas sin conexión).
class OfflineStore {
  static const _cachePrefix = 'cache:';
  static const _queueKey = 'pending_queue';

  static Future<void> setCache(String key, dynamic data) async {
    final p = await SharedPreferences.getInstance();
    await p.setString('$_cachePrefix$key', jsonEncode(data));
  }

  static Future<dynamic> getCache(String key) async {
    final p = await SharedPreferences.getInstance();
    final s = p.getString('$_cachePrefix$key');
    return s == null ? null : jsonDecode(s);
  }

  static List<Map<String, dynamic>> _readQueue(SharedPreferences p) {
    final s = p.getString(_queueKey);
    if (s == null) return [];
    return (jsonDecode(s) as List).map((e) => (e as Map).cast<String, dynamic>()).toList();
  }

  static Future<List<Map<String, dynamic>>> queue() async {
    final p = await SharedPreferences.getInstance();
    return _readQueue(p);
  }

  static Future<void> enqueue(String fn, Map<String, dynamic> body) async {
    final p = await SharedPreferences.getInstance();
    final list = _readQueue(p);
    list.add({'fn': fn, 'body': body, 'ts': DateTime.now().toIso8601String()});
    await p.setString(_queueKey, jsonEncode(list));
  }

  static Future<void> setQueue(List<Map<String, dynamic>> q) async {
    final p = await SharedPreferences.getInstance();
    await p.setString(_queueKey, jsonEncode(q));
  }

  static Future<int> pendingCount() async => (await queue()).length;
}
