import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'session_provider.dart';

class StudentNavigationNotifier extends Notifier<int> {
  @override
  int build() {
    ref.watch(sessionProvider.select((session) => session.value?.userId));
    return 0;
  }

  void select(int index) {
    if (index < 0 || index > 2) throw ArgumentError.value(index, 'index');
    state = index;
  }
}

final studentNavigationProvider = NotifierProvider<StudentNavigationNotifier, int>(StudentNavigationNotifier.new);
