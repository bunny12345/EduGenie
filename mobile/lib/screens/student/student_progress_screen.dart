import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/learning_score.dart';
import '../../state/student_providers.dart';
import '../../widgets/section_card.dart';
import 'progress/progress_charts.dart';
import 'progress/progress_helpers.dart';
import 'progress/subject_progress_detail_screen.dart';

/// My Learning Report — mirrors `web/src/components/StudentProgress.jsx` +
/// `StudentProgress.css` exactly (same cards, gauge, radar, growth charts,
/// colors), resized to stack in a single column on a phone screen.
class StudentProgressScreen extends ConsumerStatefulWidget {
  const StudentProgressScreen({super.key});

  @override
  ConsumerState<StudentProgressScreen> createState() => _StudentProgressScreenState();
}

class _StudentProgressScreenState extends ConsumerState<StudentProgressScreen> {
  String _trendView = 'daily';
  String _subjView = 'daily';

  @override
  Widget build(BuildContext context) {
    final dataAsync = ref.watch(learningScoreProvider);
    final greetingName = ref.watch(dashboardProvider).value?.greetingName;

    return Scaffold(
      backgroundColor: const Color(0xFFF7F7FC),
      appBar: AppBar(
        title: const Text('My Learning Report'),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: () => ref.invalidate(learningScoreProvider),
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(learningScoreProvider),
        child: dataAsync.when(
          loading: () => const SizedBox.shrink(),
          error: (e, _) => ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 40),
                child: Column(
                  children: [
                    const Text('Could not load your progress right now.', style: TextStyle(color: Color(0xFF6B7194), fontWeight: FontWeight.w600)),
                    const SizedBox(height: 12),
                    ElevatedButton(onPressed: () => ref.invalidate(learningScoreProvider), child: const Text('Try again')),
                  ],
                ),
              ),
            ],
          ),
          data: (data) => _ReportBody(
            data: data,
            greetingName: greetingName,
            trendView: _trendView,
            subjView: _subjView,
            onTrendViewChange: (v) => setState(() => _trendView = v),
            onSubjViewChange: (v) => setState(() => _subjView = v),
          ),
        ),
      ),
    );
  }
}

class _ReportBody extends StatelessWidget {
  final LearningScoreData data;
  final String? greetingName;
  final String trendView;
  final String subjView;
  final void Function(String) onTrendViewChange;
  final void Function(String) onSubjViewChange;

  const _ReportBody({
    required this.data,
    required this.greetingName,
    required this.trendView,
    required this.subjView,
    required this.onTrendViewChange,
    required this.onSubjViewChange,
  });

  @override
  Widget build(BuildContext context) {
    final level = levelFace(data.score);
    final activeTrend = trendView == 'daily' ? data.dailyTrend : data.trend;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(
          'A fun, simple picture of how ${greetingName ?? 'you'} ${greetingName != null ? 'is' : 'are'} growing — not just marks.',
          style: const TextStyle(fontSize: 12.5, color: Color(0xFF6B7194)),
        ),
        const SizedBox(height: 14),
        if (data.alert != null) _AlertBanner(alert: data.alert!),
        _ScoreCard(score: data.score, maxScore: data.maxScore, color: data.color, level: level, momentumDelta: data.momentumDelta),
        const SizedBox(height: 12),
        SectionCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _CardHead(
                title: '📈 My total score over time',
                sub: 'Everything added together (out of 1000)'
                    '${data.trackingSince != null ? ' · ${data.trackingSince}' : ''}'
                    '${data.academicEndLabel != null ? ' → ${data.academicEndLabel}' : ''} — up means you\'re learning more!',
                view: trendView,
                onChange: onTrendViewChange,
              ),
              const SizedBox(height: 10),
              GrowthLineChart(points: activeTrend, maxY: 1000, gridVals: const [250, 500, 750, 1000], color: data.color, mode: trendView),
            ],
          ),
        ),
        const SizedBox(height: 12),
        SectionCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('🌟 What makes up my score', style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w800, color: Color(0xFF1E2140))),
              const Text('Nine skills that show real learning', style: TextStyle(fontSize: 11.5, color: Color(0xFF8B90AD))),
              const SizedBox(height: 12),
              Center(
                child: Column(
                  children: [
                    RadarChart(dimensions: data.dimensions, emojis: [for (final d in data.dimensions) skillMetaFor(d.key, d.label).emoji], color: data.color, diameter: 220),
                    const SizedBox(height: 6),
                    const Text('The bigger the shape, the stronger you are all-round.', textAlign: TextAlign.center, style: TextStyle(fontSize: 11.5, color: Color(0xFF8B90AD))),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisSpacing: 8,
                mainAxisSpacing: 8,
                childAspectRatio: 2.1,
                children: [
                  for (final d in data.dimensions) _SkillCard(meta: skillMetaFor(d.key, d.label), value: d.value),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        SectionCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('⭐ You\'re great at', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: Color(0xFF1E2140))),
              const SizedBox(height: 6),
              if (data.strengths.isEmpty)
                const Text('Keep studying to reveal your superpowers!', style: TextStyle(fontSize: 12.5, color: Color(0xFF9AA0BD)))
              else
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final s in data.strengths)
                      _Tag(text: '${skillMetaFor(s.key, s.label).emoji} ${skillMetaFor(s.key, s.label).name} · ${s.value}%', bg: const Color(0xFFDCFCE7), color: const Color(0xFF15803D)),
                  ],
                ),
              const SizedBox(height: 14),
              const Text('🎯 Practise next', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: Color(0xFF1E2140))),
              const SizedBox(height: 6),
              if (data.focusAreas.isEmpty)
                const Text('You\'re nicely balanced right now!', style: TextStyle(fontSize: 12.5, color: Color(0xFF9AA0BD)))
              else
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final s in data.focusAreas)
                      _Tag(text: '${skillMetaFor(s.key, s.label).emoji} ${skillMetaFor(s.key, s.label).name} · ${s.value}%', bg: const Color(0xFFFEF3C7), color: const Color(0xFFB45309)),
                  ],
                ),
            ],
          ),
        ),
        if (data.improvements.isNotEmpty) ...[
          const SizedBox(height: 12),
          SectionCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('🚀 Your next steps', style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w800, color: Color(0xFF1E2140))),
                const Text('Small steps, big wins', style: TextStyle(fontSize: 11.5, color: Color(0xFF8B90AD))),
                const SizedBox(height: 10),
                for (var i = 0; i < data.improvements.length; i++)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('${i + 1}.', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: Color(0xFF6D5EFC))),
                        const SizedBox(width: 8),
                        Expanded(child: Text(data.improvements[i], style: const TextStyle(fontSize: 13, color: Color(0xFF4A4F70), height: 1.5))),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ],
        const SizedBox(height: 12),
        SectionCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _CardHead(
                title: '📚 Each subject on its own',
                sub: 'Spot which subject needs more love',
                view: subjView,
                onChange: onSubjViewChange,
              ),
              const SizedBox(height: 10),
              for (final s in data.subjects) ...[
                _SubjectCard(subject: s, view: subjView),
                const SizedBox(height: 8),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _AlertBanner extends StatelessWidget {
  final ScoreAlert alert;

  const _AlertBanner({required this.alert});

  static const _bg = {
    'alert': [Color(0xFFFFF1F2), Color(0xFFFFE4E6)],
    'warn': [Color(0xFFFFFBEB), Color(0xFFFEF3C7)],
    'good': [Color(0xFFF0FDF4), Color(0xFFDCFCE7)],
    'info': [Color(0xFFEFF6FF), Color(0xFFE0F2FE)],
  };
  static const _border = {
    'alert': Color(0xFFFECDD3),
    'warn': Color(0xFFFDE68A),
    'good': Color(0xFFBBF7D0),
    'info': Color(0xFFBAE6FD),
  };
  static const _text = {
    'alert': Color(0xFF9F1239),
    'warn': Color(0xFF92400E),
    'good': Color(0xFF166534),
    'info': Color(0xFF075985),
  };

  @override
  Widget build(BuildContext context) {
    final colors = _bg[alert.level] ?? _bg['info']!;
    final icon = alert.level == 'alert' ? '⚠️' : (alert.level == 'warn' ? '🔔' : (alert.level == 'good' ? '🎉' : '🚀'));
    final textColor = _text[alert.level] ?? _text['info']!;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: colors),
        border: Border.all(color: _border[alert.level] ?? _border['info']!),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(icon, style: const TextStyle(fontSize: 22)),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(alert.title, style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: textColor)),
                const SizedBox(height: 3),
                Text(alert.message, style: TextStyle(fontSize: 12.5, color: textColor, height: 1.4)),
                if (alert.dropped.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      for (final d in alert.dropped)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                          decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.7), borderRadius: BorderRadius.circular(999)),
                          child: Text(
                            '${skillMetaFor(d.key, d.label).emoji} ${skillMetaFor(d.key, d.label).name} ${d.delta > 0 ? '+' : ''}${d.delta}%',
                            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFFDC2626)),
                          ),
                        ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ScoreCard extends StatelessWidget {
  final int score;
  final int maxScore;
  final Color color;
  final LevelFace level;
  final int momentumDelta;

  const _ScoreCard({required this.score, required this.maxScore, required this.color, required this.level, required this.momentumDelta});

  @override
  Widget build(BuildContext context) {
    final momentumUp = momentumDelta > 0;
    final momentumDown = momentumDelta < 0;
    final momentumBg = momentumUp ? const Color(0xFFDCFCE7) : (momentumDown ? const Color(0xFFFEE2E2) : const Color(0xFFEEF0FA));
    final momentumColor = momentumUp ? const Color(0xFF16A34A) : (momentumDown ? const Color(0xFFDC2626) : const Color(0xFF6B7194));
    return SectionCard(
      child: Column(
        children: [
          RingGauge(
            diameter: 160,
            strokeWidth: 13,
            fraction: maxScore > 0 ? score / maxScore : 0,
            color: color,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(level.face, style: const TextStyle(fontSize: 26)),
                Text('$score', style: TextStyle(fontSize: 34, fontWeight: FontWeight.w900, color: color, letterSpacing: -0.5)),
                const Text('out of 1000', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF9AA0BD))),
              ],
            ),
          ),
          const SizedBox(height: 10),
          const Text('YOUR LEARNING POWER', style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, letterSpacing: 0.6, color: Color(0xFF9AA0BD))),
          const SizedBox(height: 6),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 7),
            decoration: BoxDecoration(borderRadius: BorderRadius.circular(999), gradient: LinearGradient(colors: kToneGradients[level.tone] ?? kToneGradients['none']!)),
            child: Text('${level.face} ${level.word}', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: Colors.white)),
          ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
            decoration: BoxDecoration(color: momentumBg, borderRadius: BorderRadius.circular(999)),
            child: Text(
              '${momentumUp ? '▲ Up' : (momentumDown ? '▼ Down' : '— Same')} ${momentumDelta.abs()} points in the last 30 days',
              style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: momentumColor),
            ),
          ),
          const SizedBox(height: 10),
          const Text(
            'This ONE big score adds up all subjects — tests, homework, reading, practice and asking questions. Do a little every day and watch it grow! 🌱',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12, color: Color(0xFF8B90AD), height: 1.5),
          ),
        ],
      ),
    );
  }
}

class _CardHead extends StatelessWidget {
  final String title;
  final String sub;
  final String view;
  final void Function(String) onChange;

  const _CardHead({required this.title, required this.sub, required this.view, required this.onChange});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w800, color: Color(0xFF1E2140))),
        const SizedBox(height: 2),
        Text(sub, style: const TextStyle(fontSize: 11.5, color: Color(0xFF8B90AD))),
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.all(3),
          decoration: BoxDecoration(color: const Color(0xFFF1F2FB), borderRadius: BorderRadius.circular(999)),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              _ToggleBtn(label: 'Day by day', active: view == 'daily', onTap: () => onChange('daily')),
              _ToggleBtn(label: 'Month by month', active: view == 'monthly', onTap: () => onChange('monthly')),
            ],
          ),
        ),
      ],
    );
  }
}

class _ToggleBtn extends StatelessWidget {
  final String label;
  final bool active;
  final VoidCallback onTap;

  const _ToggleBtn({required this.label, required this.active, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: active ? Colors.white : Colors.transparent,
      borderRadius: BorderRadius.circular(999),
      elevation: active ? 2 : 0,
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          child: Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: active ? const Color(0xFF5B47FF) : const Color(0xFF6B7194))),
        ),
      ),
    );
  }
}

class _SkillCard extends StatelessWidget {
  final SkillMeta meta;
  final int value;

  const _SkillCard({required this.meta, required this.value});

  @override
  Widget build(BuildContext context) {
    final lw = levelWord(value);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: BoxDecoration(color: const Color(0xFFFBFBFF), border: Border.all(color: const Color(0xFFEEF0FA)), borderRadius: BorderRadius.circular(11)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Text(meta.emoji, style: const TextStyle(fontSize: 12.5)),
              const SizedBox(width: 4),
              Expanded(child: Text(meta.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, color: Color(0xFF3A3F5E)))),
              Text('$value%', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900, color: Color(0xFF2B2F4E))),
            ],
          ),
          const SizedBox(height: 4),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: Container(
              height: 5,
              color: const Color(0xFFEEF0FA),
              child: FractionallySizedBox(alignment: Alignment.centerLeft, widthFactor: (value.clamp(2, 100)) / 100, child: Container(color: valueColor(value))),
            ),
          ),
          const SizedBox(height: 3),
          Text(lw.word, style: TextStyle(fontSize: 9, fontWeight: FontWeight.w800, color: kSkillWordColors[lw.klass])),
        ],
      ),
    );
  }
}

class _Tag extends StatelessWidget {
  final String text;
  final Color bg;
  final Color color;

  const _Tag({required this.text, required this.bg, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(10)),
      child: Text(text, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: color)),
    );
  }
}

class _SubjectCard extends StatelessWidget {
  final SubjectProgress subject;
  final String view;

  const _SubjectCard({required this.subject, required this.view});

  @override
  Widget build(BuildContext context) {
    final series = view == 'daily' ? subject.daily : subject.monthly;
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => SubjectProgressDetailScreen(subject: subject))),
        child: Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: const Color(0xFFEEF0FA)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(height: 2.5, margin: const EdgeInsets.only(bottom: 6), decoration: BoxDecoration(color: subject.accent, borderRadius: BorderRadius.circular(999))),
              Row(
                children: [
                  RingGauge(
                    diameter: 40,
                    strokeWidth: 4.5,
                    fraction: subject.score / 100,
                    color: subject.accent,
                    child: Text.rich(
                      TextSpan(children: [
                        TextSpan(text: '${subject.score}', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900, color: Color(0xFF2B2F4E))),
                        const TextSpan(text: '%', style: TextStyle(fontSize: 7, color: Color(0xFF9AA0BD))),
                      ]),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('${subject.emoji} ${subject.name}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: Color(0xFF1E2140))),
                        const SizedBox(height: 2),
                        Row(
                          children: [
                            _StatusChip(status: subject.status, label: subject.statusLabel),
                            if (subject.status != 'not-started' && subject.trend != 0) ...[
                              const SizedBox(width: 5),
                              Text(
                                '${subject.trend > 0 ? '▲' : '▼'} ${subject.trend.abs()}%',
                                style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w800, color: subject.trend > 0 ? const Color(0xFF16A34A) : const Color(0xFFDC2626)),
                              ),
                            ],
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              GrowthLineChart(points: series, maxY: 100, gridVals: const [], color: subject.accent, mode: view, mini: true, miniHeight: 34),
              const SizedBox(height: 3),
              Text(subject.tip, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 10.5, color: Color(0xFF6B7194), height: 1.3)),
              const SizedBox(height: 3),
              Text('Tap to see more →', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: subject.accent)),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  final String status;
  final String label;

  const _StatusChip({required this.status, required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 2),
      decoration: BoxDecoration(color: kStatusChipBg[status] ?? const Color(0xFFEEF0FA), borderRadius: BorderRadius.circular(999)),
      child: Text(label, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: kStatusChipText[status] ?? const Color(0xFF6B7194))),
    );
  }
}

