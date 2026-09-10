/// Mirrors each homework item shape returned by `GET /homework` in
/// `backend/src/controllers/homework.controller.ts`.
class HomeworkItem {
  final String id;
  final String title;
  final String subject;
  final String? note;
  final String? startAt;
  final String? dueAt;
  final List<String> lessonTitles;
  final String status;
  final bool submitted;
  final bool overdue;
  final bool expired;
  final int? daysSinceDue;
  final num? grade;
  final String? feedback;
  final List<String> attachmentUrls;
  final int attemptCount;
  final String? lastAttemptAt;
  final String? submittedAt;
  final List<String> latestAttachmentUrls;
  final String? latestAnswerText;
  final String dueStatus; // submitted | resubmitted | expired | overdue | pending
  final String remark;

  const HomeworkItem({
    required this.id,
    required this.title,
    required this.subject,
    this.note,
    this.startAt,
    this.dueAt,
    this.lessonTitles = const [],
    this.status = 'pending',
    this.submitted = false,
    this.overdue = false,
    this.expired = false,
    this.daysSinceDue,
    this.grade,
    this.feedback,
    this.attachmentUrls = const [],
    this.attemptCount = 0,
    this.lastAttemptAt,
    this.submittedAt,
    this.latestAttachmentUrls = const [],
    this.latestAnswerText,
    this.dueStatus = 'pending',
    this.remark = 'Pending',
  });

  factory HomeworkItem.fromJson(Map<String, dynamic> json) {
    List<String> strList(dynamic v) => v is List ? v.map((e) => e.toString()).toList() : const [];
    return HomeworkItem(
      id: json['id']?.toString() ?? '',
      title: json['title'] as String? ?? 'Homework',
      subject: json['subject'] as String? ?? 'General',
      note: json['note'] as String?,
      startAt: json['startAt'] as String?,
      dueAt: json['dueAt'] as String?,
      lessonTitles: strList(json['lessonTitles']),
      status: json['status'] as String? ?? 'pending',
      submitted: json['submitted'] as bool? ?? false,
      overdue: json['overdue'] as bool? ?? false,
      expired: json['expired'] as bool? ?? false,
      daysSinceDue: (json['daysSinceDue'] as num?)?.toInt(),
      grade: json['grade'] as num?,
      feedback: json['feedback'] as String?,
      attachmentUrls: strList(json['attachmentUrls']),
      attemptCount: (json['attemptCount'] as num?)?.toInt() ?? 0,
      lastAttemptAt: json['lastAttemptAt'] as String?,
      submittedAt: json['submittedAt'] as String?,
      latestAttachmentUrls: strList(json['latestAttachmentUrls']),
      latestAnswerText: json['latestAnswerText'] as String?,
      dueStatus: json['dueStatus'] as String? ?? 'pending',
      remark: json['remark'] as String? ?? 'Pending',
    );
  }
}
