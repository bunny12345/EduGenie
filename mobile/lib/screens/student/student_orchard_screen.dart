import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/orchard_data.dart';
import '../../state/student_providers.dart';
import '../../theme/app_colors.dart';
import '../../widgets/section_card.dart';

/// My Orchard — simplified but real data: overall progress, currencies
/// (water/sunshine/gems/harvest), and a tree card per subject. Chapter-level
/// drill-down (`GET /orchard/:subjectKey`) is deferred to a later increment.
class StudentOrchardScreen extends ConsumerWidget {
  const StudentOrchardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orchardAsync = ref.watch(orchardProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('My Orchard')),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(orchardProvider),
        child: orchardAsync.when(
          loading: () => ListView(padding: const EdgeInsets.all(16), children: const [SkeletonBox(height: 300)]),
          error: (e, _) => ListView(padding: const EdgeInsets.all(16), children: [ErrorInline(message: 'Unable to load orchard: $e')]),
          data: (data) => ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _CurrenciesCard(profile: data.profile, overallProgress: data.overallProgress),
              for (final tree in data.trees) _TreeCard(tree: tree),
              if (data.trees.isEmpty) const Text('No orchard trees yet — start learning to grow one!', style: TextStyle(color: AppColors.muted, fontSize: 13)),
            ],
          ),
        ),
      ),
    );
  }
}

class _CurrenciesCard extends StatelessWidget {
  final OrchardProfile profile;
  final int overallProgress;

  const _CurrenciesCard({required this.profile, required this.overallProgress});

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      title: '🌱 Overall Progress: $overallProgress%',
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          _currency('💧', profile.waterDrops),
          _currency('☀️', profile.sunshine),
          _currency('💎', profile.gems),
          _currency('🍇', profile.harvest),
          _currency('🔥', profile.dayStreak),
        ],
      ),
    );
  }

  Widget _currency(String emoji, int value) {
    return Column(
      children: [
        Text(emoji, style: const TextStyle(fontSize: 20)),
        const SizedBox(height: 4),
        Text('$value', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
      ],
    );
  }
}

class _TreeCard extends StatelessWidget {
  final OrchardTree tree;

  const _TreeCard({required this.tree});

  @override
  Widget build(BuildContext context) {
    final color = SubjectPalette.colorFor(tree.subject);
    return SectionCard(
      child: Row(
        children: [
          Text(tree.treeEmoji, style: const TextStyle(fontSize: 34)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(tree.subject, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: color)),
                Text('${tree.stageLabel} · Level ${tree.level}/${tree.maxLevel}', style: const TextStyle(color: AppColors.muted, fontSize: 12)),
                const SizedBox(height: 6),
                ClipRRect(
                  borderRadius: BorderRadius.circular(6),
                  child: LinearProgressIndicator(value: tree.progressPct / 100, backgroundColor: AppColors.line, color: color, minHeight: 6),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Text(tree.fruitEmoji, style: const TextStyle(fontSize: 22)),
          if (tree.dueReviewCount > 0)
            Container(
              margin: const EdgeInsets.only(left: 6),
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(color: AppColors.warn, borderRadius: BorderRadius.circular(10)),
              child: Text('${tree.dueReviewCount}', style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w700)),
            ),
        ],
      ),
    );
  }
}
