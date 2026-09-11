import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/session_provider.dart';
import '../../theme/app_colors.dart';
import 'student_settings_screen.dart';

/// "More" tab — Settings + Logout. Orchard/Games/Rewards/Calendar/Library
/// moved out of here since they're already reachable from the home page's
/// Academics grid — no need to duplicate them.
class StudentMoreScreen extends ConsumerWidget {
  const StudentMoreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider).value;

    final items = <_MoreItem>[
      _MoreItem(Icons.settings_rounded, 'Settings', (ctx) => const StudentSettingsScreen()),
    ];

    return Scaffold(
      appBar: AppBar(title: const Text('More')),
      body: ListView(
        children: [
          if (session != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              child: Row(
                children: [
                  CircleAvatar(
                    backgroundColor: AppColors.brandSoft,
                    child: Text(
                      session.name.isNotEmpty ? session.name[0].toUpperCase() : '?',
                      style: const TextStyle(color: AppColors.brand, fontWeight: FontWeight.w700),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(session.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                      if (session.className.isNotEmpty)
                        Text(session.className, style: const TextStyle(color: AppColors.muted, fontSize: 12)),
                    ],
                  ),
                ],
              ),
            ),
          const Divider(height: 1),
          for (final item in items)
            ListTile(
              leading: Icon(item.icon, color: AppColors.brand),
              title: Text(item.label),
              trailing: const Icon(Icons.chevron_right_rounded, color: AppColors.muted),
              onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: item.builder)),
            ),
          const Divider(height: 1),
          ListTile(
            leading: const Icon(Icons.logout_rounded, color: AppColors.danger),
            title: const Text('Logout', style: TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600)),
            onTap: () => ref.read(sessionProvider.notifier).logout(),
          ),
        ],
      ),
    );
  }
}

class _MoreItem {
  final IconData icon;
  final String label;
  final Widget Function(BuildContext) builder;

  _MoreItem(this.icon, this.label, this.builder);
}
