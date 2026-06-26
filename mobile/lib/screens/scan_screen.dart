import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../services/api.dart';

/// Escanea el QR de un equipo (URL .../equipment?code=XXX), lo busca y permite
/// reportar una falla creando un aviso de mantenimiento.
class ScanScreen extends StatefulWidget {
  const ScanScreen({super.key});

  @override
  State<ScanScreen> createState() => _ScanScreenState();
}

class _ScanScreenState extends State<ScanScreen> {
  bool _handled = false;
  bool _busy = false;

  String? _extractCode(String raw) {
    // Acepta una URL con ?code=XXX o el código directo
    final uri = Uri.tryParse(raw);
    if (uri != null && uri.queryParameters['code'] != null) {
      return uri.queryParameters['code'];
    }
    return raw.trim().isEmpty ? null : raw.trim();
  }

  Future<void> _onDetect(BarcodeCapture capture) async {
    if (_handled) return;
    if (capture.barcodes.isEmpty) return;
    final raw = capture.barcodes.first.rawValue;
    if (raw == null) return;
    final code = _extractCode(raw);
    if (code == null) return;
    setState(() {
      _handled = true;
      _busy = true;
    });
    try {
      final res = await Api.call('tenant-equipment', {'action': 'list'});
      final all = (res['data'] as List).cast<Map<String, dynamic>>();
      final eq = all.firstWhere((e) => e['code'] == code, orElse: () => {});
      if (!mounted) return;
      if (eq.isEmpty) {
        _showNotFound(code);
      } else {
        _showEquipmentSheet(eq);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))));
        setState(() => _handled = false);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _showNotFound(String code) {
    showModalBottomSheet(
      context: context,
      builder: (_) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.search_off, size: 48, color: Colors.grey),
            const SizedBox(height: 12),
            Text('No se encontró el equipo "$code"',
                textAlign: TextAlign.center),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () {
                Navigator.pop(context);
                setState(() => _handled = false);
              },
              child: const Text('Escanear de nuevo'),
            ),
          ],
        ),
      ),
    );
  }

  void _showEquipmentSheet(Map<String, dynamic> eq) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => Padding(
        padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 20,
            bottom: MediaQuery.of(context).viewInsets.bottom + 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              const Icon(Icons.precision_manufacturing, size: 28),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(eq['name']?.toString() ?? '',
                        style: const TextStyle(
                            fontSize: 18, fontWeight: FontWeight.bold)),
                    Text(eq['code']?.toString() ?? '',
                        style: const TextStyle(color: Colors.grey)),
                  ],
                ),
              ),
            ]),
            const SizedBox(height: 8),
            if (eq['location_name'] != null)
              Text('Ubicación: ${eq['location_name']}'),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                style: FilledButton.styleFrom(backgroundColor: Colors.red),
                icon: const Icon(Icons.report_problem),
                label: const Text('Reportar falla (Aviso)'),
                onPressed: () {
                  Navigator.pop(context);
                  _reportFault(eq);
                },
              ),
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                onPressed: () {
                  Navigator.pop(context);
                  setState(() => _handled = false);
                },
                child: const Text('Escanear otro'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _reportFault(Map<String, dynamic> eq) async {
    final title = TextEditingController(text: 'Falla en ${eq['name']}');
    final desc = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Reportar falla'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: title,
              decoration: const InputDecoration(
                  labelText: 'Título', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: desc,
              maxLines: 3,
              decoration: const InputDecoration(
                  labelText: 'Descripción de la falla',
                  border: OutlineInputBorder()),
            ),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancelar')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Crear aviso')),
        ],
      ),
    );

    if (ok != true) {
      setState(() => _handled = false);
      return;
    }

    setState(() => _busy = true);
    try {
      final res = await Api.call('tenant-avisos', {
        'action': 'create',
        'data': {
          'notif_type': 'M2', // avería
          'title': title.text,
          'description': desc.text,
          'priority': 'high',
          'equipment_id': eq['id'],
          'functional_location_id': eq['functional_location_id'],
          'reported_by_name': Api.currentEmail,
        },
      });
      final av = res['data'] as Map<String, dynamic>;
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Aviso ${av['code']} creado. El supervisor lo revisará.')));
      Navigator.pop(context); // volver a la lista
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))));
        setState(() {
          _busy = false;
          _handled = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Escanear equipo')),
      body: Stack(
        alignment: Alignment.center,
        children: [
          MobileScanner(onDetect: _onDetect),
          // Marco guía
          Container(
            width: 240,
            height: 240,
            decoration: BoxDecoration(
              border: Border.all(color: Colors.white, width: 3),
              borderRadius: BorderRadius.circular(16),
            ),
          ),
          if (_busy) const CircularProgressIndicator(),
          Positioned(
            bottom: 40,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.black54,
                borderRadius: BorderRadius.circular(20),
              ),
              child: const Text('Apunta al código QR del equipo',
                  style: TextStyle(color: Colors.white)),
            ),
          ),
        ],
      ),
    );
  }
}
