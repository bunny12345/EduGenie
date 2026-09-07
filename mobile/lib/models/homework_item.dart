/// Mirrors each homework item shape returned by `GET /homework` in
/// `backend/src/controllers/homework.controller.ts`.
class HomeworkItem {
  final String id;
  final String title;
  final String subject;
  final String? dueAt;
  final String status;
  final bool submitted;
  final bool overdue;
  final bool expired;
  final num? grade;
  final String dueStatus; // submitted | resubmitted | expired | overdue | pending
  final String remark;

  const HomeworkItem({
    required this.id,
    required this.title,
    required this.subject,
    this.dueAt,
    this.status = 'pending',
    this.submitted = false,
    this.overdue = false,
    this.expired = false,
    this.grade,
    this.dueStatus = 'pending',
    this.remark = 'Pending',
  });

  factory HomeworkItem.fromJson(Map<String, dynamic> json) => HomeworkItem(
        id: json['id']?.toString() ?? '',
        title: json['title'] as String? ?? 'Homework',
        subject: json['subject'] as String? ?? 'General',
        dueAt: json['dueAt'] as String?,
        status: json['status'] as String? ?? 'pending',
        submitted: json['submitted'] as bool? ?? false,
        overdue: json['overdue'] as bool? ?? false,
        expired: json['expired'] as bool? ?? false,
        grade: json['grade'] as num?,
        dueStatus: json['dueStatus'] as String? ?? 'pending',
        remark: json['remark'] as String? ?? 'Pending',
      );
}
