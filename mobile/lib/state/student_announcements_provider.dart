import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'session_provider.dart';
import 'student_providers.dart';

final seenAnnouncementsProvider =
    AsyncNotifierProvider.family<SeenAnnouncements, Set<String>, String>(
      SeenAnnouncements.new,
    );

class SeenAnnouncements extends AsyncNotifier<Set<String>> {
  SeenAnnouncements(this.studentId);

  final String studentId;
  Future<void> _pendingWrite = Future.value();

  @override
  Future<Set<String>> build() async {
    try {
      return await ref
          .read(secureStorageServiceProvider)
          .readSeenAnnouncements(studentId);
    } catch (error) {
      debugPrint('Could not read announcement badge state: $error');
      return {};
    }
  }

  Future<void> markSeen(Iterable<String> ids) async {
    final stored = await future;
    if (!ref.mounted) return;
    final current = state.value ?? stored;
    final next = {...current, ...ids.where((id) => id.isNotEmpty)};
    if (next.length == current.length) return;
    state = AsyncData(next);
    final storage = ref.read(secureStorageServiceProvider);
    _pendingWrite = _pendingWrite.then((_) async {
      try {
        await storage.writeSeenAnnouncements(studentId, next);
      } catch (error) {
        debugPrint('Could not save announcement badge state: $error');
      }
    });
    await _pendingWrite;
  }
}

final announcementRefreshProvider = Provider.autoDispose<void>((ref) {
  void refresh() {
    if (ref.read(dashboardProvider).isLoading) return;
    ref.invalidate(dashboardProvider);
  }

  final lifecycle = AppLifecycleListener(onResume: refresh);
  final timer = Timer.periodic(const Duration(seconds: 20), (_) {
    if (WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed) {
      refresh();
    }
  });
  ref.onDispose(timer.cancel);
  ref.onDispose(lifecycle.dispose);
});
