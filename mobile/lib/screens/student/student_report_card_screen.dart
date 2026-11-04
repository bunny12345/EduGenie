import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/report_card.dart';
import '../../state/session_provider.dart';
import '../../state/student_providers.dart';
import '../../theme/app_colors.dart';
import '../../theme/report_card_theme.dart';
import '../../widgets/rank_badge.dart';
import '../../widgets/rank_celebration.dart';
import '../../widgets/section_card.dart';

/// Student "Report Card" screen — replaces the old Mock Tests tile. Mirrors
/// `web/src/components/StudentReportCard.jsx`'s paper-report-card look. A
/// card only ever shows up here once every subject teacher of the class has
/// entered marks (enforced server-side) — there is no "pending" state.
///
/// A top-3 student gets a one-time full-screen celebration the first time they
/// open the new results (the server remembers it, so it never replays).
class StudentReportCardScreen extends ConsumerStatefulWidget {
  const StudentReportCardScreen({super.key});

  @override
  ConsumerState<StudentReportCardScreen> createState() => _StudentReportCardScreenState();
}

class _StudentReportCardScreenState extends ConsumerState<StudentReportCardScreen> {
  String? _selectedExamId;
  // Exams already celebrated this session, so a refresh can't replay one.
  final _celebrated = <String>{};

  void _maybeCelebrate(ReportCardsData data, String name) {
    final pending = data.cards.where((c) => c.celebrationPending && !_celebrated.contains(c.examId));
    if (pending.isEmpty) return;
    final card = pending.first;
    _celebrated.add(card.examId);
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) return;
      setState(() => _selectedExamId = card.examId);
      // Fire-and-forget: mark as seen as soon as the celebration starts.
      ref.read(studentApiServiceProvider).markReportCardCelebrated(card.examId).catchError((_) {});
      await showGeneralDialog<void>(
        context: context,
        barrierDismissible: false,
        barrierColor: Colors.transparent,
        transitionDuration: const Duration(milliseconds: 250),
        pageBuilder: (ctx, _, _) => RankCelebration(
          rank: card.rank ?? 3,
          name: name,
          className: card.className,
          examName: card.examName,
          onClose: () => Navigator.of(ctx).pop(),
        ),
        transitionBuilder: (ctx, anim, _, child) => FadeTransition(opacity: anim, child: child),
      );
      // The badge in the profile chip should appear right away.
      ref.invalidate(reportCardsProvider);
    });
  }

  @override
  Widget build(BuildContext context) {
    final cardsAsync = ref.watch(reportCardsProvider);
    final session = ref.watch(sessionProvider).value;
    final studentName = session?.name.isNotEmpty == true ? session!.name : 'Student';

    return Scaffold(
      backgroundColor: const Color(0xFFF7F7FC),
      appBar: AppBar(title: const Text('Report Card')),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(reportCardsProvider),
        child: cardsAsync.when(
          loading: () => ListView(padding: const EdgeInsets.all(16), children: const [SkeletonBox(height: 420)]),
          error: (e, _) => ListView(
            padding: const EdgeInsets.all(16),
            children: [ErrorInline(message: 'Unable to load your report card: $e')],
          ),
          data: (data) {
            final cards = data.cards;
            _maybeCelebrate(data, studentName);
            if (cards.isEmpty) {
              return ListView(
                padding: const EdgeInsets.all(24),
                children: [
                  const SizedBox(height: 60),
                  const Center(child: Text('📝', style: TextStyle(fontSize: 44))),
                  const SizedBox(height: 10),
                  const Center(
                    child: Text('No report card yet', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Color(0xFF1F2347))),
                  ),
                  const SizedBox(height: 6),
                  Center(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: Text(
                        'Your results appear here as soon as every subject teacher has added their marks.',
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 13, color: AppColors.muted),
                      ),
                    ),
                  ),
                ],
              );
            }
            final card = cards.firstWhere((c) => c.examId == _selectedExamId, orElse: () => cards.first);
            return ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (cards.length > 1) ...[
                  SizedBox(
                    height: 40,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: cards.length,
                      separatorBuilder: (_, _) => const SizedBox(width: 8),
                      itemBuilder: (context, i) {
                        final c = cards[i];
                        final active = c.examId == card.examId;
                        return ChoiceChip(
                          label: Text(c.examName),
                          selected: active,
                          onSelected: (_) => setState(() => _selectedExamId = c.examId),
                          selectedColor: AppColors.brand,
                          labelStyle: TextStyle(color: active ? Colors.white : AppColors.text, fontWeight: FontWeight.w700),
                        );
                      },
                    ),
                  ),
                  const SizedBox(height: 12),
                ],
                ReportCardSheet(card: card, studentName: studentName),
              ],
            );
          },
        ),
      ),
    );
  }
}

/// The paper-style report card — shared by the student screen and the
/// teacher's Student Progress tab so both render identically.
class ReportCardSheet extends StatelessWidget {
  final ReportCard card;
  final String studentName;

  /// Teachers see the real class rank (e.g. "4 of 38"); students only ever see
  /// a rank when they are in the top 3.
  final bool teacherView;

  const ReportCardSheet({super.key, required this.card, required this.studentName, this.teacherView = false});

  @override
  Widget build(BuildContext context) {
    final remarked = card.subjects.where((s) => s.remarks.isNotEmpty).toList();
    return Container(
      padding: const EdgeInsets.fromLTRB(18, 20, 18, 22),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFFC6EC7A), Color(0xFF9BE08F), Color(0xFF7FD6A8)],
        ),
        borderRadius: BorderRadius.circular(26),
        border: Border.all(color: Colors.white, width: 3),
        boxShadow: const [BoxShadow(color: Color(0x3C3C783C), blurRadius: 26, offset: Offset(0, 10))],
      ),
      child: Column(
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
            padding: const EdgeInsets.all(8),
            child: Image.asset('assets/branding/logo.png', errorBuilder: (_, _, _) => const Icon(Icons.school_rounded)),
          ),
          const SizedBox(height: 8),
          const Text(
            'REPORT CARD',
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, letterSpacing: 2, color: Color(0xFF2B2F7A)),
          ),
          const SizedBox(height: 6),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
            decoration: BoxDecoration(color: const Color(0xFF2B2F7A), borderRadius: BorderRadius.circular(999)),
            child: Text(card.examName, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 12)),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(child: _IdentBox(label: 'Student Name', value: studentName)),
              const SizedBox(width: 10),
              Expanded(child: _IdentBox(label: 'Class', value: card.className)),
            ],
          ),
          const SizedBox(height: 14),
          for (final s in card.subjects) _SubjectRow(subject: s),
          const SizedBox(height: 14),
          Wrap(
            alignment: WrapAlignment.spaceBetween,
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 10,
            runSpacing: 10,
            children: [
              _StatBox(label: 'Total', value: '${formatMarks(card.total)}/${formatMarks(card.maxTotal)}'),
              _StatBox(label: 'Percentage', value: '${formatMarks(card.percentage)}%'),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
                decoration: BoxDecoration(
                  color: reportGradeColor(card.grade),
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.7), width: 3),
                ),
                child: Column(
                  children: [
                    const Text('OVERALL', style: TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w800, letterSpacing: 1)),
                    Text(card.grade, style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w900)),
                  ],
                ),
              ),
            ],
          ),
          if (card.rank != null && card.rank! <= 3) ...[
            const SizedBox(height: 12),
            _RankPill(
              rank: card.rank!,
              text: teacherView
                  ? 'Class rank ${card.rank} of ${card.classSize}'
                  : '${rankOrdinal(card.rank!)} in ${card.className.isEmpty ? 'class' : card.className}',
            ),
          ] else if (teacherView && card.rank != null) ...[
            const SizedBox(height: 12),
            Align(
              alignment: Alignment.centerLeft,
              child: _StatBox(label: 'Class rank', value: '${card.rank} of ${card.classSize}'),
            ),
          ],
          if (card.toppers.isNotEmpty) ...[
            const SizedBox(height: 12),
            _ToppersStrip(toppers: card.toppers),
          ],
          const SizedBox(height: 14),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 8),
            decoration: BoxDecoration(color: const Color(0xFF2B2F7A), borderRadius: BorderRadius.circular(10)),
            child: const Text(
              'FEEDBACK & REMARKS',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 1),
            ),
          ),
          Container(
            width: double.infinity,
            margin: const EdgeInsets.only(top: 8),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14)),
            child: remarked.isEmpty
                ? const Text('Keep up the great work! 🌟', style: TextStyle(color: Color(0xFF6B6FA5)))
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      for (final s in remarked)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 4),
                          child: RichText(
                            text: TextSpan(
                              style: const TextStyle(fontSize: 13, color: Color(0xFF1F2347)),
                              children: [
                                TextSpan(
                                  text: '${reportSubjectTheme(s.subject).emoji} ${s.subject}: ',
                                  style: TextStyle(fontWeight: FontWeight.w800, color: reportSubjectTheme(s.subject).dark),
                                ),
                                TextSpan(text: s.remarks),
                              ],
                            ),
                          ),
                        ),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

/// Gold/silver/bronze-framed "you ranked Nth" strip with the medal badge.
class _RankPill extends StatelessWidget {
  final int rank;
  final String text;

  const _RankPill({required this.rank, required this.text});

  @override
  Widget build(BuildContext context) {
    final ring = rank == 1 ? const Color(0xFFFFD21F) : rank == 2 ? const Color(0xFFC5CDE0) : const Color(0xFFE0A06A);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(10, 6, 16, 6),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.9),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: ring, width: 3),
      ),
      child: Row(
        children: [
          RankBadge(rank: rank, size: rank == 1 ? 84 : 76),
          const SizedBox(width: 12),
          Expanded(
            child: Text(text, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: Color(0xFF23275C))),
          ),
        ],
      ),
    );
  }
}

/// "Class Toppers" names (no marks) so the whole class can see who ranked 1–3.
class _ToppersStrip extends StatelessWidget {
  final List<ReportCardTopper> toppers;

  const _ToppersStrip({required this.toppers});

  @override
  Widget build(BuildContext context) {
    const medals = ['', '🥇', '🥈', '🥉'];
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.85), borderRadius: BorderRadius.circular(14)),
      child: Wrap(
        spacing: 8,
        runSpacing: 6,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          const Text('🏆 Class Toppers', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: Color(0xFF23275C))),
          for (final t in toppers)
            Container(
              padding: const EdgeInsets.fromLTRB(6, 3, 12, 3),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: const Color(0xFFE6E9F8), width: 1.5),
              ),
              child: Text('${medals[t.rank.clamp(0, 3)]} ${t.name}', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Color(0xFF23275C))),
            ),
        ],
      ),
    );
  }
}

class _IdentBox extends StatelessWidget {
  final String label;
  final String value;

  const _IdentBox({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.78), borderRadius: BorderRadius.circular(12)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label.toUpperCase(), style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w800, letterSpacing: 0.6, color: Color(0xFF5A5F99))),
          const SizedBox(height: 2),
          Text(value, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Color(0xFF23275C))),
        ],
      ),
    );
  }
}

class _StatBox extends StatelessWidget {
  final String label;
  final String value;

  const _StatBox({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label.toUpperCase(), style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w800, letterSpacing: 0.6, color: Color(0xFF6B6FA5))),
          Text(value, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Color(0xFF23275C))),
        ],
      ),
    );
  }
}

class _SubjectRow extends StatelessWidget {
  final ReportCardSubject subject;

  const _SubjectRow({required this.subject});

  @override
  Widget build(BuildContext context) {
    final theme = reportSubjectTheme(subject.subject);
    final pct = subject.percentage.clamp(0, 100).toDouble();
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border(left: BorderSide(color: theme.color, width: 5)),
        boxShadow: const [BoxShadow(color: Color(0x14232764), blurRadius: 6, offset: Offset(0, 2))],
      ),
      child: Row(
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(gradient: theme.gradient, borderRadius: BorderRadius.circular(10)),
            alignment: Alignment.center,
            child: Text(theme.emoji, style: const TextStyle(fontSize: 17)),
          ),
          const SizedBox(width: 10),
          Expanded(
            flex: 3,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(subject.subject, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: theme.dark)),
                const SizedBox(height: 4),
                Stack(
                  children: [
                    Container(height: 10, decoration: BoxDecoration(color: theme.soft, borderRadius: BorderRadius.circular(999))),
                    FractionallySizedBox(
                      widthFactor: pct / 100,
                      child: Container(height: 10, decoration: BoxDecoration(gradient: theme.gradient, borderRadius: BorderRadius.circular(999))),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              RichText(
                text: TextSpan(
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: theme.dark),
                  children: [
                    TextSpan(text: formatMarks(subject.marks)),
                    TextSpan(text: '/${formatMarks(subject.maxMarks)}', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
                  ],
                ),
              ),
              Text('${formatMarks(subject.percentage)}%', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: theme.dark)),
            ],
          ),
          const SizedBox(width: 8),
          Container(
            width: 34,
            height: 28,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: reportGradeColor(subject.grade), borderRadius: BorderRadius.circular(999)),
            child: Text(subject.grade, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 12)),
          ),
        ],
      ),
    );
  }
}
