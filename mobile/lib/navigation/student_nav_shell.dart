import 'package:flutter/material.dart';

import '../screens/student/student_ai_tutor_screen.dart';
import '../screens/student/student_home_screen.dart';
import '../screens/student/student_more_screen.dart';
import '../screens/student/student_services_screen.dart';

/// Student portal shell — native bottom navigation (NOT the desktop sidebar).
/// 4 primary destinations per the agreed IA: Home / Services / AI Tutor / More.
class StudentShell extends StatefulWidget {
  const StudentShell({super.key});

  @override
  State<StudentShell> createState() => _StudentShellState();
}

class _StudentShellState extends State<StudentShell> {
  int _index = 0;

  static const _screens = [
    StudentHomeScreen(),
    StudentServicesScreen(),
    StudentAiTutorScreen(),
    StudentMoreScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(index: _index, children: _screens),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home_rounded), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.miscellaneous_services_outlined), selectedIcon: Icon(Icons.miscellaneous_services_rounded), label: 'Services'),
          NavigationDestination(icon: Icon(Icons.smart_toy_outlined), selectedIcon: Icon(Icons.smart_toy_rounded), label: 'AI Tutor'),
          NavigationDestination(icon: Icon(Icons.more_horiz_rounded), selectedIcon: Icon(Icons.more_horiz_rounded), label: 'More'),
        ],
      ),
    );
  }
}
