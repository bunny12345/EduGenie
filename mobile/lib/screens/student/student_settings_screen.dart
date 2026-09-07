import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/session_provider.dart';
import '../../state/student_providers.dart';
import '../../widgets/section_card.dart';

class StudentSettingsScreen extends ConsumerStatefulWidget {
  const StudentSettingsScreen({super.key});

  @override
  ConsumerState<StudentSettingsScreen> createState() => _StudentSettingsScreenState();
}

class _StudentSettingsScreenState extends ConsumerState<StudentSettingsScreen> {
  bool _saving = false;
  String? _error;

  Future<void> _toggleTheme(Map<String, dynamic> currentPrefs) async {
    final studentId = ref.read(sessionProvider).value?.userId ?? '';
    if (studentId.isEmpty) return;
    final currentTheme = currentPrefs['theme']?.toString() ?? 'Light';
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref.read(studentApiServiceProvider).saveSettings(studentId, {
        ...currentPrefs,
        'theme': currentTheme == 'Dark' ? 'Light' : 'Dark',
      });
      ref.invalidate(settingsProvider);
    } catch (e) {
      setState(() => _error = 'Unable to save settings: $e');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final settingsAsync = ref.watch(settingsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(settingsProvider),
        child: settingsAsync.when(
          loading: () => ListView(padding: const EdgeInsets.all(16), children: const [SkeletonBox(height: 200)]),
          error: (e, _) => ListView(padding: const EdgeInsets.all(16), children: [ErrorInline(message: 'Unable to load settings: $e')]),
          data: (settings) {
            final prefs = Map<String, dynamic>.from(settings['prefs'] as Map? ?? {});
            final theme = prefs['theme']?.toString() ?? 'Light';
            final language = prefs['language']?.toString() ?? 'English';
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
                        trailing: Text(theme),
                      ),
                      const SizedBox(height: 8),
                      ElevatedButton(
                        onPressed: _saving ? null : () => _toggleTheme(prefs),
                        child: _saving
                            ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                            : const Text('Toggle Theme'),
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
