import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/models/session.dart';
import 'package:mobile/screens/student/student_services_screen.dart';
import 'package:mobile/screens/student/student_support_screen.dart';
import 'package:mobile/services/api_client.dart';
import 'package:mobile/services/support_api_service.dart';
import 'package:mobile/state/session_provider.dart';

const _id = '11111111-1111-4111-8111-111111111111';
Map<String, dynamic> _ticketJson = {
  'id': _id,
  'subject': 'Upload problem',
  'category': 'glitch',
  'status': 'open',
};

class _Session extends SessionNotifier {
  @override
  Future<Session?> build() async => null;
}

class _SupportStub extends SupportApiService {
  _SupportStub() : super(ApiClient());
  final reportIds = <String>[];
  final replyIds = <String>[];
  String? lastQuestion;
  bool failReport = false;
  bool failReply = false;
  bool saved = false;
  bool ownerReplied = false;
  bool failList = false;
  Completer<SupportBotReply>? pendingBot;

  @override
  Future<SupportBotReply> ask(
    String message, {
    CancelToken? cancelToken,
  }) async {
    lastQuestion = message;
    if (pendingBot != null) return pendingBot!.future;
    return SupportBotReply.fromJson({
      'reply': 'Use Sam on Home for quick questions.',
      'suggestions': ['Report an issue', 'Connect to a technician'],
      'needsTechnician': true,
    });
  }

  @override
  Future<SupportTicketPage> list({
    int offset = 0,
    CancelToken? cancelToken,
  }) async {
    if (failList) throw const SupportApiException('Support is unavailable.');
    return SupportTicketPage.fromJson({
      'tickets': saved ? [_ticketJson] : [],
      'nextOffset': null,
    });
  }

  @override
  Future<SupportThread> thread(String id, {CancelToken? cancelToken}) async =>
      SupportThread(SupportTicket.fromJson(_ticketJson), [
        const SupportMessage('student', 'Question submitted on website'),
        if (ownerReplied)
          const SupportMessage('owner', 'Please try uploading again.'),
      ]);

  @override
  Future<SupportSubmission> create({
    required String id,
    required String category,
    required String subject,
    required String description,
    required List<SupportMessage> recentMessages,
    CancelToken? cancelToken,
  }) async {
    reportIds.add(id);
    expect(category, 'glitch');
    expect(subject, 'Upload problem');
    expect(description, 'Upload button does not respond');
    if (failReport) {
      throw const SupportApiException('Could not save your request.');
    }
    saved = true;
    return SupportSubmission.fromJson({
      'ticket': _ticketJson,
      'notificationWarning': 'Email was not delivered. Your request is saved.',
    });
  }

  @override
  Future<String?> reply(
    String ticketId,
    String messageId,
    String message, {
    CancelToken? cancelToken,
  }) async {
    replyIds.add(messageId);
    if (failReply) throw const SupportApiException('Could not send message.');
    return null;
  }

  @override
  Future<String?> retryNotification(
    String id, {
    CancelToken? cancelToken,
  }) async => null;
}

Future<void> _mount(
  WidgetTester tester,
  _SupportStub api, {
  double scale = 1,
  bool services = false,
}) async {
  tester.view.physicalSize = const Size(390, 844);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        supportApiServiceProvider.overrideWithValue(api),
        sessionProvider.overrideWith(_Session.new),
      ],
      child: MaterialApp(
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: TextScaler.linear(scale)),
          child: child!,
        ),
        home: services
            ? const StudentServicesScreen()
            : const StudentSupportScreen(),
      ),
    ),
  );
  await tester.pump();
}

Future<void> _tap(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder.first);
  await tester.pumpAndSettle();
  await tester.tap(finder.first);
  await tester.pumpAndSettle();
}

Future<void> _dispose(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox.shrink());
  await tester.pump();
}

void main() {
  for (final scale in [1.0, 1.5]) {
    testWidgets(
      'bot and escalation work without overflow at text scale $scale',
      (tester) async {
        final api = _SupportStub();
        await _mount(tester, api, scale: scale);
        await _tap(tester, find.text('How do I use Sam?'));
        expect(api.lastQuestion, 'How do I use Sam?');
        expect(
          find.text('Use Sam on Home for quick questions.'),
          findsOneWidget,
        );
        expect(
          find.text('Still need help? Use Connect to a technician above.'),
          findsOneWidget,
        );
        expect(tester.takeException(), isNull);
        await _tap(tester, find.text('Report an issue'));
        expect(
          find.widgetWithText(TextFormField, 'Short title'),
          findsOneWidget,
        );
        expect(find.text('Loading...'), findsNothing);
        await _dispose(tester);
      },
    );
  }

  testWidgets('report retries reuse ID, save chat and expose email retry', (
    tester,
  ) async {
    final api = _SupportStub()..failReport = true;
    await _mount(tester, api);
    await _tap(tester, find.text('Report an issue'));
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Short title'),
      'Upload problem',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'What happened?'),
      'Upload button does not respond',
    );
    await _tap(tester, find.text('Send to technician'));
    expect(find.text('Could not save your request.'), findsOneWidget);
    api.failReport = false;
    await _tap(tester, find.text('Send to technician'));
    expect(api.reportIds.length, 2);
    expect(api.reportIds[0], api.reportIds[1]);
    expect(
      find.text('Email was not delivered. Your request is saved.'),
      findsOneWidget,
    );
    await _tap(tester, find.text('Retry email notification'));
    expect(
      find.text('Email was not delivered. Your request is saved.'),
      findsNothing,
    );
    expect(find.text('Question submitted on website'), findsOneWidget);
    await _dispose(tester);
  });

  testWidgets(
    'website ticket and owner replies sync on polling and app resume',
    (tester) async {
      final api = _SupportStub()..saved = true;
      await _mount(tester, api);
      await _tap(tester, find.text('Upload problem'));
      expect(find.text('Question submitted on website'), findsOneWidget);
      api.ownerReplied = true;
      await tester.pump(const Duration(seconds: 10));
      await tester.pump();
      expect(find.text('Please try uploading again.'), findsOneWidget);
      expect(find.text('Technician'), findsOneWidget);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      api.ownerReplied = false;
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pump();
      expect(find.text('Please try uploading again.'), findsNothing);
      await _dispose(tester);
    },
  );

  testWidgets(
    'tapping the selected ticket closes it and polling does not reopen it',
    (tester) async {
      final api = _SupportStub()..saved = true;
      await _mount(tester, api);
      final ticket = find.widgetWithText(ListTile, 'Upload problem');
      await _tap(tester, ticket);
      expect(find.text('Question submitted on website'), findsOneWidget);
      expect(tester.widget<ListTile>(ticket).selected, isTrue);
      await _tap(tester, ticket);
      expect(find.text('Question submitted on website'), findsNothing);
      expect(tester.widget<ListTile>(ticket).selected, isFalse);
      expect(find.text('How do I use Sam?'), findsOneWidget);
      await tester.pump(const Duration(seconds: 15));
      await tester.pump();
      expect(find.text('Question submitted on website'), findsNothing);
      await _tap(tester, ticket);
      expect(find.text('Question submitted on website'), findsOneWidget);
      expect(tester.widget<ListTile>(ticket).selected, isTrue);
      await _dispose(tester);
    },
  );

  testWidgets('message retry keeps draft and reuses message ID', (
    tester,
  ) async {
    final api = _SupportStub()
      ..saved = true
      ..failReply = true;
    await _mount(tester, api);
    await _tap(tester, find.text('Upload problem'));
    final composer = find.widgetWithText(TextField, 'Message');
    await tester.enterText(composer, 'Still broken');
    await _tap(tester, find.text('Send'));
    expect(find.text('Could not send message.'), findsOneWidget);
    expect(tester.widget<TextField>(composer).controller!.text, 'Still broken');
    api.failReply = false;
    await _tap(tester, find.text('Send'));
    expect(api.replyIds.length, 2);
    expect(api.replyIds[0], api.replyIds[1]);
    expect(tester.widget<TextField>(composer).controller!.text, isEmpty);
    await _dispose(tester);
  });

  testWidgets('list errors stay visible', (tester) async {
    await _mount(tester, _SupportStub()..failList = true);
    expect(find.text('Support is unavailable.'), findsOneWidget);
    await _dispose(tester);
  });

  testWidgets('late bot replies cannot replace an open report', (tester) async {
    final api = _SupportStub()..pendingBot = Completer<SupportBotReply>();
    await _mount(tester, api);
    await tester.ensureVisible(find.text('How do I use Sam?'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('How do I use Sam?'));
    await tester.pump(const Duration(milliseconds: 100));
    await tester.drag(find.byType(ListView), const Offset(0, 1500));
    await tester.pump(const Duration(seconds: 1));
    await tester.tap(find.text('Report an issue').first);
    await tester.pump(const Duration(milliseconds: 100));
    api.pendingBot!.complete(
      SupportBotReply.fromJson({
        'reply': 'Late response',
        'suggestions': [],
        'needsTechnician': false,
      }),
    );
    await tester.pumpAndSettle();
    expect(find.widgetWithText(TextFormField, 'Short title'), findsOneWidget);
    expect(find.text('Late response'), findsNothing);
    await _dispose(tester);
  });

  testWidgets(
    'closing support clears bot chat but retains saved shared requests',
    (tester) async {
      final api = _SupportStub()..saved = true;
      await _mount(tester, api);
      await _tap(tester, find.text('How do I use Sam?'));
      expect(find.text('Use Sam on Home for quick questions.'), findsOneWidget);
      await _dispose(tester);
      await _mount(tester, api);
      expect(find.text('Use Sam on Home for quick questions.'), findsNothing);
      expect(find.text('Upload problem'), findsOneWidget);
      await _dispose(tester);
    },
  );

  testWidgets(
    'Services Technical Query opens support, other previews are retained',
    (tester) async {
      await _mount(tester, _SupportStub(), services: true);
      await _tap(tester, find.text('Technical Query'));
      expect(find.byType(StudentSupportScreen), findsOneWidget);
      expect(find.text('Report an issue'), findsOneWidget);
      await _dispose(tester);
    },
  );
}
