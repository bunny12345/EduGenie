import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'navigation/role_router.dart';
import 'services/push_notification_service.dart';
import 'state/theme_provider.dart';
import 'state/session_provider.dart';
import 'theme/app_colors.dart';
import 'theme/app_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await PushNotificationService.instance.initialize();
  runApp(const ProviderScope(child: ThemeBootstrap()));
}

class ThemeBootstrap extends ConsumerWidget {
  const ThemeBootstrap({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ref.watch(storedThemePreferencesProvider).when(
      data: (_) => const AcademiXApp(),
      loading: () => const SizedBox.shrink(),
      error: (error, stack) {
        debugPrint('Theme preference restore failed: $error\n$stack');
        return MaterialApp(
          theme: AppTheme.light(),
          home: Scaffold(
            body: SafeArea(
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Text('Could not restore your saved theme. Please try again.'),
                      const SizedBox(height: 12),
                      ElevatedButton(
                        onPressed: () => ref.invalidate(storedThemePreferencesProvider),
                        child: const Text('Retry'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

class AcademiXApp extends ConsumerWidget {
  const AcademiXApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final themeMode = ref.watch(activeThemeModeProvider);
    AppColors.isDark = themeMode == ThemeMode.dark;
    return MaterialApp(
      title: 'AcademiX',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: themeMode,
      builder: (context, child) => SessionActivityMonitor(child: child ?? const SizedBox.shrink()),
      home: const RoleRouter(),
    );
  }
}

class SessionActivityMonitor extends ConsumerStatefulWidget {
  const SessionActivityMonitor({super.key, required this.child});
  final Widget child;

  @override
  ConsumerState<SessionActivityMonitor> createState() => _SessionActivityMonitorState();
}

class _SessionActivityMonitorState extends ConsumerState<SessionActivityMonitor> with WidgetsBindingObserver {
  bool _foreground = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    HardwareKeyboard.instance.addHandler(_onKey);
    SemanticsBinding.instance.addSemanticsActionListener(_onSemanticsAction);
    final lifecycle = WidgetsBinding.instance.lifecycleState;
    _foreground = lifecycle == null || lifecycle == AppLifecycleState.resumed;
  }

  @override
  void dispose() {
    HardwareKeyboard.instance.removeHandler(_onKey);
    SemanticsBinding.instance.removeSemanticsActionListener(_onSemanticsAction);
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _foreground = state == AppLifecycleState.resumed;
    if (_foreground) {
      ref.read(sessionProvider.notifier).checkExpiry();
    } else {
      ref.read(sessionProvider.notifier).flushPendingActivity();
    }
  }

  bool _onKey(KeyEvent event) {
    if (event is KeyDownEvent || event is KeyRepeatEvent) _activity();
    return false;
  }

  void _onSemanticsAction(ui.SemanticsActionEvent event) => _activity();

  void _activity() {
    if (_foreground) ref.read(sessionProvider.notifier).recordActivity();
  }

  @override
  Widget build(BuildContext context) {
    final notice = ref.watch(sessionNoticeProvider);
    return Stack(
      children: [
        Listener(
          behavior: HitTestBehavior.translucent,
          onPointerDown: (_) => _activity(),
          onPointerMove: (event) { if (event.buttons != 0) _activity(); },
          onPointerSignal: (_) => _activity(),
          child: widget.child,
        ),
        if (notice != null)
          Positioned(
            top: 0,
            left: 12,
            right: 12,
            child: SafeArea(
              child: IgnorePointer(
                child: Material(
                  color: const Color(0xFFFFF3CD),
                  borderRadius: BorderRadius.circular(8),
                  elevation: 3,
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Text(notice, style: const TextStyle(color: Color(0xFF663C00))),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
