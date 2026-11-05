/// School subject order: regional languages, Hindi, English, other languages,
/// maths, sciences, then any other subject, ending with social studies.
/// Mirrors `subjectRank` in `web/src/components/StudentDashboard.jsx`.
library;

const _regionalLanguages = [
  'telugu', 'tamil', 'kannada', 'malayalam', 'marathi', 'bengali', 'bangla',
  'gujarati', 'punjabi', 'odia', 'oriya', 'assamese', 'urdu', 'konkani',
  'kashmiri', 'sindhi', 'nepali', 'manipuri', 'maithili', 'santali', 'dogri',
  'bodo',
];
const _otherLanguages = [
  'sanskrit', 'french', 'german', 'spanish', 'arabic', 'japanese', 'chinese',
  'mandarin', 'persian', 'russian', 'italian', 'korean', 'language',
  'literature', 'grammar',
];
const _socialSubjects = [
  'history', 'geography', 'civics', 'econom', 'political', 'politics',
  'sociology',
];

int subjectRank(String subject) {
  final s = subject.toLowerCase();
  bool has(List<String> words) => words.any(s.contains);
  if (s.contains('social')) return 11;
  if (has(_socialSubjects)) return 10;
  if (s.contains('computer') || s.contains('home science')) return 9;
  if (has(_regionalLanguages)) return 0;
  if (s.contains('hindi')) return 1;
  if (s.contains('english')) return 2;
  if (has(_otherLanguages)) return 3;
  if (s.contains('math')) return 4;
  if (s.contains('physics')) return 6;
  if (s.contains('chemistry')) return 7;
  if (s.contains('bio') || s.contains('botany') || s.contains('zoology')) return 8;
  if (s.contains('science') || s.contains('evs') || s.contains('environment')) return 5;
  return 9;
}

int compareSubjects(String a, String b) {
  final byRank = subjectRank(a) - subjectRank(b);
  return byRank != 0 ? byRank : a.toLowerCase().compareTo(b.toLowerCase());
}

/// Returns [subjects] in school order.
List<String> sortSubjects(Iterable<String> subjects) =>
    subjects.toList()..sort(compareSubjects);
