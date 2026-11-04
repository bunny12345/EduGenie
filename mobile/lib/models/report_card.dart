/// One subject row within a released report card — mirrors the backend's
/// `GET /progress/report-cards` response shape (`subjects[]`).
class ReportCardSubject {
  final String subject;
  final num marks;
  final num maxMarks;
  final num percentage;
  final String grade;
  final String remarks;
  final String teacherName;

  const ReportCardSubject({
    required this.subject,
    required this.marks,
    required this.maxMarks,
    required this.percentage,
    required this.grade,
    required this.remarks,
    required this.teacherName,
  });

  factory ReportCardSubject.fromJson(Map<String, dynamic> json) => ReportCardSubject(
    subject: json['subject']?.toString() ?? '',
    marks: json['marks'] as num? ?? 0,
    maxMarks: json['maxMarks'] as num? ?? 100,
    percentage: json['percentage'] as num? ?? 0,
    grade: json['grade']?.toString() ?? 'E',
    remarks: json['remarks']?.toString() ?? '',
    teacherName: json['teacherName']?.toString() ?? '',
  );
}

/// A single released exam report card — only ever returned once every
/// subject teacher of the class has entered this student's marks.
class ReportCard {
  final String examId;
  final String examName;
  final String className;
  final num maxMarks;
  final List<ReportCardSubject> subjects;
  final num total;
  final num maxTotal;
  final num percentage;
  final String grade;

  const ReportCard({
    required this.examId,
    required this.examName,
    required this.className,
    required this.maxMarks,
    required this.subjects,
    required this.total,
    required this.maxTotal,
    required this.percentage,
    required this.grade,
  });

  factory ReportCard.fromJson(Map<String, dynamic> json) => ReportCard(
    examId: json['examId']?.toString() ?? '',
    examName: json['examName']?.toString() ?? 'Exam',
    className: json['className']?.toString() ?? '',
    maxMarks: json['maxMarks'] as num? ?? 100,
    subjects: (json['subjects'] as List? ?? [])
        .map((s) => ReportCardSubject.fromJson(Map<String, dynamic>.from(s as Map)))
        .toList(),
    total: json['total'] as num? ?? 0,
    maxTotal: json['maxTotal'] as num? ?? 0,
    percentage: json['percentage'] as num? ?? 0,
    grade: json['grade']?.toString() ?? 'E',
  );
}
