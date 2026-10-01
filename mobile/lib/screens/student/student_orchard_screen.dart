import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/orchard_data.dart';
import '../../state/session_provider.dart';
import '../../state/student_providers.dart';
import '../../theme/app_colors.dart';
import '../../widgets/orchard/orchard_ambience.dart';
import '../../widgets/orchard/orchard_skeleton.dart';
import '../../widgets/orchard/tree_sprite.dart';
import '../../widgets/pressable_scale.dart';
import 'progress/progress_charts.dart' show RingGauge;
import 'orchard/orchard_tree_detail_screen.dart';

const Map<String, Map<String, String>> _kSeasonMeta = {
  'spring': {'emoji': '🌸', 'label': 'Spring'},
  'summer': {'emoji': '☀️', 'label': 'Summer'},
  'autumn': {'emoji': '🍂', 'label': 'Autumn'},
  'winter': {'emoji': '❄️', 'label': 'Winter'},
};

const List<String> _kStageOrder = [
  'seed', 'sprout', 'young_plant', 'growing_tree', 'mature_tree', 'blossom', 'fruit', 'golden_fruit',
];

String _seasonForClient(DateTime d) {
  final m = d.month; // 1-12
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  if (m >= 9 && m <= 10) return 'autumn';
  return 'winter';
}

/// My Orchard — a full mirror of `web/src/components/StudentOrchard.jsx`:
/// living-orchard ambience backdrop, currency counters, the overall-progress
/// banner, a tree grid + detail panel, and the bottom
/// calendar/missions/growth row. Tapping "Explore tree" pushes
/// [OrchardTreeDetailScreen], the mirror of `OrchardTreeDetail.jsx`.
class StudentOrchardScreen extends ConsumerStatefulWidget {
  const StudentOrchardScreen({super.key});

  @override
  ConsumerState<StudentOrchardScreen> createState() => _StudentOrchardScreenState();
}

class _StudentOrchardScreenState extends ConsumerState<StudentOrchardScreen> {
  String _selectedKey = '';

  @override
  Widget build(BuildContext context) {
    final orchardAsync = ref.watch(orchardProvider);
    final greetingName = ref.watch(dashboardProvider).value?.greetingName?.trim();

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('My Orchard')),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(orchardProvider),
        child: orchardAsync.when(
          loading: () => const OrchardSkeleton(),
          error: (e, _) => ListView(
            padding: const EdgeInsets.all(24),
            children: [
              Text('Unable to load orchard: $e', textAlign: TextAlign.center, style: const TextStyle(color: AppColors.danger)),
              const SizedBox(height: 12),
              Center(child: OutlinedButton(onPressed: () => ref.invalidate(orchardProvider), child: const Text('Retry'))),
            ],
          ),
          data: (data) => _buildBody(data, (greetingName?.isNotEmpty ?? false) ? greetingName! : 'there'),
        ),
      ),
    );
  }

  Widget _buildBody(OrchardData data, String greetingName) {
    final trees = data.trees;
    if (_selectedKey.isEmpty && trees.isNotEmpty) {
      _selectedKey = trees.first.subjectKey;
    }
    final selectedTree = trees.where((t) => t.subjectKey == _selectedKey).isEmpty
        ? (trees.isNotEmpty ? trees.first : null)
        : trees.firstWhere((t) => t.subjectKey == _selectedKey);

    final season = trees.isNotEmpty ? trees.first.season : _seasonForClient(DateTime.now());
    final hour = DateTime.now().hour;
    final night = hour < 6 || hour >= 19;
    final vibrancy = trees.isEmpty ? 0.0 : trees.where((t) => t.health == 'healthy').length / trees.length;
    final goldenCount = trees.where((t) => t.stage == 'golden_fruit').length;
    final hasMature = trees.any((t) => _kStageOrder.indexOf(t.stage) >= _kStageOrder.indexOf('mature_tree'));
    final seasonMeta = _kSeasonMeta[season] ?? _kSeasonMeta['spring']!;

    return Stack(
      children: [
        Positioned.fill(
          child: OrchardAmbience(season: season, night: night, vibrancy: vibrancy, golden: goldenCount, treehouse: hasMature),
        ),
        ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
          children: [
            // Header
            Text('Good day, $greetingName! 👋',
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: night ? const Color(0xFFF4F6FF) : AppColors.text)),
            const SizedBox(height: 4),
            Text('Water your trees daily, and success will be yours.',
                style: TextStyle(fontSize: 13, color: night ? const Color(0xFFC3CBEF) : AppColors.muted)),
            const SizedBox(height: 14),

            // Currency counters
            Row(
              children: [
                Expanded(child: _CounterCard(icon: '💧', value: data.profile.waterDrops, label: 'Water Drops')),
                const SizedBox(width: 8),
                Expanded(child: _CounterCard(icon: '☀️', value: data.profile.sunshine, label: 'Sunshine')),
                const SizedBox(width: 8),
                Expanded(child: _CounterCard(icon: '💎', value: data.profile.gems, label: 'Gems')),
                const SizedBox(width: 8),
                Expanded(
                  child: _CounterCard(icon: '🧺', value: data.profile.harvest, label: 'Harvest', highlighted: goldenCount > 0),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // Banner
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                gradient: const LinearGradient(colors: [Color(0xFFF4F0FF), Color(0xFFEEFAF1)]),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Column(
                children: [
                  Row(
                    children: [
                      const Text('🌳', style: TextStyle(fontSize: 32)),
                      const SizedBox(width: 12),
                      const Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Your Learning Orchard', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                            Text('Each tree represents your growth in a subject.', style: TextStyle(fontSize: 12, color: AppColors.muted)),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.85),
                          borderRadius: BorderRadius.circular(999),
                          border: Border.all(color: AppColors.brand.withValues(alpha: 0.18)),
                        ),
                        child: Text('${seasonMeta['emoji']} ${seasonMeta['label']}${night ? ' · Night' : ''}',
                            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFF4B2E83))),
                      ),
                      RingGauge(
                        diameter: 60,
                        strokeWidth: 7,
                        fraction: (data.overallProgress / 100).clamp(0.0, 1.0),
                        color: AppColors.brand,
                        child: Text('${data.overallProgress}%', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                      ),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          const Text('Overall Progress', style: TextStyle(fontSize: 11, color: AppColors.muted)),
                          Text('${data.overallProgress}%', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                        ],
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Tree grid
            if (trees.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 24),
                child: Text('No orchard trees yet — start learning to grow one!', textAlign: TextAlign.center, style: TextStyle(color: AppColors.muted)),
              )
            else
              GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(maxCrossAxisExtent: 190, mainAxisExtent: 240, mainAxisSpacing: 12, crossAxisSpacing: 12),
                itemCount: trees.length,
                itemBuilder: (context, i) => _TreeCard(
                  tree: trees[i],
                  selected: trees[i].subjectKey == _selectedKey,
                  onSelect: () => setState(() => _selectedKey = trees[i].subjectKey),
                  onExplore: () => Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => OrchardTreeDetailScreen(studentId: _studentId(), subjectKey: trees[i].subjectKey, greetingName: greetingName),
                  )),
                ),
              ),
            const SizedBox(height: 16),

            // Detail panel for the selected tree
            if (selectedTree != null)
              _DetailPanel(
                tree: selectedTree,
                onExplore: () => Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) => OrchardTreeDetailScreen(studentId: _studentId(), subjectKey: selectedTree.subjectKey, greetingName: greetingName),
                )),
              ),
            const SizedBox(height: 16),

            // Bottom: calendar / missions / growth
            _BottomPanel(title: 'Orchard Calendar', child: _WeekStrip(activeDates: data.profile.activeDates, dayStreak: data.profile.dayStreak)),
            const SizedBox(height: 12),
            _BottomPanel(title: "Today's Missions", child: _Missions(trees: trees)),
            const SizedBox(height: 12),
            _BottomPanel(title: 'Orchard Growth', child: _GrowthChart(trees: trees)),
          ],
        ),
      ],
    );
  }

  String _studentId() => ref.read(sessionProvider).value?.userId ?? '';
}

class _CounterCard extends StatelessWidget {
  final String icon;
  final int value;
  final String label;
  final bool highlighted;

  const _CounterCard({required this.icon, required this.value, required this.label, this.highlighted = false});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
      decoration: BoxDecoration(
        gradient: highlighted ? const LinearGradient(colors: [Color(0xFFFFFBE6), Color(0xFFFFF2C7)]) : null,
        color: highlighted ? null : Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(color: (highlighted ? const Color(0xFFEAB308) : const Color(0xFF1F2340)).withValues(alpha: highlighted ? 0.28 : 0.06), blurRadius: 14, offset: const Offset(0, 4)),
        ],
      ),
      child: Column(
        children: [
          Text(icon, style: const TextStyle(fontSize: 20)),
          const SizedBox(height: 4),
          Text('$value', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
          Text(label, style: const TextStyle(fontSize: 9.5, color: AppColors.muted), textAlign: TextAlign.center, maxLines: 1, overflow: TextOverflow.ellipsis),
        ],
      ),
    );
  }
}

class _TreeCard extends StatelessWidget {
  final OrchardTree tree;
  final bool selected;
  final VoidCallback onSelect;
  final VoidCallback onExplore;

  const _TreeCard({required this.tree, required this.selected, required this.onSelect, required this.onExplore});

  @override
  Widget build(BuildContext context) {
    final accent = tree.accentColor;
    return PressableScale(
      onTap: onSelect,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: tree.health == 'wilting' ? const Color(0xFFFBFAF6) : Colors.white,
          border: Border.all(color: selected ? accent : Colors.transparent, width: 2),
          borderRadius: BorderRadius.circular(18),
          boxShadow: const [BoxShadow(color: Color(0x0F1F2340), blurRadius: 14, offset: Offset(0, 4))],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Text('${tree.treeEmoji} ${tree.subject}',
                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5), maxLines: 1, overflow: TextOverflow.ellipsis),
                ),
                RingGauge(diameter: 36, strokeWidth: 4, fraction: (tree.progressPct / 100).clamp(0.0, 1.0), color: accent),
              ],
            ),
            Expanded(
              child: Stack(
                fit: StackFit.expand,
                alignment: Alignment.center,
                children: [
                  // Badges anchor to the full card area (not the artwork's own
                  // bounds), so they never collide with wherever a given piece
                  // of art happens to draw its visible pixels — works the same
                  // no matter what artwork is dropped into any tree type later.
                  Center(child: TreeSprite(treeType: tree.treeType, stage: tree.stage, size: 92, accentColor: accent, health: tree.health)),
                  if (tree.stage == 'golden_fruit')
                    Positioned(
                      top: 4,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(gradient: const LinearGradient(colors: [Color(0xFFFFE066), Color(0xFFFFC93C)]), borderRadius: BorderRadius.circular(999)),
                        child: const Text('🧺 Ready to harvest', style: TextStyle(fontSize: 8.5, fontWeight: FontWeight.w800, color: Color(0xFF7A4D00))),
                      ),
                    ),
                  if (tree.health != 'healthy')
                    Positioned(
                      bottom: 4,
                      right: 4,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.92), borderRadius: BorderRadius.circular(10)),
                        child: Text(tree.health == 'thirsty' ? '💧 Thirsty' : '🍂 Needs care', style: const TextStyle(fontSize: 8.5)),
                      ),
                    ),
                  if (tree.dueReviewCount > 0)
                    Positioned(
                      top: 4,
                      right: 4,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(color: AppColors.brand, borderRadius: BorderRadius.circular(999)),
                        child: Text('📋 ${tree.dueReviewCount}', style: const TextStyle(fontSize: 8.5, color: Colors.white, fontWeight: FontWeight.w700)),
                      ),
                    ),
                ],
              ),
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(tree.stageLabel, style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: accent)),
                Text(
                  tree.totalChapters > 0 ? '${tree.completedChapters} / ${tree.totalChapters} Lessons' : 'No lessons yet',
                  style: const TextStyle(fontSize: 9.5, color: AppColors.muted),
                ),
              ],
            ),
            const SizedBox(height: 4),
            ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: LinearProgressIndicator(value: (tree.progressPct / 100).clamp(0.0, 1.0), minHeight: 6, backgroundColor: const Color(0xFFECECF6), valueColor: AlwaysStoppedAnimation(accent)),
            ),
            const SizedBox(height: 4),
            Align(
              alignment: Alignment.centerRight,
              child: GestureDetector(
                onTap: onExplore,
                child: Text('Explore tree →', style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: accent)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DetailPanel extends StatelessWidget {
  final OrchardTree tree;
  final VoidCallback onExplore;

  const _DetailPanel({required this.tree, required this.onExplore});

  @override
  Widget build(BuildContext context) {
    final accent = tree.accentColor;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20), boxShadow: const [
        BoxShadow(color: Color(0x0F1F2340), blurRadius: 18, offset: Offset(0, 6)),
      ]),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(child: Text('${tree.treeEmoji} ${tree.subject} Tree', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15))),
              PressableScale(
                onTap: onExplore,
                child: Container(
                  width: 30,
                  height: 30,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(color: const Color(0xFFF0ECFF), borderRadius: BorderRadius.circular(10)),
                  child: Text('↗', style: TextStyle(color: accent, fontSize: 16)),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Center(child: TreeSprite(treeType: tree.treeType, stage: tree.stage, size: 150, accentColor: accent, health: tree.health)),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(color: const Color(0xFFF5F3FF), borderRadius: BorderRadius.circular(12)),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(tree.stageLabel, style: TextStyle(fontWeight: FontWeight.w700, color: accent)),
                Text('Level ${tree.level} of ${tree.maxLevel}', style: const TextStyle(fontSize: 12, color: AppColors.muted)),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Text(
            tree.totalChapters > 0 ? '${tree.completedChapters} / ${tree.totalChapters} Lessons Completed' : 'No lessons uploaded for your class yet',
            style: const TextStyle(fontSize: 12.5, color: AppColors.muted),
          ),
          const SizedBox(height: 14),
          const Text('Tree Needs', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
          const SizedBox(height: 8),
          _NeedBar(icon: '💧', label: 'Water', value: tree.waterPct, color: const Color(0xFF38BDF8)),
          _NeedBar(icon: '☀️', label: 'Sunlight', value: tree.sunlightPct, color: const Color(0xFFFBBF24)),
          _NeedBar(icon: '🌱', label: 'Fertilizer', value: tree.fertilizerPct, color: const Color(0xFF34D399)),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: const Color(0xFFEEF7FF), borderRadius: BorderRadius.circular(14)),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('🤖', style: TextStyle(fontSize: 18)),
                const SizedBox(width: 8),
                Expanded(child: Text(_buildTip(tree), style: const TextStyle(fontSize: 12.5, color: Color(0xFF3A4066)))),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _buildTip(OrchardTree t) {
    if (t.health == 'wilting') return 'Your ${t.subject} tree is thirsty. A little revision today will bring it back to life.';
    if (t.health == 'thirsty') return 'Your ${t.subject} tree needs some water. Try a quick revision or quiz.';
    if (t.stage == 'golden_fruit') return 'Amazing! Your ${t.subject} tree is bearing golden fruit. You truly mastered this.';
    if (t.progressPct >= 60) return 'Great progress! Keep nurturing your ${t.subject} tree toward fruit.';
    return 'Plant more seeds — start the next ${t.subject} chapter to grow your tree.';
  }
}

class _NeedBar extends StatelessWidget {
  final String icon;
  final String label;
  final int value;
  final Color color;

  const _NeedBar({required this.icon, required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Text(icon, style: const TextStyle(fontSize: 13)),
          const SizedBox(width: 6),
          SizedBox(width: 58, child: Text(label, style: const TextStyle(fontSize: 11.5, color: AppColors.muted))),
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: LinearProgressIndicator(value: (value / 100).clamp(0.0, 1.0), minHeight: 8, backgroundColor: const Color(0xFFECECF6), valueColor: AlwaysStoppedAnimation(color)),
            ),
          ),
          const SizedBox(width: 8),
          SizedBox(width: 32, child: Text('$value%', textAlign: TextAlign.right, style: const TextStyle(fontSize: 11.5, color: AppColors.muted))),
        ],
      ),
    );
  }
}

class _BottomPanel extends StatelessWidget {
  final String title;
  final Widget child;
  const _BottomPanel({required this.title, required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(18), boxShadow: const [
        BoxShadow(color: Color(0x0F1F2340), blurRadius: 18, offset: Offset(0, 6)),
      ]),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }
}

class _WeekStrip extends StatelessWidget {
  final List<String> activeDates;
  final int dayStreak;
  const _WeekStrip({required this.activeDates, required this.dayStreak});

  @override
  Widget build(BuildContext context) {
    final active = activeDates.toSet();
    final today = DateTime.now();
    final dow = (today.weekday + 6) % 7; // Mon=0
    final monday = today.subtract(Duration(days: dow));
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    String iso(DateTime d) => '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

    return Column(
      children: [
        Row(
          children: List.generate(7, (i) {
            final d = DateTime(monday.year, monday.month, monday.day + i);
            final isToday = d.year == today.year && d.month == today.month && d.day == today.day;
            final isFuture = d.isAfter(today) && !isToday;
            final studied = active.contains(iso(d));
            String mark;
            if (isFuture) {
              mark = '·';
            } else if (studied) {
              mark = '✅';
            } else if (isToday) {
              mark = '💧';
            } else {
              mark = '🌱';
            }
            return Expanded(
              child: Container(
                margin: const EdgeInsets.symmetric(horizontal: 2),
                padding: const EdgeInsets.symmetric(vertical: 6),
                decoration: BoxDecoration(color: isToday ? const Color(0xFFF0ECFF) : null, borderRadius: BorderRadius.circular(10)),
                child: Column(
                  children: [
                    Text(labels[i], style: const TextStyle(fontSize: 10, color: AppColors.muted)),
                    Text('${d.day}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                    Text(mark, style: const TextStyle(fontSize: 12)),
                  ],
                ),
              ),
            );
          }),
        ),
        const SizedBox(height: 10),
        Align(
          alignment: Alignment.centerLeft,
          child: Text('🔥 $dayStreak day streak — keep it going!', style: const TextStyle(fontSize: 12, color: AppColors.muted)),
        ),
      ],
    );
  }
}

class _Missions extends StatelessWidget {
  final List<OrchardTree> trees;
  const _Missions({required this.trees});

  List<Map<String, String>> _build() {
    final missions = <Map<String, String>>[];
    final thirsty = trees.where((t) => t.health != 'healthy');
    if (thirsty.isNotEmpty) missions.add({'icon': '💧', 'label': 'Water your ${thirsty.first.subject} tree', 'reward': '+20 💧'});
    final inProgress = trees.where((t) => t.progressPct > 0 && t.progressPct < 100);
    if (inProgress.isNotEmpty) missions.add({'icon': '📖', 'label': 'Revise a ${inProgress.first.subject} chapter', 'reward': '+15 ☀️'});
    missions.add({'icon': '📝', 'label': 'Take a mock test', 'reward': '+20 💧'});
    missions.add({'icon': '🤖', 'label': 'Ask 3 doubts to the AI Tutor', 'reward': '+10 🌱'});
    return missions.take(4).toList();
  }

  @override
  Widget build(BuildContext context) {
    final missions = _build();
    return Column(
      children: [
        for (final m in missions)
          Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(color: const Color(0xFFF7F7FB), borderRadius: BorderRadius.circular(12)),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(child: Text('${m['icon']} ${m['label']}', style: const TextStyle(fontSize: 12.5))),
                Text(m['reward'] ?? '', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5, color: Color(0xFF16A34A))),
              ],
            ),
          ),
      ],
    );
  }
}

class _GrowthChart extends StatelessWidget {
  final List<OrchardTree> trees;
  const _GrowthChart({required this.trees});

  @override
  Widget build(BuildContext context) {
    if (trees.isEmpty) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 24),
        child: Text('No growth yet', style: TextStyle(color: AppColors.muted, fontSize: 13)),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(height: 110, width: double.infinity, child: CustomPaint(painter: _GrowthChartPainter(trees: trees))),
        const SizedBox(height: 8),
        Wrap(
          spacing: 10,
          runSpacing: 6,
          children: trees.map((t) => Text('● ${t.subject.split(' ').first}', style: TextStyle(fontSize: 11, color: t.accentColor))).toList(),
        ),
      ],
    );
  }
}

class _GrowthChartPainter extends CustomPainter {
  final List<OrchardTree> trees;
  const _GrowthChartPainter({required this.trees});

  @override
  void paint(Canvas canvas, Size size) {
    const pad = 14.0;
    final w = size.width;
    final h = size.height;
    final points = trees.map((t) => t.progressPct.toDouble()).toList();
    final step = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0.0;
    final coords = <Offset>[];
    for (var i = 0; i < points.length; i++) {
      final x = pad + i * step;
      final y = h - pad - (points[i] / 100) * (h - pad * 2);
      coords.add(Offset(x, y));
    }

    final linePath = Path()..moveTo(coords.first.dx, coords.first.dy);
    for (final c in coords.skip(1)) {
      linePath.lineTo(c.dx, c.dy);
    }
    final areaPath = Path.from(linePath)
      ..lineTo(coords.last.dx, h - pad)
      ..lineTo(coords.first.dx, h - pad)
      ..close();

    canvas.drawPath(areaPath, Paint()..color = const Color(0x1F7C3AED));
    canvas.drawPath(
      linePath,
      Paint()
        ..color = const Color(0xFF7C3AED)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.5
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );
    for (final c in coords) {
      canvas.drawCircle(c, 3, Paint()..color = const Color(0xFF7C3AED));
    }
  }

  @override
  bool shouldRepaint(covariant _GrowthChartPainter old) => true;
}

