import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile/screens/teacher/teacher_progress_tab.dart';
import 'package:mobile/screens/teacher/teacher_report_cards_tab.dart';
import 'package:mobile/screens/teacher/teacher_students_tab.dart';
import 'package:mobile/services/api_client.dart';
import 'package:mobile/services/teacher_api_service.dart';
import 'package:mobile/state/teacher_providers.dart';

class _ClassApi extends TeacherApiService {
  _ClassApi(this.profile) : super(ApiClient());
  final Future<Map<String, dynamic>> profile;
  final filters = <String>[];
  final examClasses = <String>[];
  int rosterClassRequests = 0;

  @override
  Future<Map<String, dynamic>> getProfile() => profile;

  @override
  Future<List<String>> getClassOptions() async {
    rosterClassRequests++;
    return ['Class 8'];
  }

  @override
  Future<List<Map<String, dynamic>>> getStudents({String search = '', String className = ''}) async {
    filters.add(className);
    return [];
  }

  @override
  Future<Map<String, dynamic>> getReportCardExams(String className) async {
    examClasses.add(className);
    return {'exams': <Map<String, dynamic>>[]};
  }
}

void main() {
  setUpAll(() => GoogleFonts.config.allowRuntimeFetching = false);

  test('registered classes determine options and default, even with no students', () async {
    final api = _ClassApi(Future.value({'grades': ['Class 9']}));
    final container = ProviderContainer(overrides: [teacherApiServiceProvider.overrideWithValue(api)]);
    addTearDown(container.dispose);
    final target = container.listen(teacherTargetClassProvider, (previous, next) {}, fireImmediately: true);
    final options = container.listen(teacherClassOptionsProvider, (previous, next) {});
    expect(await container.read(teacherClassOptionsProvider.future), ['Class 9']);
    expect(target.read(), 'Class 9');
    expect(api.rosterClassRequests, 0);
    target.close();
    options.close();
  });

  test('multiple registered classes remain available when the roster has only one', () async {
    final api = _ClassApi(Future.value({'grades': ['Class 8', 'Class 9']}));
    final container = ProviderContainer(overrides: [teacherApiServiceProvider.overrideWithValue(api)]);
    addTearDown(container.dispose);
    final target = container.listen(teacherTargetClassProvider, (previous, next) {}, fireImmediately: true);
    final options = container.listen(teacherClassOptionsProvider, (previous, next) {});
    expect(await container.read(teacherClassOptionsProvider.future), ['Class 8', 'Class 9']);
    expect(target.read(), 'all');
    expect(api.rosterClassRequests, 0);
    target.close();
    options.close();
  });

  test('a manual selection is not replaced when a delayed profile arrives', () async {
    final profile = Completer<Map<String, dynamic>>();
    final api = _ClassApi(profile.future);
    final container = ProviderContainer(overrides: [teacherApiServiceProvider.overrideWithValue(api)]);
    addTearDown(container.dispose);
    final target = container.listen(teacherTargetClassProvider, (previous, next) {}, fireImmediately: true);
    container.read(teacherTargetClassProvider.notifier).set('all');
    profile.complete({'grades': ['Class 8']});
    await container.read(teacherProfileProvider.future);
    expect(target.read(), 'all');
    target.close();
  });

  for (final (label, screen) in const [
    ('students', TeacherStudentsTab()),
    ('progress', TeacherProgressTab()),
  ]) {
    testWidgets('$label selects the sole registered class after profile loading', (tester) async {
      final profile = Completer<Map<String, dynamic>>();
      final api = _ClassApi(profile.future);
      await tester.pumpWidget(ProviderScope(
        overrides: [teacherApiServiceProvider.overrideWithValue(api)],
        child: MaterialApp(home: Scaffold(body: screen)),
      ));
      await tester.pump();
      expect(api.filters, ['all']);
      profile.complete({'grades': ['Class 9']});
      await tester.pumpAndSettle();
      expect(api.filters.last, 'Class 9');
      expect(find.text('Class 9'), findsWidgets);
    });
  }

  testWidgets('report cards wait for an explicit choice with multiple classes', (tester) async {
    final api = _ClassApi(Future.value({'grades': ['Class 8', 'Class 9']}));
    await tester.pumpWidget(ProviderScope(
      overrides: [teacherApiServiceProvider.overrideWithValue(api)],
      child: const MaterialApp(home: Scaffold(body: TeacherReportCardsTab())),
    ));
    await tester.pumpAndSettle();
    expect(api.examClasses, isEmpty);
    await tester.tap(find.byType(DropdownButtonFormField<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Class 9').last);
    await tester.pumpAndSettle();
    expect(api.examClasses, ['Class 9']);
  });
}
