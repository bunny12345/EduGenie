import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../models/orchard_data.dart';
import '../../../state/student_providers.dart';
import '../../../theme/app_colors.dart';
import '../../../widgets/orchard/orchard_skeleton.dart';
import '../../../widgets/orchard/tree_sprite.dart';
import '../../../widgets/pressable_scale.dart';
import 'retention_check_modal.dart';

/// Milestone keys unlocked via a retention-check modal, mapped to the review
/// type `completeOrchardReview` expects. Mirrors `OrchardTreeDetail.jsx`.
const Map<String, String> _kRetentionMilestoneType = {
  'week_retention': 'week',
  'month_retention': 'month',
};

class _MilestoneGroup {
  final String stage;
  final String emoji;
  final String title;
  final List<List<String>> items; // [key, label]
  const _MilestoneGroup({required this.stage, required this.emoji, required this.title, required this.items});
}

const List<_MilestoneGroup> _kMilestoneGroups = [
  _MilestoneGroup(stage: 'sprout', emoji: '🌱', title: 'Sprout · Understand', items: [
    ['lesson_watched', 'Watch the AI lesson'],
    ['question_asked', 'Ask one question'],
    ['story_done', 'Complete the story'],
  ]),
  _MilestoneGroup(stage: 'young_plant', emoji: '🌿', title: 'Young Plant · Practice', items: [
    ['homework', 'Do the homework'],
    ['quiz', 'Take the mini quiz'],
    ['flashcards', 'Review flashcards'],
  ]),
  _MilestoneGroup(stage: 'growing_tree', emoji: '🌳', title: 'Growing Tree · Remember', items: [
    ['active_recall', 'Active recall (no hints)'],
    ['explain_back', 'Explain back to the AI'],
    ['memory_challenge', 'Beat the memory challenge'],
  ]),
  _MilestoneGroup(stage: 'mature_tree', emoji: '🌲', title: 'Mature Tree · Apply', items: [
    ['word_problems', 'Solve word problems'],
    ['real_life', 'Give real-life examples'],
    ['projects', 'Finish a project'],
  ]),
  _MilestoneGroup(stage: 'blossom', emoji: '🌸', title: 'Blossom · One week later', items: [
    ['week_retention', 'Pass the 1-week memory check'],
  ]),
  _MilestoneGroup(stage: 'fruit', emoji: '🍎', title: 'Fruit · One month later', items: [
    ['month_retention', 'Pass the 1-month memory check'],
  ]),
];

String _chapterGlyph(OrchardChapter ch, String fruitEmoji) {
  if (ch.isGolden || ch.stage == 'golden_fruit') return '✨';
  if (ch.stage == 'fruit') return fruitEmoji.isNotEmpty ? fruitEmoji : '🍎';
  return kStageEmoji[ch.stage] ?? '🌰';
}

String _seasonLabel(String season) {
  switch (season) {
    case 'spring':
      return '🌱 Spring';
    case 'summer':
      return '☀️ Summer';
    case 'autumn':
      return '🍂 Autumn';
    case 'winter':
      return '❄️ Winter';
    default:
      return '🌱 Spring';
  }
}

/// Mirrors `web/src/components/orchard/OrchardTreeDetail.jsx` — the
/// single-tree "explore" view: hero art + stats + roots bar, the chapter
/// "seedbed" grid (one seed per uploaded lesson), and a milestone checklist
/// panel for whichever chapter is tapped.
class OrchardTreeDetailScreen extends ConsumerStatefulWidget {
  final String studentId;
  final String subjectKey;
  final String greetingName;

  const OrchardTreeDetailScreen({super.key, required this.studentId, required this.subjectKey, this.greetingName = 'there'});

  @override
  ConsumerState<OrchardTreeDetailScreen> createState() => _OrchardTreeDetailScreenState();
}

class _OrchardTreeDetailScreenState extends ConsumerState<OrchardTreeDetailScreen> {
  String _activeChapterId = '';

  @override
  Widget build(BuildContext context) {
    final detailAsync = ref.watch(orchardTreeProvider(widget.subjectKey));

    return Scaffold(
      appBar: AppBar(title: Text(detailAsync.value?.subject ?? 'Tree')),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(orchardTreeProvider(widget.subjectKey)),
        child: detailAsync.when(
          loading: () => const OrchardTreeDetailSkeleton(),
          error: (e, _) => ListView(
            padding: const EdgeInsets.all(24),
            children: [
              const Text('Could not load this tree.', textAlign: TextAlign.center),
              const SizedBox(height: 12),
              Center(
                child: OutlinedButton(onPressed: () => ref.invalidate(orchardTreeProvider(widget.subjectKey)), child: const Text('Retry')),
              ),
            ],
          ),
          data: (detail) => _buildBody(detail),
        ),
      ),
    );
  }

  Widget _buildBody(OrchardTreeDetailData detail) {
    final accent = detail.accentColor;
    final chapters = detail.chapters;
    final tree = detail.tree;
    final fruited = chapters.where((c) => c.stageIndex >= 6).length;
    final golden = chapters.where((c) => c.isGolden).length;
    final activeChapter = chapters.where((c) => c.chapterId == _activeChapterId).isEmpty
        ? null
        : chapters.firstWhere((c) => c.chapterId == _activeChapterId);

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Hero
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            gradient: const LinearGradient(colors: [Color(0xFFF7F4FF), Color(0xFFEEFAF1)]),
            borderRadius: BorderRadius.circular(22),
          ),
          child: Column(
            children: [
              TreeSprite(treeType: detail.treeType, stage: tree.stage, size: 150, accentColor: accent, health: tree.health),
              const SizedBox(height: 12),
              Text('${detail.treeEmoji} ${detail.subject} Tree', textAlign: TextAlign.center, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
              const SizedBox(height: 10),
              Wrap(
                alignment: WrapAlignment.center,
                spacing: 8,
                runSpacing: 8,
                children: [
                  _chip(tree.stageLabel, color: accent, bold: true),
                  _chip('Level ${tree.level} of ${tree.maxLevel}'),
                  _chip(
                    tree.health == 'healthy' ? '💚 Healthy' : tree.health == 'thirsty' ? '💧 Thirsty' : '🍂 Needs care',
                    color: tree.health == 'thirsty' ? const Color(0xFFB45309) : tree.health == 'wilting' ? const Color(0xFFB91C1C) : null,
                  ),
                  _chip(_seasonLabel(tree.season)),
                ],
              ),
              const SizedBox(height: 14),
              GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                childAspectRatio: 2.4,
                mainAxisSpacing: 10,
                crossAxisSpacing: 10,
                children: [
                  _stat('Lessons fruited', '$fruited / ${tree.totalChapters}'),
                  _stat('Golden fruits', '$golden', icon: '✨'),
                  _stat('Roots (understanding)', '${tree.rootsPct}%'),
                  _stat('Overall growth', '${tree.progressPct}%'),
                ],
              ),
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14)),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('🫚 Roots — how deeply you understand', style: TextStyle(fontSize: 12, color: Color(0xFF4A4F70))),
                    const SizedBox(height: 6),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: LinearProgressIndicator(
                        value: tree.rootsPct / 100,
                        minHeight: 10,
                        backgroundColor: const Color(0xFFECECF6),
                        valueColor: const AlwaysStoppedAnimation(Color(0xFF7C3AED)),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      tree.rootsPct >= 90 ? 'Deep roots — golden fruit ready!' : 'Deeper roots grow taller trees.',
                      style: const TextStyle(fontSize: 11, color: AppColors.muted),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 18),

        // Chapters — seedbed
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20), boxShadow: const [
            BoxShadow(color: Color(0x0F1F2340), blurRadius: 18, offset: Offset(0, 6)),
          ]),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('${detail.subject} lessons — every seed becomes a fruit', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
              const SizedBox(height: 4),
              const Text('Each uploaded lesson grows on its own. Care for it and it ripens over weeks.',
                  style: TextStyle(fontSize: 12.5, color: AppColors.muted)),
              const SizedBox(height: 14),
              if (chapters.isEmpty)
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(vertical: 28, horizontal: 16),
                  decoration: BoxDecoration(
                    border: Border.all(color: const Color(0xFFD7D4E8), style: BorderStyle.solid),
                    borderRadius: BorderRadius.circular(18),
                    color: const Color(0xFFFBFAFF),
                  ),
                  child: Column(
                    children: [
                      const Text('🌱', style: TextStyle(fontSize: 32)),
                      const SizedBox(height: 6),
                      Text('No ${detail.subject} lessons yet', style: const TextStyle(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 4),
                      Text(
                        'Your school hasn\u2019t uploaded any ${detail.subject} lessons for your class yet. As soon as they do, each lesson appears here as a seed you can grow.',
                        textAlign: TextAlign.center,
                        style: const TextStyle(fontSize: 12.5, color: AppColors.muted),
                      ),
                    ],
                  ),
                )
              else
                GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(maxCrossAxisExtent: 140, mainAxisExtent: 152, mainAxisSpacing: 12, crossAxisSpacing: 12),
                  itemCount: chapters.length,
                  itemBuilder: (context, i) {
                    final ch = chapters[i];
                    final active = ch.chapterId == _activeChapterId;
                    return PressableScale(
                      onTap: () => setState(() => _activeChapterId = active ? '' : ch.chapterId),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                        decoration: BoxDecoration(
                          color: ch.isGolden ? const Color(0xFFFEF3C7) : (active ? const Color(0xFFF5F3FF) : const Color(0xFFF7F7FB)),
                          border: Border.all(color: active ? accent : Colors.transparent, width: 2),
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          mainAxisSize: MainAxisSize.max,
                          children: [
                            Text(_chapterGlyph(ch, detail.fruitEmoji), style: const TextStyle(fontSize: 26, height: 1)),
                            Text(
                              '${ch.chapterNumber}. ${ch.title}',
                              textAlign: TextAlign.center,
                              maxLines: 3,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, height: 1.15),
                            ),
                            Text(ch.stageLabel, style: const TextStyle(fontSize: 9.5, color: AppColors.muted, height: 1)),
                            ClipRRect(
                              borderRadius: BorderRadius.circular(5),
                              child: LinearProgressIndicator(
                                value: (ch.stageIndex / 7).clamp(0.0, 1.0),
                                minHeight: 5,
                                backgroundColor: const Color(0xFFE4E2EF),
                                valueColor: AlwaysStoppedAnimation(accent),
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
            ],
          ),
        ),

        // Milestone panel for the active chapter
        if (activeChapter != null) ...[
          const SizedBox(height: 18),
          _ChapterMilestonePanel(
            studentId: widget.studentId,
            subjectKey: widget.subjectKey,
            subjectLabel: detail.subject,
            chapter: activeChapter,
            fruitEmoji: detail.fruitEmoji,
            onClose: () => setState(() => _activeChapterId = ''),
            onReviewDone: () => ref.invalidate(orchardTreeProvider(widget.subjectKey)),
          ),
        ],
      ],
    );
  }

  Widget _chip(String text, {Color? color, bool bold = false}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14)),
      child: Text(text, style: TextStyle(fontSize: 12, color: color ?? const Color(0xFF4A4F70), fontWeight: bold ? FontWeight.w800 : FontWeight.w500)),
    );
  }

  Widget _stat(String label, String value, {String? icon}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text('${icon != null ? '$icon ' : ''}$value', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
          Text(label, style: const TextStyle(fontSize: 10.5, color: AppColors.muted)),
        ],
      ),
    );
  }
}

class _ChapterMilestonePanel extends StatelessWidget {
  final String studentId;
  final String subjectKey;
  final String subjectLabel;
  final OrchardChapter chapter;
  final String fruitEmoji;
  final VoidCallback onClose;
  final VoidCallback onReviewDone;

  const _ChapterMilestonePanel({
    required this.studentId,
    required this.subjectKey,
    required this.subjectLabel,
    required this.chapter,
    required this.fruitEmoji,
    required this.onClose,
    required this.onReviewDone,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20), boxShadow: const [
        BoxShadow(color: Color(0x0F1F2340), blurRadius: 18, offset: Offset(0, 6)),
      ]),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(_chapterGlyph(chapter, fruitEmoji), style: const TextStyle(fontSize: 28)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(chapter.title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
                    Text('${chapter.stageLabel} · Roots ${chapter.rootsPct}%', style: const TextStyle(fontSize: 11.5, color: AppColors.muted)),
                  ],
                ),
              ),
              IconButton(onPressed: onClose, icon: const Icon(Icons.close, size: 18)),
            ],
          ),
          const SizedBox(height: 10),
          for (final group in _kMilestoneGroups) _group(context, group),
        ],
      ),
    );
  }

  Widget _group(BuildContext context, _MilestoneGroup group) {
    final done = group.items.where((item) => chapter.milestones[item[0]] == true).length;
    final complete = done == group.items.length;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: complete ? const Color(0xFFECFDF3) : const Color(0xFFF7F7FB),
        border: Border.all(color: complete ? const Color(0xFFBBF7D0) : Colors.transparent),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('${group.emoji} ${group.title}', style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700)),
              Text('$done/${group.items.length}', style: const TextStyle(fontSize: 12, color: AppColors.muted)),
            ],
          ),
          const SizedBox(height: 8),
          for (final item in group.items) _milestoneRow(context, item[0], item[1]),
        ],
      ),
    );
  }

  Widget _milestoneRow(BuildContext context, String key, String label) {
    final checked = chapter.milestones[key] == true;
    final reviewType = _kRetentionMilestoneType[key];
    final canTakeCheck = !checked && reviewType != null && chapter.dueReview == reviewType;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Text(checked ? '✅' : '⭕️', style: const TextStyle(fontSize: 13)),
          const SizedBox(width: 8),
          Expanded(
            child: Text(label, style: TextStyle(fontSize: 12, color: checked ? AppColors.text : AppColors.muted)),
          ),
          if (canTakeCheck)
            PressableScale(
              onTap: () => showRetentionCheckModal(
                context,
                studentId: studentId,
                subjectKey: subjectKey,
                subjectLabel: subjectLabel,
                chapter: chapter,
                reviewType: reviewType,
                onDone: onReviewDone,
              ),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  border: Border.all(color: AppColors.brand),
                  color: const Color(0xFFF5F0FF),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: const Text('Take the check →', style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: AppColors.brand)),
              ),
            ),
        ],
      ),
    );
  }
}
