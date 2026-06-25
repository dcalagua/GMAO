import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../services/api.dart';
import '../models/work_order.dart';
import 'work_order_detail_screen.dart';
import 'scan_screen.dart';

class WorkOrdersScreen extends StatefulWidget {
  const WorkOrdersScreen({super.key});

  @override
  State<WorkOrdersScreen> createState() => _WorkOrdersScreenState();
}

class _WorkOrdersScreenState extends State<WorkOrdersScreen> {
  List<WorkOrder> _all = [];
  bool _loading = true;
  String? _error;
  bool _onlyMine = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await Api.call('tenant-work-orders', {'action': 'list'});
      final data = (res['data'] as List).cast<Map<String, dynamic>>();
      setState(() => _all = data.map(WorkOrder.fromJson).toList());
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<WorkOrder> get _visible {
    final uid = Api.currentUserId;
    if (_onlyMine) {
      return _all.where((w) => w.assignedToUserId == uid).toList();
    }
    return _all;
  }

  Future<void> _logout() async {
    await Supabase.instance.client.auth.signOut();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Órdenes de Trabajo'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Cerrar sesión',
            onPressed: _logout,
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(52),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
            child: SegmentedButton<bool>(
              segments: const [
                ButtonSegment(value: true, label: Text('Mis OTs')),
                ButtonSegment(value: false, label: Text('Todas')),
              ],
              selected: {_onlyMine},
              onSelectionChanged: (s) =>
                  setState(() => _onlyMine = s.first),
            ),
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _buildBody(),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () async {
          await Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => const ScanScreen()),
          );
          _load();
        },
        icon: const Icon(Icons.qr_code_scanner),
        label: const Text('Escanear'),
      ),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return ListView(
        children: [
          const SizedBox(height: 120),
          Icon(Icons.error_outline,
              size: 48, color: Theme.of(context).colorScheme.error),
          const SizedBox(height: 12),
          Center(child: Text(_error!)),
          const SizedBox(height: 12),
          Center(
            child: FilledButton.tonal(
                onPressed: _load, child: const Text('Reintentar')),
          ),
        ],
      );
    }
    final items = _visible;
    if (items.isEmpty) {
      return ListView(
        children: [
          const SizedBox(height: 140),
          const Icon(Icons.assignment_outlined, size: 56, color: Colors.grey),
          const SizedBox(height: 12),
          Center(
            child: Text(_onlyMine
                ? 'No tienes OTs asignadas'
                : 'No hay órdenes de trabajo'),
          ),
        ],
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.all(12),
      itemCount: items.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (_, i) => _WorkOrderCard(
        wo: items[i],
        onTap: () async {
          await Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => WorkOrderDetailScreen(workOrderId: items[i].id),
            ),
          );
          _load();
        },
      ),
    );
  }
}

class _WorkOrderCard extends StatelessWidget {
  final WorkOrder wo;
  final VoidCallback onTap;
  const _WorkOrderCard({required this.wo, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: EdgeInsets.zero,
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        onTap: onTap,
        title: Text(wo.title,
            maxLines: 1, overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 4),
            Text('${wo.woNumber}  ·  ${kTypeLabel[wo.workOrderType] ?? wo.workOrderType}',
                style: const TextStyle(fontSize: 12)),
            if (wo.equipmentName != null)
              Text(wo.equipmentName!,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12, color: Colors.grey)),
            const SizedBox(height: 6),
            Row(children: [
              StatusChip(status: wo.status),
              const SizedBox(width: 6),
              PriorityChip(priority: wo.priority),
            ]),
          ],
        ),
        trailing: const Icon(Icons.chevron_right),
      ),
    );
  }
}

// ─── Chips reutilizables ──────────────────────────────────────────────────────

class StatusChip extends StatelessWidget {
  final String status;
  const StatusChip({super.key, required this.status});

  @override
  Widget build(BuildContext context) {
    const colors = {
      'draft': Colors.grey,
      'planned': Colors.blue,
      'released': Colors.purple,
      'in_progress': Colors.orange,
      'completed': Colors.green,
      'closed': Colors.teal,
      'canceled': Colors.red,
    };
    final c = colors[status] ?? Colors.grey;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: c.withOpacity(0.15),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(kStatusLabel[status] ?? status,
          style: TextStyle(
              fontSize: 11, color: c, fontWeight: FontWeight.w600)),
    );
  }
}

class PriorityChip extends StatelessWidget {
  final String priority;
  const PriorityChip({super.key, required this.priority});

  @override
  Widget build(BuildContext context) {
    const colors = {
      'low': Colors.grey,
      'medium': Colors.blue,
      'high': Colors.orange,
      'urgent': Colors.red,
    };
    final c = colors[priority] ?? Colors.grey;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        border: Border.all(color: c),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(kPriorityLabel[priority] ?? priority,
          style: TextStyle(fontSize: 11, color: c)),
    );
  }
}
