import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/services/api_client.dart';
import 'package:mobile/services/teacher_api_service.dart';

class _PendingAdapter implements HttpClientAdapter {
  final requests = <RequestOptions>[];
  final responses = <Completer<ResponseBody>>[];
  Completer<void>? _nextRequest;

  Future<void> waitForRequests(int count) async {
    while (requests.length < count) {
      _nextRequest = Completer<void>();
      await _nextRequest!.future.timeout(const Duration(seconds: 5));
    }
  }

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) {
    requests.add(options);
    final response = Completer<ResponseBody>();
    responses.add(response);
    _nextRequest?.complete();
    _nextRequest = null;
    return response.future;
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _response(Map<String, dynamic> body, [int status = 200]) =>
    ResponseBody.fromString(
      jsonEncode(body),
      status,
      headers: {Headers.contentTypeHeader: ['application/json']},
    );

void main() {
  late Dio dio;
  late ApiClient client;
  late TeacherApiService service;
  late _PendingAdapter adapter;

  setUp(() {
    dio = Dio(BaseOptions(baseUrl: 'https://example.test'));
    adapter = _PendingAdapter();
    dio.httpClientAdapter = adapter;
    client = ApiClient(dio: dio)..authToken = 'teacher-a';
    service = TeacherApiService(client);
  });
  tearDown(() => dio.close(force: true));

  test('simultaneous roster and class requests share only the in-flight response', () async {
    final first = service.getStudents();
    final second = service.getStudents(className: 'all');
    final classes = service.getClassOptions();
    await adapter.waitForRequests(1);
    expect(adapter.requests, hasLength(1));
    adapter.responses.single.complete(_response({
      'success': true,
      'students': [
        {'id': 'student', 'name': 'Student', 'className': 'Class 8'},
      ],
    }));
    expect(await first, await second);
    expect(await classes, ['Class 8']);

    final fresh = service.getStudents();
    await adapter.waitForRequests(2);
    expect(adapter.requests, hasLength(2));
    adapter.responses.last.complete(_response({'success': true, 'students': []}));
    expect(await fresh, isEmpty);
  });

  test('different filters and accounts never share a pending roster', () async {
    final first = service.getStudents(className: 'Class 8');
    await adapter.waitForRequests(1);
    final otherClass = service.getStudents(className: 'Class 9');
    final otherSearch = service.getStudents(search: 'Asha', className: 'Class 8');
    await adapter.waitForRequests(3);
    client.authToken = 'teacher-b';
    final otherTeacher = service.getStudents(className: 'Class 8');
    await adapter.waitForRequests(4);
    expect(adapter.requests, hasLength(4));
    expect(adapter.requests.first.headers['Authorization'], 'Bearer teacher-a');
    expect(adapter.requests.last.headers['Authorization'], 'Bearer teacher-b');
    for (final response in adapter.responses) {
      response.complete(_response({'success': true, 'students': []}));
    }
    await Future.wait([first, otherClass, otherSearch, otherTeacher]);
  });

  test('a shared failure reaches both callers and the next request can retry', () async {
    final first = expectLater(service.getStudents(), throwsException);
    final second = expectLater(service.getStudents(), throwsException);
    await adapter.waitForRequests(1);
    expect(adapter.requests, hasLength(1));
    adapter.responses.single.complete(_response({'error': 'Unavailable'}, 500));
    await Future.wait([first, second]);

    final retry = service.getStudents();
    await adapter.waitForRequests(2);
    expect(adapter.requests, hasLength(2));
    adapter.responses.last.complete(_response({'success': true, 'students': []}));
    expect(await retry, isEmpty);
  });
}
