import 'package:flutter/material.dart';

import '../screens/student/student_ai_tutor_screen.dart';
import '../screens/student/student_home_screen.dart';
import '../screens/student/student_learn_screen.dart';
import '../screens/student/student_more_screen.dart';
import '../screens/student/student_tasks_screen.dart';

/// Student portal shell — native bottom navigation (NOT the desktop sidebar).
/// 5 primary destinations per the agreed IA: Home / Learn / AI Tutor / Tasks / More.
class StudentShell extends StatefulWidget {
  const StudentShell({super.key});

  @override
  State<StudentShell> createState() => _StudentShellState();
}

class _StudentShellState extends State<StudentShell> {
  int _index = 0;

  static const _screens = [
    StudentHomeScreen(),
    StudentLearnScreen(),
    StudentAiTutorScreen(),
    StudentTasksScreen(),
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
          NavigationDestination(icon: Icon(Icons.menu_book_outlined), selectedIcon: Icon(Icons.menu_book_rounded), label: 'Learn'),
          NavigationDestination(icon: Icon(Icons.smart_toy_outlined), selectedIcon: Icon(Icons.smart_toy_rounded), label: 'AI Tutor'),
          NavigationDestination(icon: Icon(Icons.assignment_outlined), selectedIcon: Icon(Icons.assignment_rounded), label: 'Tasks'),
          NavigationDestination(icon: Icon(Icons.more_horiz_rounded), selectedIcon: Icon(Icons.more_horiz_rounded), label: 'More'),
        ],
      ),
    );
  }
}
