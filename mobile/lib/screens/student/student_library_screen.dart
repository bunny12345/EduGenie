import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/student_providers.dart';
import '../../theme/app_colors.dart';
import '../../widgets/section_card.dart';

class StudentLibraryScreen extends ConsumerWidget {
  const StudentLibraryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final libraryAsync = ref.watch(libraryProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Library')),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(libraryProvider),
        child: libraryAsync.when(
          loading: () => ListView(padding: const EdgeInsets.all(16), children: const [SkeletonBox(height: 300)]),
          error: (e, _) => ListView(padding: const EdgeInsets.all(16), children: [ErrorInline(message: 'Unable to load library: $e')]),
          data: (resources) {
            if (resources.isEmpty) {
              return ListView(
                padding: const EdgeInsets.all(16),
                children: const [Text('No resources available.', style: TextStyle(color: AppColors.muted, fontSize: 13))],
              );
            }
            return ListView(
              padding: const EdgeInsets.all(16),
              children: [
                for (final r in resources)
                  SectionCard(
                    child: ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(Icons.menu_book_rounded, color: AppColors.brand),
                      title: Text(r.title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                      subtitle: r.summary.isNotEmpty ? Text(r.summary, maxLines: 2, overflow: TextOverflow.ellipsis) : null,
                    ),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}
