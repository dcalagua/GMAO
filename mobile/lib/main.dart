import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'config.dart';
import 'screens/login_screen.dart';
import 'screens/work_orders_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Supabase.initialize(
    url: Config.supabaseUrl,
    anonKey: Config.supabaseAnonKey,
  );
  runApp(const GmaoApp());
}

const Color kBrand = Color(0xFF5AA97F);

class GmaoApp extends StatelessWidget {
  const GmaoApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'GMAO Técnico',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: kBrand),
        scaffoldBackgroundColor: const Color(0xFFF5F6F8),
      ),
      home: const AuthGate(),
    );
  }
}

/// Decide entre login y la app según la sesión de Supabase.
class AuthGate extends StatefulWidget {
  const AuthGate({super.key});

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  Session? _session;

  @override
  void initState() {
    super.initState();
    _session = Supabase.instance.client.auth.currentSession;
    Supabase.instance.client.auth.onAuthStateChange.listen((data) {
      if (mounted) setState(() => _session = data.session);
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_session == null) return const LoginScreen();
    return const WorkOrdersScreen();
  }
}
