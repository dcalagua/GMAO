import 'package:supabase_flutter/supabase_flutter.dart';

/// Helper para invocar Edge Functions del GMAO.
/// supabase_flutter agrega automáticamente el JWT del usuario y la apikey.
class Api {
  static SupabaseClient get client => Supabase.instance.client;

  static String? get currentUserId => client.auth.currentUser?.id;
  static String? get currentEmail => client.auth.currentUser?.email;

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
}
