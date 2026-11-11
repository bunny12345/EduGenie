import '../../../models/report_card.dart';

String examSubjectKey(String name) =>
    name.trim().replaceAll(RegExp(r'\s+'), ' ').toLowerCase();

double examPercentage(num marks, num maximum) {
  if (!marks.isFinite ||
      !maximum.isFinite ||
      maximum <= 0 ||
      marks < 0 ||
      marks > maximum) {
    throw const FormatException(
      'A released report card has invalid marks. Please ask your teacher to check it.',
    );
  }
  return marks / maximum * 100;
}

class ExamJourneyPoint {
  final ReportCard card;
  final double total;
  final double maximum;

  const ExamJourneyPoint(this.card, this.total, this.maximum);

  double? value(String subject) {
    if (subject.isEmpty) return examPercentage(total, maximum);
    for (final row in card.subjects) {
      if (examSubjectKey(row.subject) == subject) {
        return examPercentage(row.marks, row.maxMarks);
      }
    }
    return null;
  }
}

List<ExamJourneyPoint> examJourney(List<ReportCard> cards) {
  final ordered = cards.reversed.toList();
  final indices = {
    for (var i = 0; i < ordered.length; i++) ordered[i].examId: i,
  };
  if (ordered.every((card) => card.createdAt != null)) {
    ordered.sort((a, b) {
      final time = a.createdAt!.compareTo(b.createdAt!);
      return time != 0
          ? time
          : indices[a.examId]!.compareTo(indices[b.examId]!);
    });
  }
  return ordered.map((card) {
    if (card.examId.isEmpty || card.subjects.isEmpty) {
      throw const FormatException(
        'A released report card is incomplete. Please ask your teacher to check it.',
      );
    }
    double total = 0;
    double maximum = 0;
    for (final row in card.subjects) {
      examPercentage(row.marks, row.maxMarks);
      total += row.marks;
      maximum += row.maxMarks;
    }
    return ExamJourneyPoint(card, total, maximum);
  }).toList();
}

double? examChange(double? current, double? previous) =>
    current == null || previous == null
    ? null
    : ((current - previous) * 100).round() / 100;
