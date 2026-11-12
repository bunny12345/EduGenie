import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/services/api_client.dart';
import 'package:mobile/services/student_api_service.dart';

void main() {
  test(
    'student service initializes and loads Home data on every platform',
    () async {
      final dio = Dio();
      addTearDown(() => dio.close());
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) => handler.resolve(
            Response(
              requestOptions: options,
              data: {'success': true, 'greetingName': 'Student'},
              statusCode: 200,
            ),
          ),
        ),
      );
      final service = StudentApiService(ApiClient(dio: dio));
      final dashboard = await service.getDashboard('student-a');
      expect(dashboard.greetingName, 'Student');
    },
  );

  test(
    'exam client ID is stable across requests and distinct for new services',
    () async {
      final dio = Dio();
      addTearDown(() => dio.close());
      final requests = <RequestOptions>[];
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            requests.add(options);
            handler.resolve(
              Response(
                requestOptions: options,
                data: {'success': true},
                statusCode: 200,
              ),
            );
          },
        ),
      );
      final client = ApiClient(dio: dio);
      final service = StudentApiService(client);
      await service.startTest('test-a', 'student-a');
      await service.controlExam('attempt-a', action: 'heartbeat');
      await service.submitTestAttempt('attempt-a', 'student-a', {'q': 0});
      final id = (requests.first.data as Map)['clientId'] as String;
      expect(id.length, inInclusiveRange(8, 150));
      expect(id, matches(RegExp(r'^\d+-\d+$')));
      expect(
        requests.map((request) => (request.data as Map)['clientId']),
        everyElement(id),
      );
      final ids = <String>{id};
      for (var index = 0; index < 20; index++) {
        await StudentApiService(client).startTest('test-a', 'student-a');
        ids.add((requests.last.data as Map)['clientId'] as String);
      }
      expect(ids.length, 21);
    },
  );
}
