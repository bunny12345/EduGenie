import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/session_provider.dart';
import '../../state/student_providers.dart';
import '../../state/theme_provider.dart';
import '../../widgets/section_card.dart';
import 'student_notifications_screen.dart';

class StudentSettingsScreen extends ConsumerStatefulWidget {
  const StudentSettingsScreen({super.key});

  @override
  ConsumerState<StudentSettingsScreen> createState() => _StudentSettingsScreenState();
}

class _StudentSettingsScreenState extends ConsumerState<StudentSettingsScreen> {
  bool _saving = false;
  String? _error;

  Future<void> _toggleTheme(Map<String, dynamic> currentPrefs, bool currentlyDark) async {
    final studentId = ref.read(sessionProvider).value?.userId ?? '';
    final nextDark = !currentlyDark;
    setState(() {
      _saving = true;
      _error = null;
    });
    var savedOnDevice = false;
    try {
      await ref.read(themeModeProvider.notifier).setDark(nextDark);
      savedOnDevice = true;
      if (studentId.isEmpty) return;
      await ref.read(studentApiServiceProvider).saveSettings(studentId, {
        ...currentPrefs,
        'theme': nextDark ? 'Dark' : 'Light',
      });
    } catch (e) {
      if (mounted) {
        setState(() => _error = savedOnDevice
            ? 'Theme saved on this device, but could not sync your preference: $e'
            : 'Theme applied, but could not save it on this device: $e');
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _hydrateTheme(String? theme) async {
    try {
      await ref.read(themeModeProvider.notifier).hydrateFromPrefs(theme);
    } catch (error) {
      if (mounted) setState(() => _error = 'Could not save your theme on this device: $error');
    }
  }

  @override
  Widget build(BuildContext context) {
    final settingsAsync = ref.watch(settingsProvider);
    final isDark = ref.watch(themeModeProvider) == ThemeMode.dark;

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(settingsProvider),
        child: settingsAsync.when(
          loading: () => ListView(padding: const EdgeInsets.all(16), children: const [SkeletonBox(height: 200)]),
          error: (e, _) => ListView(padding: const EdgeInsets.all(16), children: [ErrorInline(message: 'Unable to load settings: $e')]),
          data: (settings) {
            final prefs = Map<String, dynamic>.from(settings['prefs'] as Map? ?? {});
            final language = prefs['language']?.toString() ?? 'English';
            // Apply the saved preference once per app session (a manual
            // toggle below always wins afterwards for the rest of the session).
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (mounted) _hydrateTheme(prefs['theme']?.toString());
            });
            return ListView(
              padding: const EdgeInsets.all(16),
              children: [
                SectionCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      ListTile(contentPadding: EdgeInsets.zero, leading: const Icon(Icons.language_rounded), title: const Text('Language'), trailing: Text(language)),
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(Icons.palette_rounded),
                        title: const Text('Theme'),
                        trailing: Text(isDark ? 'Dark' : 'Light'),
                      ),
                      const SizedBox(height: 8),
                      ElevatedButton(
                        onPressed: _saving ? null : () => _toggleTheme(prefs, isDark),
                        child: _saving
                            ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                            : Text(isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'),
                      ),
                      if (_error != null) Padding(padding: const EdgeInsets.only(top: 8), child: ErrorInline(message: _error!)),
                    ],
                  ),
                ),
                SectionCard(
                  child: Material(
                    type: MaterialType.transparency,
                    child: ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.notifications_active_rounded),
                    title: const Text('Notifications'),
                    subtitle: const Text('6:30 PM study plan, 9:00 PM recap & school updates'),
                    trailing: const Icon(Icons.chevron_right_rounded),
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute(builder: (_) => const StudentNotificationsScreen()),
                    ),
                  ),
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
