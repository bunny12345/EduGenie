import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/dashboard.dart';
import '../../state/session_provider.dart';
import '../../state/student_announcements_provider.dart';
import '../../state/student_providers.dart';
import '../../theme/app_colors.dart';
import '../../widgets/section_card.dart';

/// Announcements — mirrors the web app's "Announcements" home panel
/// (`.eg-announcements`/`.eg-announcement-item` in `App.css`), full-page
/// instead of a mini home-page card since mobile reaches it via the bell icon.
class StudentAnnouncementsScreen extends ConsumerStatefulWidget {
  const StudentAnnouncementsScreen({super.key});

  @override
  ConsumerState<StudentAnnouncementsScreen> createState() =>
      _StudentAnnouncementsScreenState();
}

class _StudentAnnouncementsScreenState
    extends ConsumerState<StudentAnnouncementsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && !ref.read(dashboardProvider).isLoading) {
        ref.invalidate(dashboardProvider);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    ref.watch(announcementRefreshProvider);
    final dashboardAsync = ref.watch(dashboardProvider);
    final studentId = ref.watch(sessionProvider.select((session) => session.value?.userId));

    return Scaffold(
      appBar: AppBar(title: const Text('Announcements')),
      body: RefreshIndicator(
        onRefresh: () async {
          try {
            final refreshed = ref.refresh(dashboardProvider.future);
            await refreshed;
          } catch (_) {
            // The error state below presents the failed request.
          }
        },
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
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16),
                children: [
                  SectionCard(child: Text('No announcements yet.', style: TextStyle(color: AppColors.of(context).muted, fontSize: 13))),
                ],
              );
            }
            if (studentId != null && ModalRoute.isCurrentOf(context) == true) {
              WidgetsBinding.instance.addPostFrameCallback((_) {
                if (!mounted || ModalRoute.of(context)?.isCurrent != true) return;
                if (ref.read(sessionProvider).value?.userId != studentId) return;
                ref.read(seenAnnouncementsProvider(studentId).notifier)
                    .markSeen(announcements.map((a) => a.id));
              });
            }
            return ListView.builder(
              physics: const AlwaysScrollableScrollPhysics(),
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
