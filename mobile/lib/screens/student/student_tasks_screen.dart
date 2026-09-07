import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/homework_item.dart';
import '../../models/test_item.dart';
import '../../state/student_providers.dart';
import '../../theme/app_colors.dart';
import '../../widgets/section_card.dart';
import 'homework_detail_screen.dart';
import 'test_taking_screen.dart';

enum _HwFilter { all, submitted, notSubmitted, overdue }

/// "Tasks" tab — homework + mock tests.
class StudentTasksScreen extends StatelessWidget {
  const StudentTasksScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Tasks'),
          bottom: const TabBar(tabs: [Tab(text: 'Homework'), Tab(text: 'Mock Tests')]),
        ),
        body: const TabBarView(
          children: [_HomeworkTab(), _MockTestsTab()],
        ),
      ),
    );
  }
}

class _HomeworkTab extends ConsumerStatefulWidget {
  const _HomeworkTab();

  @override
  ConsumerState<_HomeworkTab> createState() => _HomeworkTabState();
}

class _HomeworkTabState extends ConsumerState<_HomeworkTab> {
  _HwFilter _filter = _HwFilter.all;

  @override
  Widget build(BuildContext context) {
    final homeworkAsync = ref.watch(homeworkProvider);

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(homeworkProvider),
      child: homeworkAsync.when(
        loading: () => ListView(padding: const EdgeInsets.all(16), children: const [SkeletonBox(height: 300)]),
        error: (e, _) => ListView(padding: const EdgeInsets.all(16), children: [ErrorInline(message: 'Unable to load homework: $e')]),
        data: (items) {
          final filtered = items.where((h) {
            switch (_filter) {
              case _HwFilter.submitted:
                return h.submitted;
              case _HwFilter.notSubmitted:
                return !h.submitted;
              case _HwFilter.overdue:
                return h.overdue && !h.submitted;
              case _HwFilter.all:
                return true;
            }
          }).toList();

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Wrap(
                spacing: 8,
                children: [
                  _filterChip('All', _HwFilter.all),
                  _filterChip('Submitted', _HwFilter.submitted),
                  _filterChip('Not submitted', _HwFilter.notSubmitted),
                  _filterChip('Overdue', _HwFilter.overdue),
                ],
              ),
              const SizedBox(height: 12),
              if (filtered.isEmpty)
                const Padding(
                  padding: EdgeInsets.only(top: 24),
                  child: Text('No homework in this view.', style: TextStyle(color: AppColors.muted, fontSize: 13)),
                )
              else
                for (final h in filtered) _HomeworkCard(homework: h),
            ],
          );
        },
      ),
    );
  }

  Widget _filterChip(String label, _HwFilter value) {
    return ChoiceChip(
      label: Text(label),
      selected: _filter == value,
      onSelected: (_) => setState(() => _filter = value),
    );
  }
}

class _HomeworkCard extends StatelessWidget {
  final HomeworkItem homework;

  const _HomeworkCard({required this.homework});

  @override
  Widget build(BuildContext context) {
    final color = SubjectPalette.colorFor(homework.subject);
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => HomeworkDetailScreen(homework: homework))),
      child: SectionCard(
        child: Row(
          children: [
            Container(width: 6, height: 40, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(3))),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(homework.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                  Text(homework.subject, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600)),
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(color: _statusColor().withValues(alpha: 0.12), borderRadius: BorderRadius.circular(10)),
              child: Text(homework.remark, style: TextStyle(color: _statusColor(), fontSize: 11, fontWeight: FontWeight.w700)),
            ),
          ],
        ),
      ),
    );
  }

  Color _statusColor() {
    if (homework.submitted) return AppColors.ok;
    if (homework.overdue || homework.expired) return AppColors.danger;
    return AppColors.warn;
  }
}

class _MockTestsTab extends ConsumerWidget {
  const _MockTestsTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final testsAsync = ref.watch(testsProvider);

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(testsProvider),
      child: testsAsync.when(
        loading: () => ListView(padding: const EdgeInsets.all(16), children: const [SkeletonBox(height: 300)]),
        error: (e, _) => ListView(padding: const EdgeInsets.all(16), children: [ErrorInline(message: 'Unable to load tests: $e')]),
        data: (items) {
          if (items.isEmpty) {
            return ListView(
              padding: const EdgeInsets.all(16),
              children: const [Text('No mock tests available right now.', style: TextStyle(color: AppColors.muted, fontSize: 13))],
            );
          }
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [for (final t in items) _TestCard(test: t)],
          );
        },
      ),
    );
  }
}

class _TestCard extends StatelessWidget {
  final TestItem test;

  const _TestCard({required this.test});

  @override
  Widget build(BuildContext context) {
    final color = SubjectPalette.colorFor(test.subject);
    return SectionCard(
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(test.title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                Text('${test.subject} · ${test.durationMinutes} min', style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600)),
              ],
            ),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => TestTakingScreen(test: test))),
            child: const Text('Start'),
          ),
        ],
      ),
    );
  }
}
