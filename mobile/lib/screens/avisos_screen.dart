import 'package:flutter/material.dart';
import '../services/api.dart';

class AvisosScreen extends StatefulWidget {
  const AvisosScreen({super.key});

  @override
  State<AvisosScreen> createState() => _AvisosScreenState();
}

const Map<String, String> _typeLabel = {'M1': 'Solicitud', 'M2': 'Avería', 'M3': 'Actividad'};
const Map<String, String> _statusLabel = {
  'open': 'Abierto', 'in_review': 'En revisión', 'converted': 'Convertido', 'closed': 'Cerrado',
};
const Map<String, Color> _statusColor = {
  'open': Colors.orange, 'in_review': Colors.blue, 'converted': Colors.green, 'closed': Colors.grey,
};
const Map<String, String> _prioLabel = {'low': 'Baja', 'medium': 'Media', 'high': 'Alta', 'urgent': 'Urgente'};

class _AvisosScreenState extends State<AvisosScreen> {
  List<Map<String, dynamic>> _rows = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final res = await Api.call('tenant-avisos', {'action': 'list'});
      setState(() => _rows = (res['data'] as List).cast<Map<String, dynamic>>());
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _createDialog() async {
    final title = TextEditingController();
    final desc = TextEditingController();
    String type = 'M2';
    String priority = 'high';
    List<Map<String, dynamic>> equipos = [];
    String? equipoId;
    try {
      final eqRes = await Api.call('tenant-equipment', {'action': 'list'});
      equipos = (eqRes['data'] as List).cast<Map<String, dynamic>>();
    } catch (_) {}
    if (!mounted) return;

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSt) => AlertDialog(
          title: const Text('Nuevo aviso'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButtonFormField<String>(
                  initialValue: type,
                  decoration: const InputDecoration(labelText: 'Tipo', border: OutlineInputBorder()),
                  items: const [
                    DropdownMenuItem(value: 'M1', child: Text('M1 — Solicitud')),
                    DropdownMenuItem(value: 'M2', child: Text('M2 — Avería')),
                    DropdownMenuItem(value: 'M3', child: Text('M3 — Actividad')),
                  ],
                  onChanged: (v) => setSt(() => type = v ?? 'M2'),
                ),
                const SizedBox(height: 12),
                TextField(controller: title, decoration: const InputDecoration(labelText: 'Título', border: OutlineInputBorder())),
                const SizedBox(height: 12),
                TextField(controller: desc, maxLines: 3, decoration: const InputDecoration(labelText: 'Descripción de la falla', border: OutlineInputBorder())),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: priority,
                  decoration: const InputDecoration(labelText: 'Prioridad', border: OutlineInputBorder()),
                  items: const [
                    DropdownMenuItem(value: 'low', child: Text('Baja')),
                    DropdownMenuItem(value: 'medium', child: Text('Media')),
                    DropdownMenuItem(value: 'high', child: Text('Alta')),
                    DropdownMenuItem(value: 'urgent', child: Text('Urgente')),
                  ],
                  onChanged: (v) => setSt(() => priority = v ?? 'high'),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  isExpanded: true,
                  initialValue: equipoId,
                  decoration: const InputDecoration(labelText: 'Equipo (opcional)', border: OutlineInputBorder()),
                  items: equipos.map((e) => DropdownMenuItem<String>(
                    value: e['id'] as String,
                    child: Text('${e['code']} — ${e['name']}', overflow: TextOverflow.ellipsis),
                  )).toList(),
                  onChanged: (v) => setSt(() => equipoId = v),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Crear')),
          ],
        ),
      ),
    );

    if (ok == true && title.text.isNotEmpty) {
      try {
        Map<String, dynamic>? eq;
        if (equipoId != null) {
          eq = equipos.firstWhere((e) => e['id'] == equipoId, orElse: () => {});
        }
        await Api.call('tenant-avisos', {
          'action': 'create',
          'data': {
            'notif_type': type,
            'title': title.text,
            'description': desc.text,
            'priority': priority,
            if (equipoId != null) 'equipment_id': equipoId,
            if (eq != null && eq['functional_location_id'] != null)
              'functional_location_id': eq['functional_location_id'],
            'reported_by_name': Api.currentEmail,
          },
        });
        await _load();
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))));
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Avisos de mantenimiento')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _createDialog,
        icon: const Icon(Icons.add),
        label: const Text('Nuevo aviso'),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? ListView(children: [const SizedBox(height: 120), Center(child: Text(_error!))])
                : _rows.isEmpty
                    ? ListView(children: const [
                        SizedBox(height: 140),
                        Icon(Icons.report_problem_outlined, size: 56, color: Colors.grey),
                        SizedBox(height: 12),
                        Center(child: Text('No hay avisos. Crea el primero.')),
                      ])
                    : ListView.separated(
                        padding: const EdgeInsets.all(12),
                        itemCount: _rows.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 8),
                        itemBuilder: (_, i) {
                          final a = _rows[i];
                          final st = a['status'] as String? ?? 'open';
                          return Card(
                            margin: EdgeInsets.zero,
                            child: ListTile(
                              title: Text(a['title']?.toString() ?? '',
                                  style: const TextStyle(fontWeight: FontWeight.w600)),
                              subtitle: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const SizedBox(height: 4),
                                  Text('${a['code']} · ${_typeLabel[a['notif_type']] ?? a['notif_type']} · ${_prioLabel[a['priority']] ?? a['priority']}',
                                      style: const TextStyle(fontSize: 12)),
                                  if (a['equipment_name'] != null)
                                    Text(a['equipment_name'].toString(),
                                        maxLines: 1, overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(fontSize: 12, color: Colors.grey)),
                                  if (a['wo_number'] != null)
                                    Text('→ ${a['wo_number']}',
                                        style: const TextStyle(fontSize: 12, color: Colors.green)),
                                ],
                              ),
                              trailing: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                decoration: BoxDecoration(
                                  color: (_statusColor[st] ?? Colors.grey).withOpacity(0.15),
                                  borderRadius: BorderRadius.circular(20),
                                ),
                                child: Text(_statusLabel[st] ?? st,
                                    style: TextStyle(fontSize: 11, color: _statusColor[st] ?? Colors.grey, fontWeight: FontWeight.w600)),
                              ),
                            ),
                          );
                        },
                      ),
      ),
    );
  }
}
