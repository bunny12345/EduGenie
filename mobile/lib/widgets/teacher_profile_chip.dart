import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../state/session_provider.dart';
import '../state/teacher_providers.dart';
import '../theme/app_colors.dart';

String _teacherAvatar(String? gender) {
  switch (gender?.trim().toLowerCase()) {
    case 'male':
      return '👨‍🏫';
    case 'female':
      return '👩‍🏫';
    default:
      return '🧑‍🏫';
  }
}

class TeacherProfileChip extends ConsumerWidget {
  final String section;
  const TeacherProfileChip({super.key, required this.section});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(teacherProfileProvider).value;
    final session = ref.watch(sessionProvider).value;
    final name = profile?['name']?.toString().trim();
    final displayName = name?.isNotEmpty == true
        ? name!
        : session?.name.isNotEmpty == true
        ? session!.name
        : 'Teacher';
    return PopupMenuButton<void>(
      tooltip: 'Open teacher profile',
      position: PopupMenuPosition.under,
      color: AppColors.of(context).card,
      constraints: const BoxConstraints(maxWidth: 300),
      itemBuilder: (_) => [
        const PopupMenuItem<void>(
          enabled: false,
          padding: EdgeInsets.all(14),
          child: _TeacherProfileDetails(),
        ),
      ],
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 48),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircleAvatar(
              radius: 19,
              backgroundColor: AppColors.of(context).brandSoft,
              child: Text(
                _teacherAvatar(profile?['gender']?.toString()),
                style: const TextStyle(fontSize: 23),
              ),
            ),
            const SizedBox(width: 8),
            Flexible(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Hi, $displayName',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                      color: AppColors.of(context).text,
                    ),
                  ),
                  Text(
                    section,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 11,
                      color: AppColors.of(context).muted,
                    ),
                  ),
                ],
              ),
            ),
            Icon(
              Icons.keyboard_arrow_down_rounded,
              size: 18,
              color: AppColors.of(context).muted,
            ),
          ],
        ),
      ),
    );
  }
}

class _TeacherProfileDetails extends ConsumerWidget {
  const _TeacherProfileDetails();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profileAsync = ref.watch(teacherProfileProvider);
    final profile = profileAsync.value;
    final session = ref.watch(sessionProvider).value;
    final name = profile?['name']?.toString().trim();
    final grades = profile?['grades'];
    final classes = grades is List
        ? grades
              .whereType<String>()
              .where((value) => value.trim().isNotEmpty)
              .toSet()
              .join(', ')
        : '';
    Widget detail(String label, String? value) => Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Text.rich(
        TextSpan(
          children: [
            TextSpan(
              text: '$label: ',
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
            TextSpan(
              text: value?.trim().isNotEmpty == true ? value : 'Not available',
            ),
          ],
        ),
        style: TextStyle(fontSize: 12, color: AppColors.of(context).text),
      ),
    );
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Center(
          child: Text(
            _teacherAvatar(profile?['gender']?.toString()),
            style: const TextStyle(fontSize: 36),
          ),
        ),
        const SizedBox(height: 6),
        Center(
          child: Text(
            name?.isNotEmpty == true ? name! : session?.name ?? 'Teacher',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w800,
              color: AppColors.of(context).text,
            ),
          ),
        ),
        if (profile?['schoolName']?.toString().isNotEmpty == true)
          Center(
            child: Text(
              profile!['schoolName'].toString(),
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 12,
                color: AppColors.of(context).muted,
              ),
            ),
          ),
        if (profileAsync.hasError) ...[
          Text(
            'Unable to retrieve teacher profile.',
            style: TextStyle(fontSize: 12, color: AppColors.of(context).text),
          ),
          TextButton(
            onPressed: () => ref.invalidate(teacherProfileProvider),
            child: const Text('Retry'),
          ),
        ] else ...[
          detail('Subject', profile?['subject']?.toString()),
          detail('Login ID', profile?['loginId']?.toString()),
          detail(
            'Classes',
            classes.isNotEmpty
                ? classes
                : grades is List
                ? 'No classes assigned'
                : null,
          ),
        ],
      ],
    );
  }
}
