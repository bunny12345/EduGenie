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

/// A class topper (rank 1–3) listed on a report card — name only, no marks.
class ReportCardTopper {
  final int rank;
  final String name;

  const ReportCardTopper({required this.rank, required this.name});
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

  /// Class rank, only once every student's marks are in. Students only ever
  /// receive it for ranks 1–3; the teacher view receives every rank.
  final int? rank;
  final int? classSize;
  final List<ReportCardTopper> toppers;

  /// True until the top-3 celebration has been shown for this exam.
  final bool celebrationPending;
  final DateTime? createdAt;

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
    this.rank,
    this.classSize,
    this.toppers = const [],
    this.celebrationPending = false,
    this.createdAt,
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
    rank: (json['rank'] as num?)?.toInt(),
    classSize: (json['classSize'] as num?)?.toInt(),
    toppers: (json['toppers'] as List? ?? [])
        .map((t) => ReportCardTopper(
              rank: ((t as Map)['rank'] as num?)?.toInt() ?? 0,
              name: t['name']?.toString() ?? '',
            ))
        .toList(),
    celebrationPending: json['celebrationPending'] == true,
    createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? ''),
  );
}

/// The student's current top-3 badge — kept until the next exam's results
/// are announced.
class RankBadgeInfo {
  final int rank;
  final String examId;
  final String examName;

  const RankBadgeInfo({required this.rank, required this.examId, required this.examName});
}

/// `GET /progress/report-cards` payload: released cards plus the current badge.
class ReportCardsData {
  final List<ReportCard> cards;
  final RankBadgeInfo? badge;

  const ReportCardsData({required this.cards, this.badge});

  factory ReportCardsData.fromJson(Map<String, dynamic> json) {
    final b = json['badge'];
    return ReportCardsData(
      cards: (json['reportCards'] as List? ?? [])
          .map((r) => ReportCard.fromJson(Map<String, dynamic>.from(r as Map)))
          .toList(),
      badge: b is Map
          ? RankBadgeInfo(
              rank: (b['rank'] as num?)?.toInt() ?? 0,
              examId: b['examId']?.toString() ?? '',
              examName: b['examName']?.toString() ?? '',
            )
          : null,
    );
  }
}
