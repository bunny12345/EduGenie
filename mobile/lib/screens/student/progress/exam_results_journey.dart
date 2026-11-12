import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../models/report_card.dart';
import '../../../state/student_providers.dart';
import '../../../state/teacher_providers.dart';
import '../../../theme/report_card_theme.dart';
import '../../../widgets/section_card.dart';
import 'exam_journey_data.dart';
import 'progress_helpers.dart';

class ExamResultsJourneyPanel extends ConsumerStatefulWidget {
  final String? studentId;

  const ExamResultsJourneyPanel({super.key, this.studentId});

  @override
  ConsumerState<ExamResultsJourneyPanel> createState() =>
      _ExamResultsJourneyPanelState();
}

class _ExamResultsJourneyPanelState
    extends ConsumerState<ExamResultsJourneyPanel> {
  late final Timer _timer;

  void _refresh() {
    final id = widget.studentId;
    if (id == null) {
      ref.invalidate(reportCardsProvider);
    } else {
      ref.invalidate(teacherStudentReportCardsProvider(id));
    }
  }

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(minutes: 1), (_) => _refresh());
  }

  @override
  void dispose() {
    _timer.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final id = widget.studentId;
    final AsyncValue<List<ReportCard>> cards = id == null
        ? ref.watch(reportCardsProvider).whenData((data) => data.cards)
        : ref
              .watch(teacherStudentReportCardsProvider(id))
              .whenData((data) => ReportCardsData.fromJson(data).cards);
    return cards.when(
      loading: () => const SectionCard(child: SkeletonBox(height: 240)),
      error: (error, _) => _error('Could not retrieve exam results. $error'),
      data: (data) {
        try {
          return ExamResultsJourney(points: examJourney(data));
        } on FormatException catch (error) {
          return _error(error.message);
        }
      },
    );
  }

  Widget _error(String message) => SectionCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ErrorInline(message: message),
        TextButton(onPressed: _refresh, child: const Text('Try again')),
      ],
    ),
  );
}

class ExamResultsJourney extends StatefulWidget {
  final List<ExamJourneyPoint> points;

  const ExamResultsJourney({super.key, required this.points});

  @override
  State<ExamResultsJourney> createState() => _ExamResultsJourneyState();
}

class _ExamResultsJourneyState extends State<ExamResultsJourney> {
  String _subject = '';
  String? _selectedId;
  static const _purple = Color(0xFF6355DC);
  ProgressColors get _colors => ProgressColors.of(context);
  Color get _muted => _colors.muted(const Color(0xFF827A95));

  @override
  Widget build(BuildContext context) {
    final points = widget.points;
    final subjects = <String, String>{
      for (final point in points)
        for (final row in point.card.subjects)
          examSubjectKey(row.subject): row.subject,
    };
    final subject = subjects.containsKey(_subject) ? _subject : '';
    final name = subjects[subject] ?? 'Overall';
    final color = subject.isEmpty ? _purple : reportSubjectTheme(name).color;
    final values = points.map((point) => point.value(subject)).toList();
    final found = points.indexWhere(
      (point) => point.card.examId == _selectedId,
    );
    final index = found < 0 ? points.length - 1 : found;
    final selected = index < 0 ? null : points[index];
    ReportCardSubject? selectedSubject;
    if (selected != null && subject.isNotEmpty) {
      for (final row in selected.card.subjects) {
        if (examSubjectKey(row.subject) == subject) selectedSubject = row;
      }
    }
    final latest = values.isEmpty ? null : values.last;
    final delta = values.length < 2
        ? null
        : examChange(latest, values[values.length - 2]);
    final firstDelta = values.length < 2
        ? null
        : examChange(latest, values.first);

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            _colors.tint(const Color(0xFFF3F0FF)),
            _colors.surface(Colors.white),
            _colors.tint(const Color(0xFFF4FCF9)),
          ],
        ),
        border: Border.all(color: _colors.line(const Color(0xFFE1DEF7))),
        borderRadius: BorderRadius.circular(22),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'YOUR REPORT-CARD STORY',
            style: TextStyle(
              fontSize: 9,
              letterSpacing: 1.6,
              fontWeight: FontWeight.w800,
              color: _colors.accent(const Color(0xFF7562BE)),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Exam Results Journey',
            style: TextStyle(
              fontSize: 21,
              fontWeight: FontWeight.w800,
              color: _colors.text(const Color(0xFF242342)),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'From one exam to the next — see what is improving and what needs a little practice.',
            style: TextStyle(fontSize: 12, color: _muted, height: 1.6),
          ),
          const SizedBox(height: 10),
          Text(
            '${points.length} released ${points.length == 1 ? 'exam' : 'exams'}',
            style: TextStyle(
              fontSize: 11,
              color: _colors.accent(_purple),
              fontWeight: FontWeight.w700,
            ),
          ),
          if (points.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 30),
              child: Column(
                children: [
                  const Text('📈', style: TextStyle(fontSize: 36)),
                  const SizedBox(height: 12),
                  const Text(
                    'Your exam story starts here',
                    style: TextStyle(fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'When all subject marks are ready and your report card is released, your first exam appears here. Each new exam adds a point.',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 12, color: _muted, height: 1.7),
                  ),
                ],
              ),
            ),
          if (selected != null) ...[
            const SizedBox(height: 14),
            Wrap(
              spacing: 6,
              runSpacing: 2,
              children: [
                ChoiceChip(
                  label: const Text('All subjects'),
                  selected: subject.isEmpty,
                  onSelected: (_) => setState(() => _subject = ''),
                ),
                for (final entry in subjects.entries)
                  ChoiceChip(
                    avatar: CircleAvatar(
                      radius: 4,
                      backgroundColor: reportSubjectTheme(entry.value).color,
                    ),
                    label: Text(entry.value),
                    selected: subject == entry.key,
                    onSelected: (_) => setState(() => _subject = entry.key),
                  ),
              ],
            ),
            const SizedBox(height: 14),
            _stat(
              'Latest ${name.toLowerCase()} result',
              latest == null ? 'Not included' : '${formatMarks(latest)}%',
              points.last.card.examName,
            ),
            const SizedBox(height: 8),
            _stat(
              'Since the previous exam',
              _changeLabel(delta, missing: latest == null),
              points.length == 1
                  ? 'The next exam will show your direction.'
                  : 'Percentage points (pp), not raw marks.',
              tone: delta == null
                  ? _purple
                  : delta < 0
                  ? const Color(0xFFA55316)
                  : const Color(0xFF087C5D),
            ),
            const SizedBox(height: 8),
            _stat(
              'Your journey so far',
              points.length < 2
                  ? 'Just beginning'
                  : firstDelta == null
                  ? 'Not comparable'
                  : '${firstDelta > 0 ? '+' : ''}${formatMarks(firstDelta)} pp',
              points.length == 1
                  ? 'One real result. No predictions.'
                  : 'Change from your first to latest exam',
            ),
            const SizedBox(height: 20),
            Text(
              '$name · score out of 100%',
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 5),
            Text(
              '↑ Higher · ↓ Lower · → Same · Swipe to see every exam',
              style: TextStyle(fontSize: 10, color: _muted),
            ),
            const SizedBox(height: 10),
            ExamJourneyChart(
              points: points,
              subject: subject,
              selectedIndex: index,
              color: color,
              onSelect: (i) =>
                  setState(() => _selectedId = points[i].card.examId),
            ),
            const SizedBox(height: 10),
            Text(
              'Tap an exam to explore its marks. Oldest to newest, in exam creation order. New released results are checked every minute.',
              style: TextStyle(fontSize: 10, color: _muted, height: 1.6),
            ),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: _colors.surface(Colors.white),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: _colors.line(const Color(0xFFE9E5F4)),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'EXAM ${index + 1} · SELECTED REPORT CARD',
                    style: TextStyle(
                      fontSize: 9,
                      color: _muted,
                      letterSpacing: 1,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    selected.card.examName,
                    style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    subject.isEmpty
                        ? 'All subjects · ${formatMarks(selected.total)}/${formatMarks(selected.maximum)} marks'
                        : selectedSubject == null
                        ? '$name · Subject not included'
                        : '$name · ${formatMarks(selectedSubject.marks)}/${formatMarks(selectedSubject.maxMarks)} marks',
                    style: TextStyle(fontSize: 11, color: _muted),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    _changeLabel(
                      examChange(
                        values[index],
                        index > 0 ? values[index - 1] : null,
                      ),
                      missing: values[index] == null,
                    ),
                    style: TextStyle(
                      fontSize: 12,
                      color: _colors.accent(_purple),
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  for (final row in selected.card.subjects) ...[
                    const SizedBox(height: 16),
                    _subjectMarks(
                      row,
                      index > 0
                          ? points[index - 1].value(examSubjectKey(row.subject))
                          : null,
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 14),
            Text(
              'Fair comparisons: 20/25 = 40/50 = 80/100 = 80%. Overall = total marks earned ÷ total possible × 100. “pp” means percentage points. Missing subjects are gaps, never zero marks. This is separate from Learning Power.',
              style: TextStyle(fontSize: 10, color: _muted, height: 1.7),
            ),
          ],
        ],
      ),
    );
  }

  Widget _stat(
    String label,
    String value,
    String detail, {
    Color tone = _purple,
  }) => Container(
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: _colors.surface(Colors.white),
      borderRadius: BorderRadius.circular(14),
      border: Border.all(color: _colors.line(const Color(0xFFEAE7F4))),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(fontSize: 10, color: _muted)),
        const SizedBox(height: 6),
        Text(
          value,
          style: TextStyle(
            fontSize: 22,
            color: _colors.accent(tone),
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 5),
        Text(detail, style: TextStyle(fontSize: 10, color: _muted)),
      ],
    ),
  );

  Widget _subjectMarks(ReportCardSubject row, double? previous) {
    final value = examPercentage(row.marks, row.maxMarks);
    final theme = reportSubjectTheme(row.subject);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                row.subject,
                style: TextStyle(
                  fontSize: 12,
                  color: _colors.accent(theme.dark),
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            Text(
              '${formatMarks(value)}%',
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
          ],
        ),
        const SizedBox(height: 7),
        ClipRRect(
          borderRadius: BorderRadius.circular(5),
          child: LinearProgressIndicator(
            value: value / 100,
            minHeight: 5,
            color: theme.color,
            backgroundColor: _colors.line(const Color(0xFFF0EEF6)),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          '${formatMarks(row.marks)}/${formatMarks(row.maxMarks)} marks · ${_changeLabel(examChange(value, previous))}',
          style: TextStyle(fontSize: 10, color: _muted),
        ),
      ],
    );
  }
}

String _changeLabel(double? value, {bool missing = false}) {
  if (missing) return 'Not included';
  if (value == null) return 'First result';
  if (value == 0) return '→ No change';
  return '${value > 0 ? '↑ Up' : '↓ Down'} ${formatMarks(value.abs())} pp';
}

class ExamJourneyChart extends StatelessWidget {
  final List<ExamJourneyPoint> points;
  final String subject;
  final int selectedIndex;
  final Color color;
  final ValueChanged<int> onSelect;

  const ExamJourneyChart({
    super.key,
    required this.points,
    required this.subject,
    required this.selectedIndex,
    required this.color,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final colors = ProgressColors.of(context);
      final width = math.max(constraints.maxWidth, points.length * 130.0 + 80);
      final values = points.map((point) => point.value(subject)).toList();
      double x(int index) => points.length == 1
          ? width / 2
          : 70 + index / (points.length - 1) * (width - 140);
      return SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: SizedBox(
          width: width,
          height: 280,
          child: Stack(
            children: [
              Positioned.fill(
                child: CustomPaint(
                  painter: _ExamPainter(values, selectedIndex, color, colors),
                ),
              ),
              for (var i = 0; i < points.length; i++)
                Positioned(
                  left: x(i) - 52,
                  top: 0,
                  bottom: 0,
                  width: 104,
                  child: Semantics(
                    button: true,
                    selected: selectedIndex == i,
                    label:
                        '${points[i].card.examName}: ${values[i] == null ? 'not included' : '${formatMarks(values[i]!)}%'}',
                    child: Tooltip(
                      message: points[i].card.examName,
                      child: InkWell(
                        onTap: () => onSelect(i),
                        child: Align(
                          alignment: Alignment.bottomCenter,
                          child: Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: Text(
                              points[i].card.examName,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                fontSize: 10,
                                color: selectedIndex == i
                                    ? colors.accent(color)
                                    : colors.muted(const Color(0xFF777087)),
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      );
    },
  );
}

class _ExamPainter extends CustomPainter {
  final ProgressColors colors;
  final List<double?> values;
  final int selectedIndex;
  final Color color;

  _ExamPainter(this.values, this.selectedIndex, this.color, this.colors);

  @override
  void paint(Canvas canvas, Size size) {
    double x(int index) => values.length == 1
        ? size.width / 2
        : 70 + index / (values.length - 1) * (size.width - 140);
    double y(double value) => 225 - value / 100 * 175;
    void label(String text, double left, double top, {Color? tone}) {
      final painter = TextPainter(
        text: TextSpan(
          text: text,
          style: TextStyle(
            fontSize: 10,
            color: tone == null
                ? colors.muted(const Color(0xFF827A95))
                : colors.accent(tone),
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      painter.paint(canvas, Offset(left - painter.width / 2, top));
    }

    for (final value in [0.0, 25.0, 50.0, 75.0, 100.0]) {
      canvas.drawLine(
        Offset(40, y(value)),
        Offset(size.width - 20, y(value)),
        Paint()..color = colors.guide(const Color(0xFFECEAF3)),
      );
      label('${value.toInt()}%', 18, y(value) - 6);
    }
    for (var i = 0; i < values.length; i++) {
      final value = values[i];
      if (value == null) {
        label('Not included', x(i), 205);
        continue;
      }
      if (i > 0 && values[i - 1] != null) {
        final previous = values[i - 1]!;
        final change = examChange(value, previous)!;
        canvas.drawLine(
          Offset(x(i - 1), y(previous)),
          Offset(x(i), y(value)),
          Paint()
            ..color = change > 0
                ? const Color(0xFF159674)
                : change < 0
                ? const Color(0xFFD97736)
                : color
            ..strokeWidth = 3
            ..strokeCap = StrokeCap.round,
        );
      }
      if (i == selectedIndex) {
        canvas.drawLine(
          Offset(x(i), 40),
          Offset(x(i), 230),
          Paint()..color = color.withValues(alpha: colors.isDark ? .4 : .15),
        );
      }
      canvas.drawCircle(
        Offset(x(i), y(value)),
        i == selectedIndex ? 7 : 5,
        Paint()..color = colors.surface(Colors.white),
      );
      canvas.drawCircle(
        Offset(x(i), y(value)),
        i == selectedIndex ? 7 : 5,
        Paint()
          ..color = color
          ..style = PaintingStyle.stroke
          ..strokeWidth = 3,
      );
      label('${formatMarks(value)}%', x(i), y(value) - 24, tone: color);
    }
  }

  @override
  bool shouldRepaint(covariant _ExamPainter oldDelegate) => true;
}
