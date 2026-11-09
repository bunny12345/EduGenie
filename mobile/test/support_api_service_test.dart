import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/services/api_client.dart';
import 'package:mobile/services/support_api_service.dart';

class _Adapter implements HttpClientAdapter {
  final Future<ResponseBody> Function(RequestOptions) respond;
  _Adapter(this.respond);

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) => respond(options);
  @override
  void close({bool force = false}) {}
}

ResponseBody _response(Map<String, dynamic> data, [int status = 200]) =>
    ResponseBody.fromString(
      jsonEncode(data),
      status,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );

Map<String, dynamic> _ticket(String id) => {
  'id': id,
  'subject': 'Website request',
  'category': 'glitch',
  'status': 'open',
};

void main() {
  late Dio dio;
  late SupportApiService service;
  setUp(() {
    dio = Dio(BaseOptions(baseUrl: 'https://academix.now'));
    final client = ApiClient(dio: dio)..authToken = 'test-student-token';
    service = SupportApiService(client);
  });
  tearDown(() => dio.close(force: true));

  test(
    'bot uses canonical endpoint with session token and server suggestions',
    () async {
      dio.httpClientAdapter = _Adapter((options) async {
        expect(options.path, '/support/chat');
        expect(options.method, 'POST');
        expect(options.headers['Authorization'], 'Bearer test-student-token');
        expect(options.data, {
          'message': 'How do I use Sam?',
          'previousQuestions': [],
        });
        return _response({
          'success': true,
          'reply': 'Use the Sam bubble.',
          'suggestions': ['Report an issue'],
          'needsTechnician': false,
        });
      });
      final result = await service.ask('How do I use Sam?');
      expect(result.reply, 'Use the Sam bubble.');
      expect(result.suggestions, ['Report an issue']);
    },
  );

  test(
    'bot sends bounded user-question context using the web contract',
    () async {
      dio.httpClientAdapter = _Adapter((options) async {
        expect(options.data, {
          'message': 'What if I sent the wrong file?',
          'previousQuestions': ['How do I submit homework?'],
        });
        return _response({
          'success': true,
          'reply': 'Check the resubmission window.',
          'suggestions': ['Connect to a technician'],
          'needsTechnician': false,
        });
      });
      await service.ask(
        'What if I sent the wrong file?',
        previousQuestions: ['How do I submit homework?'],
      );
    },
  );

  test(
    'requests use server pagination and thread loads every message page',
    () async {
      final paths = <String>[];
      dio.httpClientAdapter = _Adapter((options) async {
        paths.add(options.path);
        if (options.path.startsWith('/support/tickets?')) {
          return _response({
            'success': true,
            'tickets': [_ticket('shared-id')],
            'nextOffset': 100,
          });
        }
        final second = options.path.endsWith('offset=100');
        return _response({
          'success': true,
          'ticket': _ticket('shared-id'),
          'messages': [
            {
              'author_role': second ? 'owner' : 'student',
              'content': second
                  ? 'Technician reply from website inbox'
                  : 'Question from website',
            },
          ],
          'nextOffset': second ? null : 100,
        });
      });
      final page = await service.list(offset: 50);
      expect(page.tickets.single.subject, 'Website request');
      expect(page.nextOffset, 100);
      final thread = await service.thread('shared-id');
      expect(thread.messages.map((m) => m.content), [
        'Question from website',
        'Technician reply from website inbox',
      ]);
      expect(paths, [
        '/support/tickets?offset=50',
        '/support/tickets/shared-id?offset=0',
        '/support/tickets/shared-id?offset=100',
      ]);
    },
  );

  test(
    'report sends only student history and retry IDs, never client identity',
    () async {
      dio.httpClientAdapter = _Adapter((options) async {
        expect(options.path, '/support/tickets');
        final body = options.data as Map;
        expect(body.keys.toSet(), {
          'id',
          'category',
          'subject',
          'description',
          'recentMessages',
        });
        expect(body['id'], 'retry-id');
        expect(body['category'], 'glitch');
        final history = body['recentMessages'] as List;
        expect(history.length, 12);
        expect(history.first, {'role': 'user', 'content': 'question 2'});
        expect(history.last, {'role': 'user', 'content': 'question 13'});
        return _response({
          'success': true,
          'ticket': _ticket('retry-id'),
          'notificationWarning': 'Email was not delivered.',
        });
      });
      final result = await service.create(
        id: 'retry-id',
        category: 'glitch',
        subject: 'Upload',
        description: 'Upload failed',
        recentMessages: [
          const SupportMessage('owner', 'forged'),
          ...List.generate(14, (i) => SupportMessage('user', 'question $i')),
        ],
      );
      expect(result.notificationWarning, 'Email was not delivered.');
    },
  );

  test('follow-ups and notification retry mirror web contracts', () async {
    dio.httpClientAdapter = _Adapter((options) async {
      if (options.path.endsWith('/messages')) {
        expect(options.data, {'id': 'message-id', 'message': 'Still broken'});
      } else {
        expect(options.path, '/support/tickets/ticket-id/notify');
        expect(options.data, isEmpty);
      }
      return _response({'success': true, 'notificationWarning': null});
    });
    expect(
      await service.reply('ticket-id', 'message-id', 'Still broken'),
      isNull,
    );
    expect(await service.retryNotification('ticket-id'), isNull);
  });

  test(
    'Nest errors and connectivity failures are surfaced explicitly',
    () async {
      dio.httpClientAdapter = _Adapter(
        (options) async => _response({
          'message': 'Your school account could not be verified.',
          'error': 'Forbidden',
        }, 403),
      );
      await expectLater(
        service.list(),
        throwsA(
          isA<SupportApiException>().having(
            (e) => e.message,
            'message',
            'Your school account could not be verified.',
          ),
        ),
      );
      dio.httpClientAdapter = _Adapter((options) async {
        throw DioException(
          requestOptions: options,
          type: DioExceptionType.connectionError,
        );
      });
      await expectLater(
        service.list(),
        throwsA(
          isA<SupportApiException>().having(
            (e) => e.message,
            'message',
            contains('Unable to connect'),
          ),
        ),
      );
    },
  );

  test('retry IDs are unique RFC4122 version 4 UUIDs', () {
    final ids = List.generate(100, (_) => newSupportId());
    expect(ids.toSet().length, 100);
    for (final id in ids) {
      expect(
        id,
        matches(
          RegExp(
            r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
          ),
        ),
      );
    }
  });

  test(
    'resolved expiry uses the resolution timestamp, never ticket creation',
    () {
      SupportTicket ticket(String status, DateTime updatedAt) =>
          SupportTicket.fromJson({
            ..._ticket('retention'),
            'status': status,
            'created_at': '2020-01-01T00:00:00Z',
            'updated_at': updatedAt.toIso8601String(),
          });
      final now = DateTime.now();
      expect(
        ticket('resolved', now.subtract(const Duration(hours: 49))).expired,
        isTrue,
      );
      expect(
        ticket('resolved', now.subtract(const Duration(hours: 47))).expired,
        isFalse,
      );
      expect(
        ticket('open', now.subtract(const Duration(days: 10))).expired,
        isFalse,
      );
    },
  );

  test(
    'deleted thread preserves HTTP status for clearing stale conversations',
    () async {
      dio.httpClientAdapter = _Adapter(
        (options) async =>
            _response({'message': 'Support request not found.'}, 404),
      );
      await expectLater(
        service.thread('deleted'),
        throwsA(
          isA<SupportApiException>().having(
            (error) => error.statusCode,
            'status',
            404,
          ),
        ),
      );
    },
  );
}
