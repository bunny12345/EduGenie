import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/focus_lock_service.dart';
import '../services/secure_storage_service.dart';
import 'session_provider.dart';

final focusLockServiceProvider = Provider<FocusLockService>((ref) => FocusLockService());

/// Longest a parent can lock the device for in one go — enforced both in the
/// UI's duration picker and again here as a hard server-side-style clamp.
const Duration kFocusLockMaxDuration = Duration(hours: 3);

class FocusLockState {
  final bool pinSet;
  final bool enabled; // parent turned Focus Mode on — persists across app restarts
  final bool engaged; // native screen-pinning is actually active right now
  final DateTime? unlockAt; // when Focus Mode auto-unlocks, null if not enabled

  const FocusLockState({this.pinSet = false, this.enabled = false, this.engaged = false, this.unlockAt});

  FocusLockState copyWith({bool? pinSet, bool? enabled, bool? engaged}) => FocusLockState(
        pinSet: pinSet ?? this.pinSet,
        enabled: enabled ?? this.enabled,
        engaged: engaged ?? this.engaged,
        unlockAt: unlockAt,
      );
}

/// Parental "Focus Mode" lock — PIN + enabled flag + a chosen auto-unlock
/// time (max 3h) persisted in secure storage so it survives app/phone
/// restarts. On cold start, if still within its window, re-engages Android
/// screen pinning and reschedules the remaining countdown; if the window
/// already passed while the app was closed, unlocks immediately.
///
/// Expiry is judged against the wall clock ([FocusLockState.unlockAt]), not
/// just a one-shot [Timer]: Dart timers run on a monotonic clock that pauses
/// while the phone sleeps, so a screen-off lock would otherwise unlock late
/// (by however long the screen was off). A periodic watchdog plus an
/// app-resume check release the lock as soon as the scheduled time passes.
class FocusLockNotifier extends Notifier<FocusLockState> {
  static const Duration _watchdogInterval = Duration(seconds: 15);

  Timer? _autoUnlockTimer;
  Timer? _watchdog;
  AppLifecycleListener? _lifecycle;
  bool _releasing = false;
  // Native unpin failed (e.g. fired while the screen was off) — retry it.
  bool _nativeUnlockPending = false;

  @override
  FocusLockState build() {
    ref.onDispose(() {
      _autoUnlockTimer?.cancel();
      _stopWatching();
    });
    Future.microtask(_restore);
    return const FocusLockState();
  }

  bool get _isExpired {
    final unlockAt = state.unlockAt;
    return state.enabled && unlockAt != null && !DateTime.now().isBefore(unlockAt);
  }

  /// Unlocks if the scheduled time has already passed. Returns true when the
  /// lock is (now) off, so callers can skip asking for the parent PIN.
  Future<bool> releaseIfExpired() async {
    if (!state.enabled) return true;
    if (!_isExpired) return false;
    if (!_releasing) {
      _releasing = true;
      try {
        await disable();
      } finally {
        _releasing = false;
      }
    }
    return !state.enabled;
  }

  Future<void> _onTick() async {
    if (_nativeUnlockPending) {
      final ok = await ref.read(focusLockServiceProvider).stopLockTask();
      if (ok) _nativeUnlockPending = false;
    }
    await releaseIfExpired();
    if (!state.enabled && !_nativeUnlockPending) _stopWatching();
  }

  void _startWatching() {
    _watchdog ??= Timer.periodic(_watchdogInterval, (_) => _onTick());
    _lifecycle ??= AppLifecycleListener(onResume: _onTick);
  }

  void _stopWatching() {
    _watchdog?.cancel();
    _watchdog = null;
    _lifecycle?.dispose();
    _lifecycle = null;
  }

  Future<void> _restore() async {
    final storage = ref.read(secureStorageServiceProvider);
    final pin = await storage.readFocusLockPin();
    final enabled = await storage.readFocusLockEnabled();
    final unlockAt = await storage.readFocusLockUnlockAt();

    if (enabled && unlockAt != null && unlockAt.isAfter(DateTime.now())) {
      final ok = await ref.read(focusLockServiceProvider).startLockTask();
      state = FocusLockState(pinSet: pin != null && pin.isNotEmpty, enabled: true, engaged: ok, unlockAt: unlockAt);
      _scheduleAutoUnlock(unlockAt.difference(DateTime.now()));
    } else if (enabled) {
      // Was left on but the window already elapsed while the app was closed.
      await _clearLockedStorage(storage);
      state = FocusLockState(pinSet: pin != null && pin.isNotEmpty);
    } else {
      state = FocusLockState(pinSet: pin != null && pin.isNotEmpty);
    }
  }

  Future<void> setPin(String pin) async {
    await ref.read(secureStorageServiceProvider).writeFocusLockPin(pin);
    state = state.copyWith(pinSet: true);
  }

  Future<bool> verifyPin(String pin) async {
    final stored = await ref.read(secureStorageServiceProvider).readFocusLockPin();
    return stored != null && stored == pin;
  }

  /// Turns Focus Mode on for [duration], clamped to [kFocusLockMaxDuration] —
  /// it automatically turns itself off once that time is up, no PIN needed.
  Future<bool> enable(Duration duration) async {
    final clamped = duration > kFocusLockMaxDuration ? kFocusLockMaxDuration : duration;
    final unlockAt = DateTime.now().add(clamped);
    final ok = await ref.read(focusLockServiceProvider).startLockTask();
    final storage = ref.read(secureStorageServiceProvider);
    await storage.writeFocusLockEnabled(true);
    await storage.writeFocusLockUnlockAt(unlockAt);
    state = FocusLockState(pinSet: state.pinSet, enabled: true, engaged: ok, unlockAt: unlockAt);
    _scheduleAutoUnlock(clamped);
    return ok;
  }

  void _scheduleAutoUnlock(Duration remaining) {
    _autoUnlockTimer?.cancel();
    _autoUnlockTimer = Timer(remaining, releaseIfExpired);
    _startWatching();
  }

  Future<void> disable() async {
    _autoUnlockTimer?.cancel();
    final service = ref.read(focusLockServiceProvider);
    final wasEngaged = state.engaged;
    final stopped = await service.stopLockTask();
    _nativeUnlockPending = service.isSupported && wasEngaged && !stopped;
    await _clearLockedStorage(ref.read(secureStorageServiceProvider));
    state = FocusLockState(pinSet: state.pinSet, enabled: false, engaged: false, unlockAt: null);
    if (!_nativeUnlockPending) _stopWatching();
  }

  Future<void> _clearLockedStorage(SecureStorageService storage) async {
    await storage.writeFocusLockEnabled(false);
    await storage.writeFocusLockUnlockAt(null);
  }

  Future<void> removePin() async {
    await ref.read(secureStorageServiceProvider).clearFocusLockPin();
    state = state.copyWith(pinSet: false);
  }
}

final focusLockProvider = NotifierProvider<FocusLockNotifier, FocusLockState>(FocusLockNotifier.new);
