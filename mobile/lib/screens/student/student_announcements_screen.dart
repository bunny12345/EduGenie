import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/dashboard.dart';
import '../../state/student_providers.dart';
import '../../theme/app_colors.dart';
import '../../widgets/section_card.dart';

/// Announcements — mirrors the web app's "Announcements" home panel
/// (`.eg-announcements`/`.eg-announcement-item` in `App.css`), full-page
/// instead of a mini home-page card since mobile reaches it via the bell icon.
class StudentAnnouncementsScreen extends ConsumerWidget {
  const StudentAnnouncementsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dashboardAsync = ref.watch(dashboardProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Announcements')),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(dashboardProvider),
        child: dashboardAsync.when(
          loading: () => ListView(
            padding: const EdgeInsets.all(16),
            children: const [SkeletonBox(height: 70), SkeletonBox(height: 70), SkeletonBox(height: 70)],
          ),
          error: (e, _) => ListView(
            padding: const EdgeInsets.all(16),
            children: [ErrorInline(message: 'Unable to load announcements: $e')],
          ),
          data: (d) {
            final announcements = d.announcements;
            if (announcements.isEmpty) {
              return ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  SectionCard(child: Text('No announcements yet.', style: TextStyle(color: AppColors.of(context).muted, fontSize: 13))),
                ],
              );
            }
            return ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: announcements.length,
              itemBuilder: (context, i) => _AnnouncementCard(item: announcements[i]),
            );
          },
        ),
      ),
    );
  }
}

class _AnnouncementCard extends StatelessWidget {
  final AnnouncementItem item;

  const _AnnouncementCard({required this.item});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.of(context).card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.of(context).line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(item.title, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.of(context).text)),
          const SizedBox(height: 6),
          Text(item.message, style: TextStyle(fontSize: 12, color: AppColors.of(context).muted, height: 1.4)),
          if (item.createdAt != null && item.createdAt!.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(item.createdAt!, style: TextStyle(fontSize: 10, color: AppColors.of(context).muted)),
          ],
        ],
      ),
    );
  }
}
