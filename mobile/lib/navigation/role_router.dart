import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../screens/auth/role_gateway_screen.dart';
import '../state/session_provider.dart';
import 'school_shell.dart';
import 'student_nav_shell.dart';
import 'teacher_shell.dart';

/// Mobile equivalent of the role dispatch in `web/src/App.js`: shows the
/// login gateway when signed out, otherwise routes to the matching portal
/// shell. Restores the session from secure storage on cold start.
class RoleRouter extends ConsumerWidget {
  const RoleRouter({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sessionAsync = ref.watch(sessionProvider);

    return sessionAsync.when(
      loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (err, stack) => const RoleGatewayScreen(),
      data: (session) {
        if (session == null) return const RoleGatewayScreen();
        if (session.isTeacher) return const TeacherShell();
        if (session.isSchoolAdmin) return const SchoolShell();
        return const StudentShell();
      },
    );
  }
}
