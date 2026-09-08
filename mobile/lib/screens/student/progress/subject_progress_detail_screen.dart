import 'package:flutter/material.dart';

import '../../../models/learning_score.dart';
import 'progress_charts.dart';
import 'progress_helpers.dart';

/// Full "report card" for one subject — mirrors web's `SubjectDetail` modal,
/// shown as its own screen on mobile (rather than an overlay) so it has room
/// to breathe, same content/design otherwise.
class SubjectProgressDetailScreen extends StatefulWidget {
  final SubjectProgress subject;

  const SubjectProgressDetailScreen({super.key, required this.subject});

  @override
  State<SubjectProgressDetailScreen> createState() => _SubjectProgressDetailScreenState();
}

class _SubjectProgressDetailScreenState extends State<SubjectProgressDetailScreen> {
  String _view = 'daily';

  @override
  Widget build(BuildContext context) {
    final subject = widget.subject;
    final lw = levelWord(subject.score);
    final series = _view == 'daily' ? subject.daily : subject.monthly;
    final notStarted = subject.status == 'not-started';

    return Scaffold(
      backgroundColor: const Color(0xFFF7F7FC),
      appBar: AppBar(title: Text(subject.name)),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Row(
              children: [
                Text(subject.emoji, style: const TextStyle(fontSize: 40)),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(subject.name, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: Color(0xFF1E2140))),
                      const SizedBox(height: 4),
                      Wrap(
                        crossAxisAlignment: WrapCrossAlignment.center,
                        spacing: 8,
                        children: [
                          _StatusChip(status: subject.status, label: subject.statusLabel),
                          if (!notStarted && subject.trend != 0)
                            Text(
                              '${subject.trend > 0 ? '▲ up' : '▼ down'} ${subject.trend.abs()}% this month',
                              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: subject.trend > 0 ? const Color(0xFF16A34A) : const Color(0xFFDC2626)),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
            if (notStarted) ...[
              const SizedBox(height: 20),
              const Center(child: Text('🌱', style: TextStyle(fontSize: 46))),
              const SizedBox(height: 10),
              Center(child: Text("You haven't started ${subject.name} yet.", textAlign: TextAlign.center, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Color(0xFF1E2140)))),
              const SizedBox(height: 6),
              Center(child: Text(subject.tip, textAlign: TextAlign.center, style: const TextStyle(fontSize: 13, color: Color(0xFF6B7194)))),
            ] else ...[
              Center(
                child: RingGauge(
                  diameter: 170,
                  strokeWidth: 14,
                  fraction: subject.score1000 / 1000,
                  color: subject.accent,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(lw.klass == 'great' ? '🤩' : (lw.klass == 'good' ? '🙂' : '💪'), style: const TextStyle(fontSize: 26)),
                      Text('${subject.score1000}', style: TextStyle(fontSize: 34, fontWeight: FontWeight.w900, color: subject.accent, letterSpacing: -0.5)),
                      const Text('out of 1000', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF9AA0BD))),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 6),
              Center(
                child: Text(
                  'Your ${subject.name} power — out of 1000, just for this subject.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 12.5, color: Color(0xFF6B7194)),
                ),
              ),
              const SizedBox(height: 22),
              _CardHead(title: '📈 ${subject.name} over time', sub: "When the line goes up, you're getting better at ${subject.name}!", view: _view, onChange: (v) => setState(() => _view = v)),
              const SizedBox(height: 8),
              GrowthLineChart(points: series, maxY: 100, gridVals: const [25, 50, 75, 100], color: subject.accent, mode: _view, percentSuffix: true),
              const SizedBox(height: 22),
              Text('🌟 What makes up your ${subject.name} score', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Color(0xFF1E2140))),
              const SizedBox(height: 10),
              GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisSpacing: 10,
                mainAxisSpacing: 10,
                childAspectRatio: 2.1,
                children: [for (final m in subject.metrics) _SkillCard(emoji: m.emoji, name: m.label, value: m.value)],
              ),
              const SizedBox(height: 22),
              GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisSpacing: 10,
                mainAxisSpacing: 10,
                childAspectRatio: 1.3,
                children: [
                  for (final s in subject.stats) _StatCounter(emoji: s.emoji, value: '${s.value}', label: s.label),
                  if (subject.bestTest > 0) _StatCounter(emoji: '🏆', value: '${subject.bestTest}%', label: 'Best test'),
                ],
              ),
              const SizedBox(height: 16),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  if (subject.strength != null) _Tag(text: '⭐ Best: ${subject.strength!.emoji} ${subject.strength!.label} · ${subject.strength!.value}%', bg: const Color(0xFFDCFCE7), color: const Color(0xFF15803D)),
                  if (subject.focus != null) _Tag(text: '🎯 Practise: ${subject.focus!.emoji} ${subject.focus!.label} · ${subject.focus!.value}%', bg: const Color(0xFFFEF3C7), color: const Color(0xFFB45309)),
                ],
              ),
              const SizedBox(height: 12),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(color: const Color(0xFFF8F9FF), borderRadius: BorderRadius.circular(12)),
                child: Text('💡 ${subject.tip}', style: const TextStyle(fontSize: 13.5, color: Color(0xFF4A4F70), height: 1.5)),
              ),
            ],
          ],
        ),
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
        Text(title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Color(0xFF1E2140))),
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
  final String emoji;
  final String name;
  final int value;

  const _SkillCard({required this.emoji, required this.name, required this.value});

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
              Text(emoji, style: const TextStyle(fontSize: 12.5)),
              const SizedBox(width: 4),
              Expanded(child: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, color: Color(0xFF3A3F5E)))),
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

class _StatCounter extends StatelessWidget {
  final String emoji;
  final String value;
  final String label;

  const _StatCounter({required this.emoji, required this.value, required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(color: const Color(0xFFF8F9FF), border: Border.all(color: const Color(0xFFEEF0FA)), borderRadius: BorderRadius.circular(14)),
      alignment: Alignment.center,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(emoji, style: const TextStyle(fontSize: 18)),
          Text(value, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Color(0xFF2B2F4E))),
          Text(label, textAlign: TextAlign.center, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Color(0xFF8B90AD))),
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

class _StatusChip extends StatelessWidget {
  final String status;
  final String label;

  const _StatusChip({required this.status, required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 2),
      decoration: BoxDecoration(color: kStatusChipBg[status] ?? const Color(0xFFEEF0FA), borderRadius: BorderRadius.circular(999)),
      child: Text(label, style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, color: kStatusChipText[status] ?? const Color(0xFF6B7194))),
    );
  }
}
