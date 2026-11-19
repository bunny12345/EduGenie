import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../state/student_providers.dart';
import '../../widgets/section_card.dart';

final studentAttendanceProvider = FutureProvider.autoDispose((ref) {
  return ref.watch(studentApiServiceProvider).getAttendance();
});

class StudentAttendanceScreen extends ConsumerWidget {
  const StudentAttendanceScreen({super.key});

  String _date(Object? value) =>
      DateFormat.yMMMd().format(DateTime.parse(value.toString()));

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final snapshot = ref.watch(studentAttendanceProvider);
    final colors = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('My attendance')),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(studentAttendanceProvider);
          await ref
              .read(studentAttendanceProvider.future)
              .then<void>((_) {}, onError: (Object _) {});
        },
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          children: [
            snapshot.when(
              loading: () => const SkeletonBox(height: 180),
              error: (error, _) => Column(
                children: [
                  ErrorInline(
                    message: error.toString().replaceFirst('Exception: ', ''),
                  ),
                  TextButton(
                    onPressed: () => ref.invalidate(studentAttendanceProvider),
                    child: const Text('Try again'),
                  ),
                ],
              ),
              data: (data) {
                final period = data['period'] as Map?;
                final score = data['percentage'] as num?;
                final records = (data['records'] as List).cast<Map>();
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    SectionCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Attendance overview',
                            style: Theme.of(context).textTheme.titleLarge,
                          ),
                          if (period != null)
                            Text(
                              '${_date(period['startDate'])} – ${_date(period['endDate'])}',
                            ),
                          const SizedBox(height: 8),
                          Text(
                            score == null
                                ? '—'
                                : '${score.toStringAsFixed(score % 1 == 0 ? 0 : 1)}%',
                            style: Theme.of(context).textTheme.displaySmall
                                ?.copyWith(
                                  color: colors.primary,
                                  fontWeight: FontWeight.w800,
                                ),
                          ),
                          if (score != null) ...[
                            LinearProgressIndicator(value: score / 100),
                            const SizedBox(height: 10),
                            Text(
                              '${data['presentDays']} present · ${data['absentDays']} absent · ${data['recordedDays']} recorded days',
                            ),
                          ] else
                            Text(
                              period == null
                                  ? 'Your school has not set the attendance period yet.'
                                  : 'No saved attendance for you in this period yet.',
                            ),
                          const SizedBox(height: 8),
                          const Text('Only saved roll-call days count.'),
                        ],
                      ),
                    ),
                    if (records.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      SectionCard(
                        child: Material(
                          type: MaterialType.transparency,
                          child: ExpansionTile(
                            title: const Text('Attendance history'),
                            children: [
                              for (final record in records)
                                ListTile(
                                  title: Text(_date(record['date'])),
                                  trailing: Text(
                                    record['present'] == true
                                        ? 'Present'
                                        : 'Absent',
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}
