import 'package:flutter/material.dart';
import '../state/exam_access_provider.dart';
import '../theme/app_colors.dart';

class ExamTutorNotice extends StatelessWidget {
  final ExamAccess? access;
  const ExamTutorNotice({super.key, this.access});

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('AI Tutor')),
    body: SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          Icon(
            Icons.lock_clock_outlined,
            size: 44,
            color: AppColors.of(context).accent,
          ),
          const SizedBox(height: 16),
          const Text(
            'AI Tutor is unavailable',
            textAlign: TextAlign.center,
            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 20),
          ),
          const SizedBox(height: 12),
          Text(
            access?.error ??
                (access == null
                    ? 'Checking exam access.'
                    : 'A strict mock exam is scheduled now. AI Tutor returns after you submit or the exam schedule ends.'),
            textAlign: TextAlign.center,
          ),
          for (final exam in access?.exams ?? <Map<String, dynamic>>[])
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text(
                exam['title']?.toString() ?? 'Mock exam',
                textAlign: TextAlign.center,
              ),
            ),
        ],
      ),
    ),
  );
}
