import 'package:mobile/services/focus_lock_service.dart';
import 'package:mobile/services/secure_storage_service.dart';
import 'package:mobile/state/focus_lock_provider.dart';
import 'package:mobile/state/session_provider.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class _MemoryStorage extends SecureStorageService {
  String? pin = '123456';
  bool enabled = false;
  DateTime? unlockAt;

  @override
  Future<String?> readFocusLockPin() async => pin;
  @override
  Future<bool> readFocusLockEnabled() async => enabled;
  @override
  Future<void> writeFocusLockEnabled(bool value) async => enabled = value;
  @override
  Future<DateTime?> readFocusLockUnlockAt() async => unlockAt;
  @override
  Future<void> writeFocusLockUnlockAt(DateTime? at) async => unlockAt = at;
}

class _FakePinning extends FocusLockService {
  bool stopSucceeds = true;
  int stopCalls = 0;

  @override
  bool get isSupported => true;
  @override
  Future<bool> startLockTask() async => true;
  @override
  Future<bool> stopLockTask() async {
    stopCalls++;
    return stopSucceeds;
  }
}

void main() {
  late _MemoryStorage storage;
  late _FakePinning pinning;
  late ProviderContainer container;

  // A lock whose scheduled end is just ahead; the test then lets real time
  // pass without advancing fake-async timers — like a phone asleep with the
  // screen off, where Dart's one-shot Timer doesn't fire on time.
  Future<void> lockThenSleepPastSchedule(WidgetTester tester) async {
    storage = _MemoryStorage()
      ..enabled = true
      ..unlockAt = DateTime.now().add(const Duration(milliseconds: 150));
    pinning = _FakePinning();
    container = ProviderContainer(overrides: [
      secureStorageServiceProvider.overrideWithValue(storage),
      focusLockServiceProvider.overrideWithValue(pinning),
    ]);
    addTearDown(container.dispose);
    container.read(focusLockProvider);
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 300)));
    await tester.pump();
    expect(container.read(focusLockProvider).enabled, isTrue);
  }

  void resumeApp(WidgetTester tester) {
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
  }

  testWidgets('unlocks on app resume once the scheduled time has passed', (tester) async {
    await lockThenSleepPastSchedule(tester);

    resumeApp(tester);
    await tester.pump();

    expect(container.read(focusLockProvider).enabled, isFalse);
    expect(storage.enabled, isFalse);
    expect(storage.unlockAt, isNull);
    expect(pinning.stopCalls, 1);
  });

  testWidgets('releaseIfExpired lets back/turn-off skip the PIN after the schedule', (tester) async {
    await lockThenSleepPastSchedule(tester);

    final released = await container.read(focusLockProvider.notifier).releaseIfExpired();

    expect(released, isTrue);
    expect(container.read(focusLockProvider).enabled, isFalse);
  });

  testWidgets('retries the native unpin on resume if it failed while asleep', (tester) async {
    await lockThenSleepPastSchedule(tester);
    pinning.stopSucceeds = false;

    resumeApp(tester);
    await tester.pump();
    expect(container.read(focusLockProvider).enabled, isFalse);
    expect(pinning.stopCalls, 1);

    pinning.stopSucceeds = true;
    resumeApp(tester);
    await tester.pump();
    expect(pinning.stopCalls, 2);

    resumeApp(tester);
    await tester.pump();
    expect(pinning.stopCalls, 2);
  });

  testWidgets('still within the window stays locked', (tester) async {
    storage = _MemoryStorage()
      ..enabled = true
      ..unlockAt = DateTime.now().add(const Duration(hours: 1));
    pinning = _FakePinning();
    container = ProviderContainer(overrides: [
      secureStorageServiceProvider.overrideWithValue(storage),
      focusLockServiceProvider.overrideWithValue(pinning),
    ]);
    container.read(focusLockProvider);
    await tester.pump();

    resumeApp(tester);
    await tester.pump();

    expect(container.read(focusLockProvider).enabled, isTrue);
    expect(await container.read(focusLockProvider.notifier).releaseIfExpired(), isFalse);
    expect(pinning.stopCalls, 0);
    container.dispose();
  });
}
