import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/screens/student/student_attendance_screen.dart';
import 'package:mobile/screens/student/student_services_screen.dart';
import 'package:mobile/screens/teacher/teacher_attendance_tab.dart';
import 'package:mobile/services/api_client.dart';
import 'package:mobile/services/teacher_api_service.dart';
import 'package:mobile/state/teacher_providers.dart';
import 'package:mobile/widgets/guided_highlight.dart';

const _period = {'startDate': '2026-04-01', 'endDate': '2026-12-01'};

class _AttendanceApi extends TeacherApiService {
  _AttendanceApi() : super(ApiClient());

  List<Map<String, Object>>? captured;

  @override
  Future<Map<String, dynamic>> getAttendance({
    String? className,
    String? date,
  }) async => {
    'classes': ['Class 8'],
    'className': 'Class 8',
    'date': '2026-06-02',
    'today': '2026-06-02',
    'period': _period,
    'saved': false,
    'students': [
      {'id': 'a', 'name': 'Alex', 'present': true, 'recorded': false},
      {'id': 'b', 'name': 'Blair', 'present': true, 'recorded': false},
    ],
  };

  @override
  Future<void> saveAttendance({
    required String className,
    required String date,
    required bool saved,
    required List<Map<String, Object>> entries,
  }) async {
    captured = entries;
  }
}

void main() {
  testWidgets('teacher can clear all, recheck all and correct one student', (
    tester,
  ) async {
    final api = _AttendanceApi();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [teacherApiServiceProvider.overrideWithValue(api)],
        child: const MaterialApp(home: Scaffold(body: TeacherAttendanceTab())),
      ),
    );
    await tester.pumpAndSettle();
    expect(tester.widget<GuidedHighlight>(find.ancestor(of: find.text('Save attendance'), matching: find.byType(GuidedHighlight))).active, isTrue);
    final all = find.text('Select all present');
    expect(find.text('2 present · 0 absent'), findsOneWidget);
    await tester.tap(all);
    await tester.pumpAndSettle();
    expect(find.text('0 present · 2 absent'), findsOneWidget);
    await tester.tap(all);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Blair'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Mark absent'));
    await tester.pumpAndSettle();
    final save = find.text('Save attendance');
    await tester.ensureVisible(save);
    await tester.tap(save);
    await tester.pumpAndSettle();
    expect(api.captured, [
      {'studentId': 'a', 'present': true},
      {'studentId': 'b', 'present': false},
    ]);
    expect(find.text('Attendance saved.'), findsOneWidget);
    expect(tester.widget<GuidedHighlight>(find.ancestor(of: find.text('Save corrections'), matching: find.byType(GuidedHighlight))).active, isFalse);
  });

  testWidgets('the student Attendance icon opens the saved percentage', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          studentAttendanceProvider.overrideWith(
            (ref) async => {
              'period': _period,
              'percentage': 0,
              'recordedDays': 1,
              'presentDays': 0,
              'absentDays': 1,
              'records': [
                {'date': '2026-06-02', 'present': false},
              ],
            },
          ),
        ],
        child: const MaterialApp(home: StudentServicesScreen()),
      ),
    );
    await tester.pump();
    await tester.tap(find.text('Attendance'));
    await tester.pump(const Duration(milliseconds: 350));
    await tester.pump();
    expect(find.text('My attendance'), findsOneWidget);
    expect(find.text('0%'), findsOneWidget);
    expect(find.text('Only saved roll-call days count.'), findsOneWidget);
  });
}
