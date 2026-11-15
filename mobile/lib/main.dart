import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'navigation/role_router.dart';
import 'state/theme_provider.dart';
import 'theme/app_colors.dart';
import 'theme/app_theme.dart';

void main() {
  runApp(const ProviderScope(child: ThemeBootstrap()));
}

class ThemeBootstrap extends ConsumerWidget {
  const ThemeBootstrap({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ref.watch(storedThemePreferencesProvider).when(
      data: (_) => const AcademiXApp(),
      loading: () => const SizedBox.shrink(),
      error: (error, stack) {
        debugPrint('Theme preference restore failed: $error\n$stack');
        return MaterialApp(
          theme: AppTheme.light(),
          home: Scaffold(
            body: SafeArea(
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Text('Could not restore your saved theme. Please try again.'),
                      const SizedBox(height: 12),
                      ElevatedButton(
                        onPressed: () => ref.invalidate(storedThemePreferencesProvider),
                        child: const Text('Retry'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

class AcademiXApp extends ConsumerWidget {
  const AcademiXApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final themeMode = ref.watch(activeThemeModeProvider);
    AppColors.isDark = themeMode == ThemeMode.dark;
    return MaterialApp(
      title: 'AcademiX',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: themeMode,
      home: const RoleRouter(),
    );
  }
}
