import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../services/push_notification_service.dart';
import '../../state/session_provider.dart';
import '../../state/student_providers.dart';
import '../../theme/app_colors.dart';
import '../../widgets/pressable_scale.dart';
import '../../widgets/section_card.dart';

final notificationPreviewProvider =
    FutureProvider.autoDispose<Map<String, dynamic>>(
      (ref) => ref.watch(studentApiServiceProvider).getNotificationPreview(),
    );

final pushPermissionProvider = FutureProvider.autoDispose<PushPermission>(
  (ref) => PushNotificationService.instance.permission(),
);

class _PrefOption {
  final String key;
  final String emoji;
  final String title;
  final String subtitle;
  final Color accent;

  const _PrefOption(
    this.key,
    this.emoji,
    this.title,
    this.subtitle,
    this.accent,
  );
}

const _options = [
  _PrefOption(
    'eveningPlan',
    '🌆',
    '6:30 PM study plan',
    'Homework to finish today, or a revision idea with Sam',
    Color(0xFFD58A16),
  ),
  _PrefOption(
    'nightRecap',
    '🌙',
    '9:00 PM progress recap',
    'Celebrate what you did today and keep the streak going',
    Color(0xFF5B47FF),
  ),
  _PrefOption(
    'testReminders',
    '📝',
    'Mock test reminders',
    'New mock tests and tests happening tomorrow',
    Color(0xFFEC4899),
  ),
  _PrefOption(
    'schoolUpdates',
    '🏫',
    'School updates',
    'New homework and announcements from your teachers',
    Color(0xFF10B981),
  ),
];

/// Student push-notification centre: permission status, a phone-style preview
/// of today's personalised messages, per-type toggles and a test send.
class StudentNotificationsScreen extends ConsumerStatefulWidget {
  const StudentNotificationsScreen({super.key});

  @override
  ConsumerState<StudentNotificationsScreen> createState() =>
      _StudentNotificationsScreenState();
}

class _StudentNotificationsScreenState
    extends ConsumerState<StudentNotificationsScreen> {
  Map<String, bool>? _prefs;
  bool _enabling = false;
  bool _sending = false;
  String? _error;

  void _snack(String text) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  Future<void> _enable() async {
    setState(() {
      _enabling = true;
      _error = null;
    });
    final ok = await PushNotificationService.instance.registerStudent(
      ref.read(apiClientProvider),
    );
    if (!mounted) return;
    setState(() => _enabling = false);
    ref.invalidate(pushPermissionProvider);
    ref.invalidate(notificationPreviewProvider);
    if (!ok) {
      setState(
        () => _error =
            'Notifications are blocked for AcademiX. Turn them on in your phone Settings › Apps › AcademiX › Notifications.',
      );
    } else {
      _snack('🔔 Reminders are on for this phone!');
    }
  }

  Future<void> _toggle(
    String key,
    bool value,
    Map<String, bool> current,
  ) async {
    final previous = Map<String, bool>.from(current);
    setState(() {
      _prefs = {...current, key: value};
      _error = null;
    });
    try {
      final res = await ref
          .read(studentApiServiceProvider)
          .updateNotificationPreferences({key: value});
      final saved = res['preferences'];
      if (saved is Map && mounted) {
        setState(
          () => _prefs = saved.map((k, v) => MapEntry(k.toString(), v == true)),
        );
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _prefs = previous;
        _error =
            'Could not save that change: ${e.toString().replaceFirst('Exception: ', '')}';
      });
    }
  }

  Future<void> _sendTest() async {
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final res = await ref
          .read(studentApiServiceProvider)
          .sendTestNotification();
      if (res['success'] == true) {
        _snack('🚀 Sent! Check your notification shade.');
      } else if (mounted) {
        setState(
          () => _error =
              res['error']?.toString() ?? 'Could not send a test notification.',
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final previewAsync = ref.watch(notificationPreviewProvider);
    final permission =
        ref.watch(pushPermissionProvider).value ?? PushPermission.unavailable;
    final palette = AppColors.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Notifications')),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(pushPermissionProvider);
          ref.invalidate(notificationPreviewProvider);
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
          children: [
            _HeroCard(
              permission: permission,
              enabling: _enabling,
              onEnable: _enable,
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: ErrorInline(message: _error!),
              ),
            previewAsync.when(
              loading: () => const Column(
                children: [
                  SkeletonBox(height: 110),
                  SizedBox(height: 10),
                  SkeletonBox(height: 220),
                ],
              ),
              error: (e, _) => ErrorInline(
                message:
                    'Unable to load your reminders: ${e.toString().replaceFirst('Exception: ', '')}',
              ),
              data: (data) {
                final serverPrefs = Map<String, dynamic>.from(
                  data['preferences'] as Map? ?? {},
                );
                final prefs =
                    _prefs ??
                    {
                      for (final o in _options)
                        o.key: serverPrefs[o.key] != false,
                    };
                final registered = ((data['devices'] as num?) ?? 0) > 0;
                final summary = Map<String, dynamic>.from(
                  data['summary'] as Map? ?? {},
                );
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _SummaryChips(summary: summary),
                    const SizedBox(height: 14),
                    _SectionLabel(
                      'Today on your phone',
                      trailing: data['timezone']?.toString(),
                    ),
                    if (prefs['eveningPlan'] != false)
                      _PhoneNotification(
                        time: '6:30 PM',
                        message: data['eveningPlan'],
                      ),
                    if (prefs['testReminders'] != false &&
                        data['testTomorrow'] is Map)
                      _PhoneNotification(
                        time: '6:30 PM',
                        message: data['testTomorrow'],
                      ),
                    if (prefs['nightRecap'] != false)
                      _PhoneNotification(
                        time: '9:00 PM',
                        message: data['nightRecap'],
                        subtle: true,
                      ),
                    if (prefs['eveningPlan'] == false &&
                        prefs['nightRecap'] == false)
                      Text(
                        'Daily reminders are paused. Turn one on below 👇',
                        style: TextStyle(color: palette.muted),
                      ),
                    const SizedBox(height: 16),
                    const _SectionLabel('Choose what you get'),
                    SectionCard(
                      padding: const EdgeInsets.symmetric(
                        vertical: 4,
                        horizontal: 4,
                      ),
                      child: Material(
                        type: MaterialType.transparency,
                        child: Column(
                          children: [
                            for (final option in _options)
                              _PrefTile(
                                option: option,
                                value: prefs[option.key] != false,
                                enabled: registered,
                                onChanged: (v) => _toggle(option.key, v, prefs),
                              ),
                          ],
                        ),
                      ),
                    ),
                    if (!registered)
                      Padding(
                        padding: const EdgeInsets.only(top: 2, bottom: 8),
                        child: Text(
                          'Turn on notifications above to customise your reminders.',
                          style: TextStyle(color: palette.muted, fontSize: 12),
                        ),
                      ),
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      onPressed: _sending || !registered ? null : _sendTest,
                      icon: _sending
                          ? const SizedBox(
                              height: 16,
                              width: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.send_rounded),
                      label: const Text('Send me a test notification'),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                    ),
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _HeroCard extends StatelessWidget {
  final PushPermission permission;
  final bool enabling;
  final VoidCallback onEnable;

  const _HeroCard({
    required this.permission,
    required this.enabling,
    required this.onEnable,
  });

  @override
  Widget build(BuildContext context) {
    final granted = permission == PushPermission.granted;
    final unavailable = permission == PushPermission.unavailable;
    final status = granted
        ? '🔔 On for this phone'
        : unavailable
        ? 'Not available in this app build'
        : permission == PushPermission.denied
        ? '🔕 Blocked in phone settings'
        : '🔕 Notifications are off';
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        gradient: const LinearGradient(
          colors: [AppColors.brand, AppColors.brand2, Color(0xFF0A0F3A)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        boxShadow: [
          BoxShadow(
            color: AppColors.brand.withValues(alpha: 0.35),
            blurRadius: 22,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.18),
                  shape: BoxShape.circle,
                ),
                alignment: Alignment.center,
                child: const Text('🔔', style: TextStyle(fontSize: 24)),
              ),
              const SizedBox(width: 12),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Study reminders',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    SizedBox(height: 2),
                    Text(
                      'Made just for you by Sam 🤖',
                      style: TextStyle(color: Colors.white70, fontSize: 12.5),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          const Text(
            'Every evening Sam checks your homework, tests and progress, then sends your plan at 6:30 PM and a recap at 9:00 PM.',
            style: TextStyle(color: Colors.white, height: 1.35, fontSize: 13.5),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 7,
                ),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.16),
                  borderRadius: BorderRadius.circular(30),
                ),
                child: Text(
                  status,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    fontSize: 12.5,
                  ),
                ),
              ),
              const Spacer(),
              if (!granted && !unavailable)
                PressableScale(
                  onTap: enabling ? null : onEnable,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 9,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(30),
                    ),
                    child: enabling
                        ? const SizedBox(
                            height: 16,
                            width: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text(
                            'Turn on',
                            style: TextStyle(
                              color: AppColors.brand,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _SummaryChips extends StatelessWidget {
  final Map<String, dynamic> summary;

  const _SummaryChips({required this.summary});

  @override
  Widget build(BuildContext context) {
    int n(String key) => (summary[key] as num?)?.toInt() ?? 0;
    final chips = [
      ('📚', '${n('pendingHomework')}', 'pending'),
      ('⏰', '${n('dueToday')}', 'due today'),
      ('📝', '${n('testsTomorrow')}', 'tests tmrw'),
      ('🔥', '${n('streakDays')}', 'day streak'),
    ];
    final palette = AppColors.of(context);
    return Row(
      children: [
        for (final (emoji, value, label) in chips)
          Expanded(
            child: Container(
              margin: const EdgeInsets.symmetric(horizontal: 3),
              padding: const EdgeInsets.symmetric(vertical: 10),
              decoration: BoxDecoration(
                color: palette.card,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: palette.line),
              ),
              child: Column(
                children: [
                  Text(emoji, style: const TextStyle(fontSize: 18)),
                  const SizedBox(height: 2),
                  Text(
                    value,
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 16,
                    ),
                  ),
                  Text(
                    label,
                    style: TextStyle(color: palette.muted, fontSize: 10.5),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String text;
  final String? trailing;

  const _SectionLabel(this.text, {this.trailing});

  @override
  Widget build(BuildContext context) {
    final palette = AppColors.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8, left: 2),
      child: Row(
        children: [
          Text(
            text,
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
          ),
          const Spacer(),
          if (trailing != null)
            Text(
              trailing!,
              style: TextStyle(color: palette.muted, fontSize: 11),
            ),
        ],
      ),
    );
  }
}

/// Looks like a real lock-screen notification so students know what to expect.
class _PhoneNotification extends StatelessWidget {
  final String time;
  final dynamic message;
  final bool subtle;

  const _PhoneNotification({
    required this.time,
    required this.message,
    this.subtle = false,
  });

  @override
  Widget build(BuildContext context) {
    if (message is! Map) return const SizedBox.shrink();
    final palette = AppColors.of(context);
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: palette.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: subtle
              ? AppColors.brand.withValues(alpha: 0.25)
              : palette.line,
        ),
        boxShadow: const [
          BoxShadow(
            color: Color(0x14272D64),
            blurRadius: 18,
            offset: Offset(0, 8),
          ),
        ],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: Image.asset(
              'assets/branding/logo.png',
              width: 36,
              height: 36,
              fit: BoxFit.cover,
              errorBuilder: (_, _, _) => Container(
                width: 36,
                height: 36,
                color: AppColors.brand,
                child: const Icon(
                  Icons.school_rounded,
                  color: Colors.white,
                  size: 20,
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      'AcademiX',
                      style: TextStyle(
                        color: palette.muted,
                        fontSize: 11.5,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      ' · $time',
                      style: TextStyle(color: palette.muted, fontSize: 11.5),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  message['title']?.toString() ?? '',
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  message['body']?.toString() ?? '',
                  style: TextStyle(
                    color: palette.text.withValues(alpha: 0.85),
                    height: 1.35,
                    fontSize: 13,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PrefTile extends StatelessWidget {
  final _PrefOption option;
  final bool value;
  final bool enabled;
  final ValueChanged<bool> onChanged;

  const _PrefTile({
    required this.option,
    required this.value,
    required this.enabled,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final palette = AppColors.of(context);
    return SwitchListTile.adaptive(
      value: value,
      onChanged: enabled ? onChanged : null,
      activeThumbColor: Colors.white,
      activeTrackColor: option.accent,
      contentPadding: const EdgeInsets.symmetric(horizontal: 10),
      secondary: Container(
        width: 40,
        height: 40,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: option.accent.withValues(alpha: 0.14),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(option.emoji, style: const TextStyle(fontSize: 20)),
      ),
      title: Text(
        option.title,
        style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
      ),
      subtitle: Text(
        option.subtitle,
        style: TextStyle(color: palette.muted, fontSize: 12),
      ),
    );
  }
}
