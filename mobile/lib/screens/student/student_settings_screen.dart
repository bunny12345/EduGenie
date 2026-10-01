import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/session_provider.dart';
import '../../state/student_providers.dart';
import '../../state/theme_provider.dart';
import '../../widgets/section_card.dart';

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
    // Apply immediately and treat this as the source of truth for the rest
    // of the session — the backend save below is best-effort persistence
    // for next login only, it must never be what the UI displays/toggles
    // off of (its save endpoint is known to silently no-op on a 2nd save).
    ref.read(themeModeProvider.notifier).setDark(nextDark);
    if (studentId.isEmpty) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref.read(studentApiServiceProvider).saveSettings(studentId, {
        ...currentPrefs,
        'theme': nextDark ? 'Dark' : 'Light',
      });
    } catch (e) {
      setState(() => _error = 'Theme applied, but could not save your preference: $e');
    } finally {
      if (mounted) setState(() => _saving = false);
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
              ref.read(themeModeProvider.notifier).hydrateFromPrefs(prefs['theme']?.toString());
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
              ],
            );
          },
        ),
      ),
    );
  }
}
