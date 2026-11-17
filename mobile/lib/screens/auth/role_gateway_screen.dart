import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/material.dart';

import '../../models/session.dart';
import '../../state/session_provider.dart';
import '../../theme/app_colors.dart';
import 'forgot_password_screen.dart';

enum _Role { teacher, student }

/// Mobile port of `web/src/components/RoleGateway.jsx` — Teacher and Student
/// only. The School Admin portal is web-only (school admins manage things
/// from a desktop), so that role/registration flow is intentionally absent
/// here. Invite-link acceptance is intentionally out of scope for this first
/// pass (needs mobile deep-linking) — see /memories/repo/mobile-app-plan.md.
class RoleGatewayScreen extends ConsumerStatefulWidget {
  const RoleGatewayScreen({super.key});

  @override
  ConsumerState<RoleGatewayScreen> createState() => _RoleGatewayScreenState();
}

class _RoleGatewayScreenState extends ConsumerState<RoleGatewayScreen> {
  _Role _role = _Role.student;
  bool _busy = false;
  bool _showPassword = false;
  String _error = '';
  String _notice = '';

  final _loginIdCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();

  @override
  void dispose() {
    _loginIdCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  Future<void> _submitTeacher() async {
    setState(() {
      _busy = true;
      _error = '';
      _notice = '';
    });
    try {
      final res = await ref.read(authServiceProvider).teacherLogin(_loginIdCtrl.text.trim(), _passwordCtrl.text);
      if (res['success'] != true || res['token'] == null) {
        setState(() => _error = res['error']?.toString() ?? 'Teacher login failed');
        return;
      }
      final teacher = res['teacher'] as Map? ?? {};
      await ref.read(sessionProvider.notifier).login(Session(
            role: 'teacher',
            token: res['token'].toString(),
            userId: teacher['id']?.toString() ?? '',
            schoolId: teacher['schoolId']?.toString() ?? '',
            name: teacher['name']?.toString() ?? 'Teacher',
            className: teacher['subject']?.toString() ?? 'General',
          ));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submitStudent() async {
    setState(() {
      _busy = true;
      _error = '';
      _notice = '';
    });
    try {
      final res = await ref.read(authServiceProvider).studentLogin(_loginIdCtrl.text.trim(), _passwordCtrl.text);
      if (res['success'] != true || res['token'] == null) {
        setState(() => _error = res['error']?.toString() ?? 'Student login failed');
        return;
      }
      final student = res['student'] as Map? ?? {};
      await ref.read(sessionProvider.notifier).login(Session(
            role: 'student',
            token: res['token'].toString(),
            userId: student['id']?.toString() ?? '',
            name: student['name']?.toString() ?? 'Student',
            className: student['className']?.toString() ?? 'Class',
          ));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _openForgotPassword() async {
    setState(() {
      _error = '';
      _notice = '';
    });
    final result = await Navigator.of(context).push<ForgotPasswordResult>(MaterialPageRoute(
      builder: (_) => ForgotPasswordScreen(
        role: _role == _Role.teacher ? 'teacher' : 'student',
        initialLoginId: _loginIdCtrl.text.trim(),
      ),
    ));
    if (!mounted || result == null) return;
    _loginIdCtrl.text = result.loginId;
    _passwordCtrl.clear();
    setState(() => _notice = result.message);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 32, 20, 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _buildHeader(),
              const SizedBox(height: 24),
              _buildRoleToggle(),
              const SizedBox(height: 20),
              if (_notice.isNotEmpty) _buildNoticeBanner(),
              if (_error.isNotEmpty) _buildErrorBanner(),
              switch (_role) {
                _Role.teacher => _buildSimpleLoginForm(onSubmit: _submitTeacher, label: 'Teacher'),
                _Role.student => _buildSimpleLoginForm(onSubmit: _submitStudent, label: 'Student'),
              },
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                gradient: const LinearGradient(colors: [AppColors.brand, AppColors.brand2]),
                borderRadius: BorderRadius.circular(12),
              ),
              alignment: Alignment.center,
              clipBehavior: Clip.antiAlias,
              child: Image.asset(
                'assets/branding/logo.png',
                fit: BoxFit.contain,
                errorBuilder: (_, _, _) => const Text('EG', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
              ),
            ),
            const SizedBox(width: 12),
            const Text('AcademiX', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
          ],
        ),
        const SizedBox(height: 16),
        const Text('Teacher and Student Access', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
        const SizedBox(height: 6),
        Text(
          'Log in with the ID and password your school gave you.',
          style: TextStyle(color: AppColors.muted, fontSize: 13),
        ),
      ],
    );
  }

  Widget _buildRoleToggle() {
    return SegmentedButton<_Role>(
      segments: const [
        ButtonSegment(value: _Role.student, label: Text('Student')),
        ButtonSegment(value: _Role.teacher, label: Text('Teacher')),
      ],
      selected: {_role},
      onSelectionChanged: (s) => setState(() {
        _role = s.first;
        _error = '';
        _notice = '';
      }),
    );
  }

  Widget _buildErrorBanner() {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.danger.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.danger.withValues(alpha: 0.3)),
      ),
      child: Text(_error, style: const TextStyle(color: AppColors.danger, fontSize: 13)),
    );
  }

  Widget _buildNoticeBanner() {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.ok.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.ok.withValues(alpha: 0.35)),
      ),
      child: Text(_notice, style: const TextStyle(color: Color(0xFF17794A), fontSize: 13, fontWeight: FontWeight.w600)),
    );
  }

  Widget _buildSimpleLoginForm({required Future<void> Function() onSubmit, required String label}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(controller: _loginIdCtrl, decoration: const InputDecoration(labelText: 'Login ID')),
        const SizedBox(height: 10),
        TextField(
          controller: _passwordCtrl,
          obscureText: !_showPassword,
          decoration: InputDecoration(
            labelText: 'Password',
            suffixIcon: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTapDown: (_) => setState(() => _showPassword = true),
              onTapUp: (_) => setState(() => _showPassword = false),
              onTapCancel: () => setState(() => _showPassword = false),
              child: Icon(
                _showPassword ? Icons.visibility_off_rounded : Icons.visibility_rounded,
                size: 20,
                color: AppColors.muted,
              ),
            ),
          ),
        ),
        Align(
          alignment: Alignment.centerRight,
          child: TextButton(
            onPressed: _busy ? null : _openForgotPassword,
            child: const Text('Forgot password?'),
          ),
        ),
        const SizedBox(height: 4),
        ElevatedButton(
          onPressed: _busy ? null : onSubmit,
          child: _busy
              ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : Text('$label Log In'),
        ),
      ],
    );
  }
}
