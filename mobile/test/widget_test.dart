// Basic smoke test — verifies the app boots to the role gateway (login
// screen) since no session is persisted in a fresh test environment.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile/main.dart';
import 'package:mobile/services/secure_storage_service.dart';
import 'package:mobile/state/session_provider.dart';

// flutter_secure_storage's platform channel has no handler in the plain VM
// test environment and hangs rather than throwing — stub it out so the
// session provider resolves immediately instead of timing out pumpAndSettle.
class _FakeSecureStorageService extends SecureStorageService {
  @override
  Future<String?> readSessionJson() async => null;
}

void main() {
  testWidgets('App boots to the role gateway when signed out', (WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [secureStorageServiceProvider.overrideWithValue(_FakeSecureStorageService())],
        child: const AcademiXApp(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('AcademiX'), findsOneWidget);
    expect(find.text('School'), findsWidgets);
  });
}

