import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../state/session_provider.dart';
import '../widgets/coming_soon_view.dart';

/// Teacher portal shell — placeholder until Phase 4. Foundation only:
/// session is live (name/logout work), full teacher UI comes later.
class TeacherShell extends ConsumerWidget {
  const TeacherShell({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider).value;
    return Scaffold(
      appBar: AppBar(
        title: Text('Hi, ${session?.name.isNotEmpty == true ? session!.name : 'Teacher'}'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout_rounded),
            onPressed: () => ref.read(sessionProvider.notifier).logout(),
          ),
        ],
      ),
      body: const ComingSoonView(
        icon: Icons.school_rounded,
        title: 'Teacher portal',
        subtitle: 'Classes, curriculum, homework, tests and student progress land here in Phase 4.',
      ),
    );
  }
}
