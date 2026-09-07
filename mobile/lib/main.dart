import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'navigation/role_router.dart';
import 'theme/app_theme.dart';

void main() {
  runApp(const ProviderScope(child: AcademiXApp()));
}

class AcademiXApp extends StatelessWidget {
  const AcademiXApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'AcademiX',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      home: const RoleRouter(),
    );
  }
}

