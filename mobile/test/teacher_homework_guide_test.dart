import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile/screens/teacher/teacher_home_tab.dart';
import 'package:mobile/services/api_client.dart';
import 'package:mobile/services/teacher_api_service.dart';
import 'package:mobile/state/teacher_providers.dart';
import 'package:mobile/theme/app_theme.dart';
import 'package:mobile/widgets/guided_highlight.dart';

class _Class8 extends TeacherTargetClassNotifier {
  @override
  String build() => 'Class 8';
}

class _Api extends TeacherApiService {
  _Api() : super(ApiClient());
  int calls = 0;
  String? error;

  @override
  Future<Map<String, dynamic>> assignHomework({
    required String title,
    required String subject,
    String? note,
    String? gradingGuidance,
    List<String> attachmentUrls = const [],
    String? startAt,
    String? dueAt,
    required String className,
    List<String> lessonIds = const [],
    List<String> lessonTitles = const [],
  }) async {
    calls++;
    if (error != null) throw Exception(error);
    return {'success': true, 'created': 1};
  }
}

Widget _app(_Api api, {bool hasClass = true, bool dark = false, bool reduceMotion = false, List<Map<String, dynamic>> homework = const []}) {
  return ProviderScope(
    overrides: [
      teacherApiServiceProvider.overrideWithValue(api),
      if (hasClass) teacherTargetClassProvider.overrideWith(_Class8.new),
      teacherProfileProvider.overrideWith((ref) async => {'subject': 'Science'}),
      teacherLessonsProvider.overrideWith((ref) async => []),
      teacherHomeworkProvider.overrideWith((ref) async => homework),
      teacherAnnouncementsProvider.overrideWith((ref) async => []),
      teacherTestsProvider.overrideWith((ref) async => []),
    ],
    child: MaterialApp(
      theme: dark ? AppTheme.dark() : AppTheme.light(),
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(disableAnimations: reduceMotion),
        child: child!,
      ),
      home: const Scaffold(body: TeacherHomeTab(activeClassBanner: Text('Class selector'))),
    ),
  );
}

Finder _field(String label) => find.byWidgetPredicate((w) => w is TextField && w.decoration?.labelText == label);

Future<void> _tapVisible(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

Future<void> _openHomework(WidgetTester tester, _Api api, {bool hasClass = true, bool dark = false, bool reduceMotion = false}) async {
  tester.view.physicalSize = const Size(360, 640);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(_app(api, hasClass: hasClass, dark: dark, reduceMotion: reduceMotion));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Homework'));
  await tester.pumpAndSettle();
}

Finder _dateInput(String label) {
  final dateField = find.ancestor(
    of: find.text(label),
    matching: find.byWidgetPredicate((w) => w.runtimeType.toString() == '_DateTimeField'),
  ).first;
  return find.descendant(of: dateField, matching: find.byType(InkWell)).first;
}

Future<void> _chooseDateTime(WidgetTester tester, String label, int hour) async {
  await _tapVisible(tester, _dateInput(label));
  await tester.tap(find.text('OK'));
  await tester.pumpAndSettle();
  final picker = tester.widget<CupertinoDatePicker>(find.byType(CupertinoDatePicker));
  picker.onDateTimeChanged(DateTime(2026, 1, 1, hour));
  await tester.tap(find.text('Done'));
  await tester.pumpAndSettle();
}

Color _guideBorder(WidgetTester tester, Finder field) {
  final guide = find.ancestor(
    of: field,
    matching: find.byType(GuidedHighlight),
  ).first;
  final container = tester.widget<Container>(find.descendant(of: guide, matching: find.byType(Container)).first);
  return ((container.decoration! as BoxDecoration).border! as Border).top.color;
}

void main() {
  setUpAll(() => GoogleFonts.config.allowRuntimeFetching = false);

  for (final accessibleNavigation in [false, true]) {
    testWidgets('guided scrolling jumps immediately with reduced motion ($accessibleNavigation)', (tester) async {
      final target = GlobalKey();
      final scroll = ScrollController();
      addTearDown(scroll.dispose);
      await tester.pumpWidget(MaterialApp(
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(disableAnimations: !accessibleNavigation, accessibleNavigation: accessibleNavigation),
          child: child!,
        ),
        home: Scaffold(body: SingleChildScrollView(
          controller: scroll,
          child: Column(children: [const SizedBox(height: 1800), SizedBox(key: target, height: 40)]),
        )),
      ));
      showGuidedTarget(target);
      await tester.pump();
      expect(scroll.offset, greaterThan(0));
    });
  }

  testWidgets('editing homework directs a missing title back to the field', (tester) async {
    tester.view.physicalSize = const Size(360, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(_app(_Api(), homework: [
      {'id': 'assignment', 'title': 'Worksheet', 'subject': 'Science', 'className': 'Class 8', 'createdAt': DateTime.now().toIso8601String()},
    ]));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Homework'));
    await tester.pumpAndSettle();
    await _tapVisible(tester, find.byTooltip('Edit'));
    final title = find.byWidgetPredicate((w) => w is TextField && w.decoration?.hintText == 'Homework title');
    await tester.enterText(title, '');
    FocusManager.instance.primaryFocus?.unfocus();
    await tester.pumpAndSettle();
    await _tapVisible(tester, find.text('Update & Resend to All Students'));
    expect(title.hitTestable(), findsOneWidget);
    expect(find.text('Enter a homework title.'), findsOneWidget);
    expect(tester.widget<GuidedHighlight>(find.ancestor(of: title, matching: find.byType(GuidedHighlight)).first).active, isTrue);
  });

  for (final dark in [false, true]) {
    testWidgets('guides optional steps without requiring them in ${dark ? 'dark' : 'light'} mode', (tester) async {
      final api = _Api();
      await _openHomework(tester, api, dark: dark);
      expect(find.text('Next: Enter a homework title'), findsOneWidget);
      await tester.enterText(_field('Homework title'), 'Fractions');
      await tester.pumpAndSettle();
      expect(find.text('Next: Add instructions (optional)'), findsOneWidget);
      await tester.enterText(_field('Instructions / question for students'), 'Show your work');
      await tester.pumpAndSettle();
      expect(find.text('Next: Review resources and marking (optional)'), findsOneWidget);
      await _tapVisible(tester, find.text('Skip optional step'));
      expect(find.text('Next: Set a schedule (optional)'), findsOneWidget);
      await _tapVisible(tester, find.text('Skip optional step'));
      expect(find.text('Next: Review and assign'), findsOneWidget);
      FocusManager.instance.primaryFocus?.unfocus();
      await tester.pumpAndSettle();
      await _tapVisible(tester, find.text('✅ Assign to Class 8'));
      expect(api.calls, 1);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('missing class and title scroll to their controls without submitting', (tester) async {
    final api = _Api();
    await _openHomework(tester, api, hasClass: false);
    await _tapVisible(tester, find.text('Select a class first'));
    expect(find.text('Please select a class before assigning homework.').hitTestable(), findsOneWidget);
    expect(find.text('Class selector').hitTestable(), findsOneWidget);
    expect(api.calls, 0);
    await tester.pumpWidget(const SizedBox.shrink());

    await _openHomework(tester, api);
    await _tapVisible(tester, find.text('✅ Assign to Class 8'));
    expect(find.text('Please enter a homework title.').hitTestable(), findsOneWidget);
    expect(_field('Homework title').hitTestable(), findsOneWidget);
    expect(api.calls, 0);
    expect(tester.takeException(), isNull);
  });

  testWidgets('invalid date order scrolls to the due date and permits correction', (tester) async {
    final api = _Api();
    await _openHomework(tester, api);
    await tester.enterText(_field('Homework title'), 'Fractions');
    FocusManager.instance.primaryFocus?.unfocus();
    await tester.pumpAndSettle();
    await _chooseDateTime(tester, 'START DATE & TIME', 10);
    await _chooseDateTime(tester, 'END / DUE DATE & TIME', 9);
    await _tapVisible(tester, find.text('✅ Assign to Class 8'));
    expect(find.text('Due date and time cannot be before the start.').hitTestable(), findsOneWidget);
    expect(find.text('END / DUE DATE & TIME').hitTestable(), findsOneWidget);
    expect(api.calls, 0);
    await _chooseDateTime(tester, 'END / DUE DATE & TIME', 11);
    expect(find.text('Due date and time cannot be before the start.'), findsNothing);
    await _tapVisible(tester, find.text('✅ Assign to Class 8'));
    expect(api.calls, 1);
    expect(tester.takeException(), isNull);
  });

  testWidgets('backend date validation points to the relevant field', (tester) async {
    final api = _Api()..error = 'startAt cannot be in a past day';
    await _openHomework(tester, api);
    await tester.enterText(_field('Homework title'), 'Fractions');
    FocusManager.instance.primaryFocus?.unfocus();
    await tester.pumpAndSettle();
    await _tapVisible(tester, find.text('✅ Assign to Class 8'));
    expect(find.text('Start date cannot be in a past day.').hitTestable(), findsOneWidget);
    expect(find.text('START DATE & TIME').hitTestable(), findsOneWidget);
    expect(api.calls, 1);
    expect(tester.takeException(), isNull);
  });

  testWidgets('class errors point to the class and clear after a successful retry', (tester) async {
    final api = _Api()..error = 'No students found in class "Class 8"';
    await _openHomework(tester, api);
    await tester.enterText(_field('Homework title'), 'Fractions');
    FocusManager.instance.primaryFocus?.unfocus();
    await tester.pumpAndSettle();
    await _tapVisible(tester, find.text('✅ Assign to Class 8'));
    expect(find.text('No students found in class "Class 8"').hitTestable(), findsOneWidget);
    expect(find.text('Class selector').hitTestable(), findsOneWidget);
    api.error = null;
    await _tapVisible(tester, find.text('✅ Assign to Class 8'));
    expect(api.calls, 2);
    expect(find.text('No students found in class "Class 8"'), findsNothing);
    expect(find.text('Next: Enter a homework title'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  for (final reduced in [false, true]) {
    testWidgets('suggested field ${reduced ? 'stays steady with reduced motion' : 'pulses gently'}', (tester) async {
      await _openHomework(tester, _Api(), reduceMotion: reduced);
      await tester.enterText(_field('Homework title'), 'Fractions');
      await tester.pump();
      final instructions = _field('Instructions / question for students');
      await tester.pump(const Duration(milliseconds: 100));
      final first = _guideBorder(tester, instructions);
      await tester.pump(const Duration(milliseconds: 700));
      final second = _guideBorder(tester, instructions);
      expect(first == second, reduced);
      await tester.pump(const Duration(seconds: 5));
      final settled = _guideBorder(tester, instructions);
      await tester.pump(const Duration(seconds: 1));
      expect(_guideBorder(tester, instructions), settled);
      expect(tester.takeException(), isNull);
    });
  }
}
