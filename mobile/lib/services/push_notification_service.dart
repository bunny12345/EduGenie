import 'dart:async';
import 'dart:convert';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/painting.dart' show Color;
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_timezone/flutter_timezone.dart';

import 'api_client.dart';

/// Where a tapped notification should take the student.
class PushRoute {
  final String route; // homework | tests | ai_tutor | announcements | progress | home
  final String? subject;

  const PushRoute(this.route, {this.subject});

  static PushRoute? fromData(Map<String, dynamic> data) {
    final route = data['route']?.toString() ?? '';
    if (route.isEmpty) return null;
    final subject = data['subject']?.toString();
    return PushRoute(route, subject: subject == null || subject.isEmpty ? null : subject);
  }
}

enum PushPermission { unavailable, notDetermined, denied, granted }

const _channels = [
  AndroidNotificationChannel(
    'academix_daily',
    'Daily study reminders',
    description: 'Your 6:30 PM study plan and 9:00 PM progress recap.',
    importance: Importance.high,
  ),
  AndroidNotificationChannel(
    'academix_tests',
    'Mock test reminders',
    description: 'New mock tests and tests happening tomorrow.',
    importance: Importance.high,
  ),
  AndroidNotificationChannel(
    'academix_school',
    'School updates',
    description: 'New homework and announcements from your school.',
    importance: Importance.high,
  ),
];

/// Firebase Cloud Messaging for students: registers this phone with the
/// backend scheduler, shows foreground messages and routes taps. Every call is
/// a safe no-op when Firebase isn't configured (e.g. Flutter web or a build
/// without google-services.json), so the rest of the app is never affected.
class PushNotificationService {
  PushNotificationService._();
  static final PushNotificationService instance = PushNotificationService._();

  final FlutterLocalNotificationsPlugin _local = FlutterLocalNotificationsPlugin();
  final ValueNotifier<PushRoute?> openedRoute = ValueNotifier<PushRoute?>(null);
  bool _available = false;
  StreamSubscription<String>? _tokenRefresh;

  bool get isAvailable => _available;

  Future<void> initialize() async {
    if (kIsWeb || _available) return;
    try {
      await Firebase.initializeApp().timeout(const Duration(seconds: 8));
      await _local.initialize(
        settings: const InitializationSettings(
          android: AndroidInitializationSettings('@mipmap/ic_launcher'),
          iOS: DarwinInitializationSettings(
            requestAlertPermission: false,
            requestBadgePermission: false,
            requestSoundPermission: false,
          ),
        ),
        onDidReceiveNotificationResponse: (response) => _openPayload(response.payload),
      );
      final android = _local.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
      for (final channel in _channels) {
        await android?.createNotificationChannel(channel);
      }
      final messaging = FirebaseMessaging.instance;
      await messaging.setForegroundNotificationPresentationOptions(alert: true, badge: true, sound: true);
      FirebaseMessaging.onMessage.listen(_showForeground);
      FirebaseMessaging.onMessageOpenedApp.listen((m) => _open(m.data));
      final initial = await messaging.getInitialMessage();
      if (initial != null) _open(initial.data);
      final launch = await _local.getNotificationAppLaunchDetails();
      if (launch?.didNotificationLaunchApp ?? false) _openPayload(launch!.notificationResponse?.payload);
      _available = true;
    } catch (error) {
      debugPrint('Push notifications unavailable: $error');
      _available = false;
    }
  }

  void _open(Map<String, dynamic> data) {
    final route = PushRoute.fromData(data);
    if (route != null) openedRoute.value = route;
  }

  void _openPayload(String? payload) {
    if (payload == null || payload.isEmpty) return;
    try {
      _open(Map<String, dynamic>.from(jsonDecode(payload) as Map));
    } catch (_) {}
  }

  /// iOS shows foreground pushes natively (presentation options above);
  /// Android needs a local notification for messages received while open.
  Future<void> _showForeground(RemoteMessage message) async {
    final n = message.notification;
    if (n == null || defaultTargetPlatform != TargetPlatform.android) return;
    final channelId = n.android?.channelId ?? 'academix_daily';
    final channel = _channels.firstWhere((c) => c.id == channelId, orElse: () => _channels.first);
    await _local.show(
      id: message.messageId?.hashCode ?? DateTime.now().millisecondsSinceEpoch ~/ 1000,
      title: n.title,
      body: n.body,
      payload: jsonEncode(message.data),
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(
          channel.id,
          channel.name,
          channelDescription: channel.description,
          importance: Importance.high,
          priority: Priority.high,
          color: const Color(0xFF5B47FF),
          styleInformation: BigTextStyleInformation(n.body ?? ''),
        ),
      ),
    );
  }

  Future<PushPermission> permission() async {
    if (!_available) return PushPermission.unavailable;
    final settings = await FirebaseMessaging.instance.getNotificationSettings();
    return _mapStatus(settings.authorizationStatus);
  }

  PushPermission _mapStatus(AuthorizationStatus status) => switch (status) {
        AuthorizationStatus.authorized || AuthorizationStatus.provisional => PushPermission.granted,
        AuthorizationStatus.denied || AuthorizationStatus.deniedPermanently => PushPermission.denied,
        AuthorizationStatus.notDetermined => PushPermission.notDetermined,
      };

  Future<PushPermission> requestPermission() async {
    if (!_available) return PushPermission.unavailable;
    final settings = await FirebaseMessaging.instance.requestPermission(alert: true, badge: true, sound: true);
    return _mapStatus(settings.authorizationStatus);
  }

  String get _platform => defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android';

  Future<String> _timezone() async {
    try {
      return (await FlutterTimezone.getLocalTimezone()).identifier;
    } catch (_) {
      return 'Asia/Kolkata';
    }
  }

  /// Registers this phone for the signed-in student (asks for permission the
  /// first time). Returns true only after the backend accepts the token.
  Future<bool> registerStudent(ApiClient api) async {
    if (!_available) return false;
    try {
      final permission = await requestPermission();
      if (permission != PushPermission.granted) return false;
      final messaging = FirebaseMessaging.instance;
      // The backend sends with FCM HTTP v1 `message.token`, which takes the
      // classic registration token (register()/onRegistered yield an FID).
      // ignore: deprecated_member_use
      final token = await messaging.getToken();
      if (token == null || token.isEmpty) return false;
      await _sendToken(api, token);
      await _tokenRefresh?.cancel();
      // ignore: deprecated_member_use
      _tokenRefresh = messaging.onTokenRefresh.listen((next) async {
        try {
          await _sendToken(api, next);
        } catch (_) {
          debugPrint('Push token refresh could not be registered.');
        }
      });
      return true;
    } catch (error) {
      debugPrint('Push registration failed: $error');
      return false;
    }
  }

  Future<void> _sendToken(ApiClient api, String token) async {
    if ((api.authToken ?? '').isEmpty) {
      throw StateError('A student session is required for push registration.');
    }
    final result = await api.notificationRequest('devices', method: 'POST', data: {
      'token': token,
      'platform': _platform,
      'timezone': await _timezone(),
    });
    if (result['success'] != true) {
      throw StateError('The notification service did not accept the device registration.');
    }
  }

  /// Called on logout while the auth token is still valid, so the next person
  /// using this phone never receives the previous student's reminders.
  Future<void> unregister(ApiClient api) async {
    if (!_available) return;
    await _tokenRefresh?.cancel();
    _tokenRefresh = null;
    try {
      // ignore: deprecated_member_use
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null && (api.authToken ?? '').isNotEmpty) {
        await api.dio.post('/notifications/devices/remove', data: {'token': token}).timeout(const Duration(seconds: 5));
      }
    } catch (_) {
      // Server cleanup is best effort; deleting the token below stops delivery anyway.
    }
    try {
      // ignore: deprecated_member_use
      await FirebaseMessaging.instance.deleteToken();
    } catch (_) {}
  }
}
