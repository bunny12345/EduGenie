import 'dart:io';

import 'package:flutter/services.dart';

/// Wraps the native "academix/focus_lock" MethodChannel (Android Screen
/// Pinning / Lock Task Mode — see MainActivity.kt). Android-only; iOS has no
/// public API for a third-party app to lock itself to the foreground, so
/// [isSupported] is false there and callers should fall back to showing
/// Guided Access instructions instead.
class FocusLockService {
  static const _channel = MethodChannel('academix/focus_lock');

  bool get isSupported => Platform.isAndroid;

  Future<bool> startLockTask() async {
    if (!isSupported) return false;
    try {
      return await _channel.invokeMethod<bool>('startLockTask') ?? false;
    } catch (_) {
      return false;
    }
  }

  Future<bool> stopLockTask() async {
    if (!isSupported) return false;
    try {
      return await _channel.invokeMethod<bool>('stopLockTask') ?? false;
    } catch (_) {
      return false;
    }
  }

  Future<bool> isLockTaskActive() async {
    if (!isSupported) return false;
    try {
      return await _channel.invokeMethod<bool>('isLockTaskActive') ?? false;
    } catch (_) {
      return false;
    }
  }
}
