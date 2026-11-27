import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/session_provider.dart';
import '../../state/student_providers.dart';
import '../../state/theme_provider.dart';
import '../../theme/app_colors.dart';
import '../../widgets/app_update_tile.dart';
import '../../widgets/section_card.dart';
import '../shared/parental_lock_screen.dart';
import 'student_notifications_screen.dart';

/// "More" tab — the single home for student preferences (dark mode,
/// notifications, parental lock) plus logout. Academics sections stay on the
/// Home grid so they aren't duplicated here.
class StudentMoreScreen extends ConsumerStatefulWidget {
  const StudentMoreScreen({super.key});

  @override
  ConsumerState<StudentMoreScreen> createState() => _StudentMoreScreenState();
}

class _StudentMoreScreenState extends ConsumerState<StudentMoreScreen> {
  bool _savingTheme = false;
  String? _error;

  Future<void> _setDark(bool nextDark) async {
    final studentId = ref.read(sessionProvider).value?.userId ?? '';
    setState(() {
      _savingTheme = true;
      _error = null;
    });
    var savedOnDevice = false;
    try {
      await ref.read(themeModeProvider.notifier).setDark(nextDark);
      savedOnDevice = true;
      if (studentId.isEmpty) return;
      final settings = await ref.read(settingsProvider.future);
      final prefs = Map<String, dynamic>.from(settings['prefs'] as Map? ?? {});
      await ref.read(studentApiServiceProvider).saveSettings(studentId, {
        ...prefs,
        'theme': nextDark ? 'Dark' : 'Light',
      });
    } catch (e) {
      if (mounted) {
        setState(
          () => _error = savedOnDevice
              ? 'Theme saved on this device, but could not sync your preference: $e'
              : 'Theme applied, but could not save it on this device: $e',
        );
      }
    } finally {
      if (mounted) setState(() => _savingTheme = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final profile = ref.watch(sessionProvider.select((session) {
      final value = session.value;
      return value == null ? null : (value.name, value.className);
    }));
    final isDark = ref.watch(themeModeProvider) == ThemeMode.dark;
    final palette = AppColors.of(context);

    // Apply the account's saved theme once per app session (a manual toggle
    // always wins afterwards). Loads silently; failures keep the local theme.
    ref.listen(settingsProvider, (_, next) {
      final theme = next.value?['prefs'] is Map
          ? (next.value!['prefs'] as Map)['theme']?.toString()
          : null;
      ref.read(themeModeProvider.notifier).hydrateFromPrefs(theme).catchError((
        Object e,
      ) {
        if (mounted) {
          setState(
            () => _error = 'Could not save your theme on this device: $e',
          );
        }
      });
    });

    return Scaffold(
      appBar: AppBar(title: const Text('More')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
        children: [
          if (profile != null)
            _ProfileCard(name: profile.$1, className: profile.$2),
          const _GroupLabel('Preferences'),
          SectionCard(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Material(
              type: MaterialType.transparency,
              child: Column(
                children: [
                  _MoreTile(
                    icon: isDark
                        ? Icons.dark_mode_rounded
                        : Icons.light_mode_rounded,
                    color: isDark
                        ? const Color(0xFF8B7CFF)
                        : const Color(0xFFF59E0B),
                    title: 'Dark mode',
                    subtitle: isDark
                        ? 'Easy on the eyes at night 🌙'
                        : 'Bright and clear ☀️',
                    onTap: _savingTheme ? null : () => _setDark(!isDark),
                    trailing: Switch.adaptive(
                      value: isDark,
                      activeThumbColor: Colors.white,
                      activeTrackColor: AppColors.brand,
                      onChanged: _savingTheme ? null : _setDark,
                    ),
                  ),
                  Divider(height: 1, indent: 64, color: palette.line),
                  _MoreTile(
                    icon: Icons.notifications_active_rounded,
                    color: const Color(0xFFEC4899),
                    title: 'Notifications',
                    subtitle: '6:30 PM plan, 9:00 PM recap & school updates',
                    onTap: () => _open(const StudentNotificationsScreen()),
                  ),
                  Divider(height: 1, indent: 64, color: palette.line),
                  const AppUpdateTile(),
                ],
              ),
            ),
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: ErrorInline(message: _error!),
            ),
          const _GroupLabel('Safety'),
          SectionCard(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Material(
              type: MaterialType.transparency,
              child: _MoreTile(
                icon: Icons.lock_outline_rounded,
                color: const Color(0xFF10B981),
                title: 'Parental Lock',
                subtitle: 'Keep the app pinned with a parent PIN',
                onTap: () => _open(const ParentalLockScreen()),
              ),
            ),
          ),
          const SizedBox(height: 6),
          SectionCard(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Material(
              type: MaterialType.transparency,
              child: _MoreTile(
                icon: Icons.logout_rounded,
                color: AppColors.danger,
                title: 'Logout',
                titleColor: AppColors.danger,
                onTap: () => ref.read(sessionProvider.notifier).logout(),
                trailing: const SizedBox.shrink(),
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _open(Widget screen) =>
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));
}

class _ProfileCard extends StatelessWidget {
  final String name;
  final String className;

  const _ProfileCard({required this.name, required this.className});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: 4, bottom: 6),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        gradient: const LinearGradient(
          colors: [AppColors.brand, AppColors.brand2],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        boxShadow: [
          BoxShadow(
            color: AppColors.brand.withValues(alpha: 0.28),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 24,
            backgroundColor: Colors.white.withValues(alpha: 0.22),
            child: Text(
              name.isNotEmpty ? name[0].toUpperCase() : '?',
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w800,
                fontSize: 20,
              ),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                    fontSize: 17,
                  ),
                ),
                if (className.isNotEmpty)
                  Text(
                    className,
                    style: const TextStyle(
                      color: Colors.white70,
                      fontSize: 12.5,
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

class _GroupLabel extends StatelessWidget {
  final String text;

  const _GroupLabel(this.text);

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(4, 14, 4, 8),
    child: Text(
      text.toUpperCase(),
      style: TextStyle(
        color: AppColors.of(context).muted,
        fontSize: 11.5,
        fontWeight: FontWeight.w800,
        letterSpacing: 0.8,
      ),
    ),
  );
}

class _MoreTile extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String title;
  final String? subtitle;
  final Color? titleColor;
  final VoidCallback? onTap;
  final Widget? trailing;

  const _MoreTile({
    required this.icon,
    required this.color,
    required this.title,
    this.subtitle,
    this.titleColor,
    this.onTap,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    final palette = AppColors.of(context);
    return ListTile(
      onTap: onTap,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12),
      leading: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.14),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Icon(icon, color: color, size: 22),
      ),
      title: Text(
        title,
        style: TextStyle(fontWeight: FontWeight.w700, color: titleColor),
      ),
      subtitle: subtitle == null
          ? null
          : Text(
              subtitle!,
              style: TextStyle(color: palette.muted, fontSize: 12),
            ),
      trailing:
          trailing ?? Icon(Icons.chevron_right_rounded, color: palette.muted),
    );
  }
}
