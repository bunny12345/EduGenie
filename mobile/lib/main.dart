import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'navigation/role_router.dart';
import 'state/theme_provider.dart';
import 'theme/app_theme.dart';

void main() {
  runApp(const ProviderScope(child: AcademiXApp()));
}

class AcademiXApp extends ConsumerWidget {
  const AcademiXApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final themeMode = ref.watch(themeModeProvider);
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

