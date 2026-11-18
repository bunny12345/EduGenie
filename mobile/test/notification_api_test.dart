import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/services/api_client.dart';
import 'package:mobile/services/student_api_service.dart';

void main() {
  test('website fallback cannot look like successful push registration or preview', () async {
    final dio = Dio();
    addTearDown(dio.close);
    dio.interceptors.add(InterceptorsWrapper(onRequest: (options, handler) {
      handler.resolve(Response(
        requestOptions: options,
        statusCode: 200,
        data: '<!doctype html><html></html>',
      ));
    }));
    final api = ApiClient(dio: dio);
    final error = throwsA(isA<Exception>().having(
      (error) => error.toString(),
      'message',
      contains('notification service returned an unexpected response'),
    ));
    await expectLater(StudentApiService(api).getNotificationPreview(), error);
    await expectLater(api.notificationRequest('devices', method: 'POST'), error);
  });
}
