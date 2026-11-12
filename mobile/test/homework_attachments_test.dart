import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile/config/env.dart';
import 'package:mobile/models/homework_item.dart';
import 'package:mobile/screens/student/homework/homework_screen.dart';
import 'package:mobile/screens/student/homework/lightbox.dart';
import 'package:mobile/screens/teacher/teacher_home_tab.dart';
import 'package:mobile/services/attachment_url.dart';
import 'package:mobile/services/save_attachment_native.dart' as native;
import 'package:mobile/state/student_providers.dart';
import 'package:mobile/state/teacher_providers.dart';
import 'package:mobile/theme/app_theme.dart';

const _urls = ['/uploads/homework/one.png', '/uploads/homework/two.png'];

Finder _thumbnail(int index, double size) => find.byWidgetPredicate(
  (w) => w is Image && w.width == size && w.image is NetworkImage && (w.image as NetworkImage).url == resolveAttachmentUrl(_urls[index]),
);

Future<void> _checkViewer(WidgetTester tester) async {
  expect(find.text('2 / 2'), findsOneWidget);
  expect(find.byTooltip('Download image'), findsOneWidget);
  expect(find.byTooltip('Download all'), findsOneWidget);
  await tester.tap(find.byIcon(Icons.chevron_left_rounded).last);
  await tester.pumpAndSettle();
  expect(find.text('1 / 2'), findsOneWidget);
  await tester.drag(find.byType(PageView), const Offset(-500, 0));
  await tester.pumpAndSettle();
  expect(find.text('2 / 2'), findsOneWidget);
  await tester.tap(find.byTooltip('Close image viewer'));
  await tester.pumpAndSettle();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() => GoogleFonts.config.allowRuntimeFetching = false);

  test('attachment paths resolve consistently without breaking local HTTP', () {
    expect(resolveAttachmentUrl(_urls.first), '${Env.apiBaseUrl}${_urls.first}');
    expect(resolveAttachmentUrl('uploads/homework/one.png'), '${Env.apiBaseUrl}${_urls.first}');
    expect(resolveAttachmentUrl('http://academix.now/uploads/pic.png'), 'https://academix.now/uploads/pic.png');
    expect(resolveAttachmentUrl('http://localhost:3000/pic.png'), 'http://localhost:3000/pic.png');
    expect(resolveAttachmentUrl('https://cdn.example/pic.png?token=abc'), 'https://cdn.example/pic.png?token=abc');
  });

  for (final dark in [false, true]) {
    testWidgets('teacher assignment history opens the selected photo and supports swiping in ${dark ? 'dark' : 'light'} mode', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(430, 1100);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            teacherProfileProvider.overrideWith((ref) async => {'subject': 'Science'}),
            teacherAnnouncementsProvider.overrideWith((ref) async => []),
            teacherLessonsProvider.overrideWith((ref) async => []),
            teacherTestsProvider.overrideWith((ref) async => []),
            teacherHomeworkProvider.overrideWith(
              (ref) async => [
                {
                  'id': 'assignment',
                  'title': 'Plant worksheet',
                  'subject': 'Science',
                  'note': 'Read both images',
                  'startAt': DateTime.now().toIso8601String(),
                  'attachmentUrls': _urls,
                },
              ],
            ),
          ],
          child: MaterialApp(
            theme: dark ? AppTheme.dark() : AppTheme.light(),
            home: const Scaffold(body: TeacherHomeTab(activeClassBanner: SizedBox.shrink())),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.textContaining('Assign Homework'));
      await tester.pumpAndSettle();
      final history = find.text('View History');
      await tester.ensureVisible(history);
      await tester.pumpAndSettle();
      await tester.tap(history);
      await tester.pumpAndSettle();
      expect(find.text('Assigned Homework History'), findsOneWidget);
      final details = find.text('Show details');
      await tester.scrollUntilVisible(details, 200, scrollable: find.byType(Scrollable).last);
      await tester.pumpAndSettle();
      await tester.tap(details);
      await tester.pumpAndSettle();
      await tester.ensureVisible(_thumbnail(1, 56));
      await tester.pumpAndSettle();
      await tester.tap(_thumbnail(1, 56));
      await tester.pumpAndSettle();
      await _checkViewer(tester);
      expect(find.text('Read both images'), findsOneWidget);
      expect(find.text('Assigned Homework History'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    });

    testWidgets(
      'student subject homework history keeps attachment viewing and saved submission previews in ${dark ? 'dark' : 'light'} mode',
      (tester) async {
        tester.view.physicalSize = const Size(430, 1100);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              studentSubjectsProvider.overrideWith((ref) => ['Science']),
              homeworkProvider.overrideWith(
                (ref) async => [
                  HomeworkItem(
                    id: 'hw',
                    title: 'Plant worksheet',
                    subject: 'Science',
                    note: 'Read both images',
                    status: 'submitted',
                    startAt: DateTime.now().toIso8601String(),
                    submittedAt: DateTime.now().toIso8601String(),
                    attachmentUrls: _urls,
                    latestAttachmentUrls: _urls,
                  ),
                ],
              ),
              testsProvider.overrideWith((ref) async => []),
            ],
            child: MaterialApp(theme: dark ? AppTheme.dark() : AppTheme.light(), home: const HomeworkScreen()),
          ),
        );
        await tester.pumpAndSettle();
        await tester.tap(find.text('Open history'));
        await tester.pumpAndSettle();
        expect(find.text('📅 View history by date'), findsOneWidget);
        final instructions = find.text('View instructions');
        await tester.scrollUntilVisible(instructions, 200, scrollable: find.byType(Scrollable).first);
        await tester.pumpAndSettle();
        await tester.tap(instructions);
        await tester.pumpAndSettle();
        await tester.ensureVisible(_thumbnail(1, 64));
        await tester.pumpAndSettle();
        await tester.tap(_thumbnail(1, 64));
        await tester.pumpAndSettle();
        await _checkViewer(tester);
        await tester.ensureVisible(find.text('View submission'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('View submission'));
        await tester.pumpAndSettle();
        await tester.ensureVisible(_thumbnail(1, 64).last);
        await tester.pumpAndSettle();
        await tester.tap(_thumbnail(1, 64).last);
        await tester.pumpAndSettle();
        await _checkViewer(tester);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
      },
    );
  }

  testWidgets('viewer exposes image errors instead of failing silently', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () => showImageLightbox(context, const ['https://invalid.example/photo.png'], 0),
              child: const Text('Open image'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open image'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Unable to display this image'), findsOneWidget);
    await tester.tap(find.byTooltip('Download image'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Saved 0 of 1 images.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  }, skip: kIsWeb);

  test('native download sends original bytes and filename to Photos', () async {
    final calls = <MethodCall>[];
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(const MethodChannel('gal'), (call) async {
      calls.add(call);
      return call.method == 'putImageBytes' ? null : true;
    });
    addTearDown(
      () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(const MethodChannel('gal'), null),
    );
    final bytes = Uint8List.fromList([1, 2, 3]);
    await native.saveAttachment(bytes, 'photo.png', 'image/png');
    final saved = calls.singleWhere((c) => c.method == 'putImageBytes');
    expect(saved.arguments['bytes'], bytes);
    expect(saved.arguments['name'], 'photo.png');
    expect(saved.arguments['album'], 'AcademiX');
  }, skip: kIsWeb);

  test('native download explicitly rejects denied photo access', () async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('gal'),
      (call) async => false,
    );
    addTearDown(
      () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(const MethodChannel('gal'), null),
    );
    await expectLater(native.saveAttachment(Uint8List(1), 'photo.png', 'image/png'), throwsStateError);
  }, skip: kIsWeb);
}
