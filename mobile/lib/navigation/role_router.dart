import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../screens/auth/role_gateway_screen.dart';
import '../state/session_provider.dart';
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
      loading: () =>
          const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (err, stack) => const RoleGatewayScreen(),
      data: (session) {
        if (session == null) return const RoleGatewayScreen();
        if (session.isTeacher) return const TeacherShell();
        if (session.isStudent) return const StudentShell();
        return Scaffold(
          appBar: AppBar(title: const Text('AcademiX')),
          body: SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    session.isSchoolAdmin
                        ? 'School administration is available on the AcademiX website only.'
                        : 'This account role is not supported in the mobile app.',
                  ),
                  const SizedBox(height: 12),
                  const Text('The mobile app is for students and teachers.'),
                  const SizedBox(height: 20),
                  ElevatedButton(
                    onPressed: () async {
                      try {
                        await ref.read(sessionProvider.notifier).logout();
                      } catch (_) {
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text(
                                'Could not sign out. Please try again.',
                              ),
                            ),
                          );
                        }
                      }
                    },
                    child: const Text('Sign out'),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
