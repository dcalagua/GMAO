class WorkOrder {
  final String id;
  final String woNumber;
  final String title;
  final String? description;
  final String workOrderType;
  final String priority;
  final String status;
  final String? equipmentCode;
  final String? equipmentName;
  final String? plannedStart;
  final double? estimatedHours;
  final double? actualHours;
  final String? notes;
  final String? assignedToUserId;
  final String? assignedToName;

  WorkOrder({
    required this.id,
    required this.woNumber,
    required this.title,
    this.description,
    required this.workOrderType,
    required this.priority,
    required this.status,
    this.equipmentCode,
    this.equipmentName,
    this.plannedStart,
    this.estimatedHours,
    this.actualHours,
    this.notes,
    this.assignedToUserId,
    this.assignedToName,
  });

  static double? _toDouble(dynamic v) =>
      v == null ? null : (v is num ? v.toDouble() : double.tryParse(v.toString()));

  factory WorkOrder.fromJson(Map<String, dynamic> j) => WorkOrder(
        id: j['id'] as String,
        woNumber: (j['wo_number'] ?? '') as String,
        title: (j['title'] ?? '') as String,
        description: j['description'] as String?,
        workOrderType: (j['work_order_type'] ?? 'corrective') as String,
        priority: (j['priority'] ?? 'medium') as String,
        status: (j['status'] ?? 'draft') as String,
        equipmentCode: j['equipment_code'] as String?,
        equipmentName: j['equipment_name'] as String?,
        plannedStart: j['planned_start'] as String?,
        estimatedHours: _toDouble(j['estimated_hours']),
        actualHours: _toDouble(j['actual_hours']),
        notes: j['notes'] as String?,
        assignedToUserId: j['assigned_to_user_id'] as String?,
        assignedToName: j['assigned_to_name'] as String?,
      );
}

// ─── Etiquetas y colores (alineados con la web y los CHECK de la BD) ──────────

const Map<String, String> kStatusLabel = {
  'draft': 'Borrador',
  'planned': 'Planificada',
  'released': 'Liberada',
  'in_progress': 'En progreso',
  'completed': 'Completada',
  'closed': 'Cerrada',
  'canceled': 'Cancelada',
};

const Map<String, String> kTypeLabel = {
  'corrective': 'Correctivo',
  'preventive': 'Preventivo',
  'predictive': 'Predictivo',
  'inspection': 'Inspección',
};

const Map<String, String> kPriorityLabel = {
  'low': 'Baja',
  'medium': 'Media',
  'high': 'Alta',
  'urgent': 'Urgente',
};
