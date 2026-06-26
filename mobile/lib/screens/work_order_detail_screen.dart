import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../config.dart';
import '../services/api.dart';
import '../models/work_order.dart';
import 'work_orders_screen.dart' show StatusChip, PriorityChip;

class WorkOrderDetailScreen extends StatefulWidget {
  final String workOrderId;
  const WorkOrderDetailScreen({super.key, required this.workOrderId});

  @override
  State<WorkOrderDetailScreen> createState() => _WorkOrderDetailScreenState();
}

class _WorkOrderDetailScreenState extends State<WorkOrderDetailScreen> {
  WorkOrder? _wo;
  List<Map<String, dynamic>> _materials = [];
  List<Map<String, dynamic>> _attachments = [];
  bool _loading = true;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadAll();
  }

  Future<void> _loadAll() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final listRes = await Api.call('tenant-work-orders', {'action': 'list'});
      final all = (listRes['data'] as List).cast<Map<String, dynamic>>();
      final j = all.firstWhere((e) => e['id'] == widget.workOrderId,
          orElse: () => {});
      if (j.isEmpty) throw Exception('OT no encontrada');

      final matRes = await Api.call('tenant-work-orders',
          {'action': 'list_materials', 'id': widget.workOrderId});
      final attRes = await Api.call('tenant-attachments',
          {'action': 'list', 'work_order_id': widget.workOrderId});

      setState(() {
        _wo = WorkOrder.fromJson(j);
        _materials = (matRes['data'] as List).cast<Map<String, dynamic>>();
        _attachments = (attRes['data'] as List).cast<Map<String, dynamic>>();
      });
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _transition(String to,
      {double? actualHours, String? notes}) async {
    setState(() => _busy = true);
    try {
      await Api.call('tenant-work-orders', {
        'action': 'transition',
        'id': widget.workOrderId,
        'to': to,
        if (actualHours != null) 'actual_hours': actualHours,
        if (notes != null && notes.isNotEmpty) 'notes': notes,
      });
      await _loadAll();
    } catch (e) {
      _snack(e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _completeDialog() async {
    final hours = TextEditingController(
        text: _wo?.estimatedHours?.toString() ?? '');
    final notes = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Completar OT'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: hours,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(
                  labelText: 'Horas reales trabajadas',
                  border: OutlineInputBorder()),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: notes,
              maxLines: 3,
              decoration: const InputDecoration(
                  labelText: 'Notas de cierre',
                  hintText: 'Trabajo realizado, repuestos, observaciones…',
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
              child: const Text('Completar')),
        ],
      ),
    );
    if (ok == true) {
      await _transition('completed',
          actualHours: double.tryParse(hours.text), notes: notes.text);
    }
  }

  Future<void> _uploadPhoto(ImageSource source) async {
    try {
      final picker = ImagePicker();
      final x = await picker.pickImage(source: source, imageQuality: 70);
      if (x == null) return;
      setState(() => _busy = true);
      final bytes = await x.readAsBytes();
      final sign = await Api.call('tenant-attachments', {
        'action': 'upload_url',
        'work_order_id': widget.workOrderId,
        'file_name': x.name,
      });
      await Supabase.instance.client.storage
          .from(Config.attachmentsBucket)
          .uploadBinaryToSignedUrl(
            sign['path'] as String,
            sign['token'] as String,
            bytes,
          );
      await Api.call('tenant-attachments', {
        'action': 'confirm',
        'work_order_id': widget.workOrderId,
        'path': sign['path'],
        'file_name': x.name,
        'content_type': x.mimeType ?? 'image/jpeg',
        'size': bytes.length,
      });
      await _loadAll();
    } catch (e) {
      _snack(e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _deleteAttachment(String id) async {
    try {
      await Api.call('tenant-attachments', {'action': 'delete', 'id': id});
      await _loadAll();
    } catch (e) {
      _snack(e.toString().replaceFirst('Exception: ', ''));
    }
  }

  // ── Materiales ──────────────────────────────────────────────────────────────
  Future<void> _addMaterialDialog() async {
    List<Map<String, dynamic>> inventory = [];
    try {
      final res = await Api.call('tenant-inventory', {'action': 'list'});
      inventory = (res['data'] as List).cast<Map<String, dynamic>>();
    } catch (e) {
      _snack(e.toString().replaceFirst('Exception: ', ''));
      return;
    }
    if (!mounted) return;

    String? matId;
    final qty = TextEditingController();
    final added = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSt) => AlertDialog(
          title: const Text('Agregar material'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<String>(
                isExpanded: true,
                value: matId,
                decoration: const InputDecoration(
                    labelText: 'Repuesto', border: OutlineInputBorder()),
                items: inventory.map((m) {
                  final stock = m['stock_qty'];
                  return DropdownMenuItem<String>(
                    value: m['id'] as String,
                    enabled: (stock is num ? stock : 0) > 0,
                    child: Text('${m['code']} — ${m['name']} ($stock ${m['unit']})',
                        overflow: TextOverflow.ellipsis),
                  );
                }).toList(),
                onChanged: (v) => setSt(() => matId = v),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: qty,
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(
                    labelText: 'Cantidad', border: OutlineInputBorder()),
              ),
            ],
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text('Cancelar')),
            FilledButton(
                onPressed: () => Navigator.pop(ctx, true),
                child: const Text('Agregar')),
          ],
        ),
      ),
    );

    if (added == true && matId != null && qty.text.isNotEmpty) {
      setState(() => _busy = true);
      try {
        await Api.call('tenant-work-orders', {
          'action': 'add_material',
          'id': widget.workOrderId,
          'material_id': matId,
          'qty': double.tryParse(qty.text) ?? 0,
        });
        await _loadAll();
      } catch (e) {
        final msg = e.toString().replaceFirst('Exception: ', '');
        _snack(msg == 'INSUFFICIENT_STOCK' ? 'Stock insuficiente' : msg);
      } finally {
        if (mounted) setState(() => _busy = false);
      }
    }
  }

  Future<void> _removeMaterial(String woMaterialId) async {
    setState(() => _busy = true);
    try {
      await Api.call('tenant-work-orders',
          {'action': 'remove_material', 'wo_material_id': woMaterialId});
      await _loadAll();
    } catch (e) {
      _snack(e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _snack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_wo?.woNumber ?? 'OT')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : _buildContent(),
      bottomNavigationBar: _wo == null ? null : _buildActionBar(),
    );
  }

  Widget _buildContent() {
    final wo = _wo!;
    return RefreshIndicator(
      onRefresh: _loadAll,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(wo.title,
              style: const TextStyle(
                  fontSize: 20, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Row(children: [
            StatusChip(status: wo.status),
            const SizedBox(width: 8),
            PriorityChip(priority: wo.priority),
          ]),
          const SizedBox(height: 16),
          if (wo.description != null && wo.description!.isNotEmpty)
            _infoRow('Descripción', wo.description!),
          _infoRow('Tipo', kTypeLabel[wo.workOrderType] ?? wo.workOrderType),
          if (wo.equipmentName != null)
            _infoRow('Equipo',
                '${wo.equipmentCode ?? ''}  ${wo.equipmentName}'),
          if (wo.plannedStart != null)
            _infoRow('Inicio planificado', _fmtDate(wo.plannedStart!)),
          if (wo.estimatedHours != null)
            _infoRow('Horas estimadas', '${wo.estimatedHours}'),
          if (wo.actualHours != null)
            _infoRow('Horas reales', '${wo.actualHours}'),
          if (wo.assignedToName != null)
            _infoRow('Técnico', wo.assignedToName!),
          if (wo.notes != null && wo.notes!.isNotEmpty)
            _infoRow('Notas', wo.notes!),

          const SizedBox(height: 24),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _sectionTitle('Materiales', Icons.inventory_2_outlined),
              IconButton(
                onPressed: _busy ? null : _addMaterialDialog,
                icon: const Icon(Icons.add_circle_outline),
                tooltip: 'Agregar material',
              ),
            ],
          ),
          if (_materials.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: Text('Sin materiales registrados',
                  style: TextStyle(color: Colors.grey)),
            )
          else
            ..._materials.map((m) => ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  title: Text(m['name']?.toString() ?? ''),
                  subtitle: Text('${m['qty']} ${m['unit'] ?? ''}'),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text('S/ ${(_toNum(m['line_cost'])).toStringAsFixed(2)}'),
                      IconButton(
                        icon: const Icon(Icons.close, size: 18),
                        color: Colors.red,
                        onPressed: _busy
                            ? null
                            : () => _removeMaterial(m['id'] as String),
                      ),
                    ],
                  ),
                )),

          const SizedBox(height: 16),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _sectionTitle('Adjuntos / Fotos', Icons.attach_file),
              Row(children: [
                IconButton(
                    onPressed: _busy
                        ? null
                        : () => _uploadPhoto(ImageSource.camera),
                    icon: const Icon(Icons.camera_alt_outlined)),
                IconButton(
                    onPressed: _busy
                        ? null
                        : () => _uploadPhoto(ImageSource.gallery),
                    icon: const Icon(Icons.photo_library_outlined)),
              ]),
            ],
          ),
          if (_attachments.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: Text('Sin adjuntos. Toma una foto del trabajo.',
                  style: TextStyle(color: Colors.grey)),
            )
          else
            GridView.count(
              crossAxisCount: 3,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 8,
              crossAxisSpacing: 8,
              children: _attachments.map(_attachmentTile).toList(),
            ),
          const SizedBox(height: 80),
        ],
      ),
    );
  }

  Widget _attachmentTile(Map<String, dynamic> a) {
    final url = a['url'] as String?;
    final isImg = (a['content_type']?.toString() ?? '').startsWith('image/');
    return GestureDetector(
      onLongPress: () => _confirmDeleteAttachment(a),
      onTap: url == null ? null : () => _viewImage(url, isImg),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: (isImg && url != null)
            ? Image.network(url, fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => _fileBox())
            : _fileBox(),
      ),
    );
  }

  Widget _fileBox() => Container(
        color: Colors.grey.shade200,
        child: const Icon(Icons.insert_drive_file, color: Colors.grey),
      );

  void _viewImage(String url, bool isImg) {
    if (!isImg) return;
    showDialog(
      context: context,
      builder: (_) => Dialog(
        child: InteractiveViewer(child: Image.network(url)),
      ),
    );
  }

  Future<void> _confirmDeleteAttachment(Map<String, dynamic> a) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Eliminar adjunto'),
        content: Text(a['file_name']?.toString() ?? ''),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancelar')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Eliminar')),
        ],
      ),
    );
    if (ok == true) _deleteAttachment(a['id'] as String);
  }

  Widget? _buildActionBar() {
    final s = _wo!.status;
    Widget? btn;
    if (s == 'draft' || s == 'planned' || s == 'released') {
      btn = FilledButton.icon(
        onPressed: _busy ? null : () => _transition('in_progress'),
        icon: const Icon(Icons.play_arrow),
        label: const Text('Iniciar trabajo'),
      );
    } else if (s == 'in_progress') {
      btn = FilledButton.icon(
        style: FilledButton.styleFrom(backgroundColor: Colors.green),
        onPressed: _busy ? null : _completeDialog,
        icon: const Icon(Icons.check_circle),
        label: const Text('Completar'),
      );
    } else if (s == 'completed') {
      btn = FilledButton.icon(
        style: FilledButton.styleFrom(backgroundColor: Colors.teal),
        onPressed: _busy ? null : () => _transition('closed'),
        icon: const Icon(Icons.lock),
        label: const Text('Cerrar OT'),
      );
    }
    if (btn == null) return null;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: SizedBox(
          width: double.infinity,
          height: 48,
          child: _busy
              ? const Center(child: CircularProgressIndicator())
              : btn,
        ),
      ),
    );
  }

  Widget _sectionTitle(String t, IconData icon) => Row(
        children: [
          Icon(icon, size: 20, color: Theme.of(context).colorScheme.primary),
          const SizedBox(width: 8),
          Text(t,
              style: const TextStyle(
                  fontSize: 16, fontWeight: FontWeight.w600)),
        ],
      );

  Widget _infoRow(String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
                width: 130,
                child: Text(label,
                    style: const TextStyle(color: Colors.grey))),
            Expanded(child: Text(value)),
          ],
        ),
      );

  static double _toNum(dynamic v) =>
      v == null ? 0 : (v is num ? v.toDouble() : double.tryParse(v.toString()) ?? 0);

  static String _fmtDate(String iso) {
    final d = DateTime.tryParse(iso);
    if (d == null) return iso;
    return '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';
  }
}
