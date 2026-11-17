import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/screens/auth/role_gateway_screen.dart';
import 'package:mobile/services/api_client.dart';
import 'package:mobile/services/auth_service.dart';
import 'package:mobile/state/session_provider.dart';

class _FakeAuth extends AuthService {
  _FakeAuth() : super(ApiClient());

  final requests = <Map<String, dynamic>>[];
  final resets = <Map<String, dynamic>>[];

  @override
  Future<Map<String, dynamic>> requestPasswordResetCode({
    required String role,
    required String loginId,
    required String channel,
    String? email,
    String? country,
    String? phone,
  }) async {
    requests.add({'role': role, 'loginId': loginId, 'channel': channel, 'email': email, 'country': country, 'phone': phone});
    if (channel == 'email') {
      return {
        'success': false,
        'error': 'This email address is not valid for this account. You can verify with your registered mobile number instead.',
      };
    }
    return {'success': true, 'challengeId': 'VEfixture', 'channel': 'phone', 'destination': '+919••••••10', 'resendAfter': 60};
  }

  @override
  Future<Map<String, dynamic>> resetForgottenPassword({
    required String role,
    required String loginId,
    required String challengeId,
    required String code,
    required String newPassword,
    required String confirmPassword,
  }) async {
    resets.add({'role': role, 'loginId': loginId, 'challengeId': challengeId, 'code': code, 'newPassword': newPassword});
    return {'success': true, 'message': 'Your password has been changed. You can now log in with your new password.'};
  }
}

void main() {
  testWidgets('student resets a forgotten password via mobile after an invalid email and returns to login', (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.6;
    addTearDown(tester.view.reset);
    final auth = _FakeAuth();
    await tester.pumpWidget(ProviderScope(
      overrides: [authServiceProvider.overrideWithValue(auth)],
      child: const MaterialApp(home: RoleGatewayScreen()),
    ));

    await tester.enterText(find.widgetWithText(TextField, 'Login ID'), 'stu1');
    await tester.tap(find.text('Forgot password?'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(TextField, 'stu1'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('forgot-email')), 'wrong@example.com');
    await tester.tap(find.text('Send verification code'));
    await tester.pumpAndSettle();
    expect(find.textContaining('verify with your registered mobile number instead'), findsOneWidget);

    await tester.tap(find.text('Verify with mobile number instead'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('forgot-phone')), '9876543210');
    await tester.tap(find.text('Send verification code'));
    await tester.pumpAndSettle();
    expect(auth.requests.last, containsPair('country', 'IN'));
    expect(auth.requests.last, containsPair('phone', '9876543210'));

    await tester.enterText(find.byKey(const Key('forgot-code')), '123456');
    await tester.enterText(find.byKey(const Key('forgot-new-password')), 'NoSpecial1');
    await tester.enterText(find.byKey(const Key('forgot-confirm-password')), 'NoSpecial1');
    await tester.tap(find.text('Change password'));
    await tester.pumpAndSettle();
    expect(find.textContaining('include a letter, a number and a special character'), findsOneWidget);
    expect(auth.resets, isEmpty);

    await tester.enterText(find.byKey(const Key('forgot-new-password')), 'New#Pass1');
    await tester.enterText(find.byKey(const Key('forgot-confirm-password')), 'New#Pass1');
    await tester.tap(find.text('Change password'));
    await tester.pumpAndSettle();

    expect(auth.resets.single, {
      'role': 'student', 'loginId': 'stu1', 'challengeId': 'VEfixture', 'code': '123456', 'newPassword': 'New#Pass1',
    });
    expect(find.text('Student Log In'), findsOneWidget);
    expect(find.textContaining('Your password has been changed'), findsOneWidget);
  });
}
