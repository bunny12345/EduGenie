import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../state/session_provider.dart';
import '../widgets/coming_soon_view.dart';

/// School Admin portal shell — placeholder until Phase 5. Foundation only:
/// session is live (name/logout work), full school admin UI comes later.
class SchoolShell extends ConsumerWidget {
  const SchoolShell({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider).value;
    return Scaffold(
      appBar: AppBar(
        title: Text(session?.name.isNotEmpty == true ? session!.name : 'School Admin'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout_rounded),
            onPressed: () => ref.read(sessionProvider.notifier).logout(),
          ),
        ],
      ),
      body: const ComingSoonView(
        icon: Icons.apartment_rounded,
        title: 'School Admin portal',
        subtitle: 'Teachers, invites, curriculum and student registration land here in Phase 5.',
      ),
    );
  }
}
