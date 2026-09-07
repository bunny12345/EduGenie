import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/material.dart';

import '../../models/session.dart';
import '../../state/session_provider.dart';
import '../../theme/app_colors.dart';

enum _Role { school, teacher, student }

/// Mobile port of `web/src/components/RoleGateway.jsx`. Same three roles,
/// same backend endpoints/contracts — native form UI instead of a desktop
/// card layout. Invite-link acceptance is intentionally out of scope for
/// this first pass (needs mobile deep-linking) — see /memories/repo/mobile-app-plan.md.
class RoleGatewayScreen extends ConsumerStatefulWidget {
  const RoleGatewayScreen({super.key});

  @override
  ConsumerState<RoleGatewayScreen> createState() => _RoleGatewayScreenState();
}

class _RoleGatewayScreenState extends ConsumerState<RoleGatewayScreen> {
  _Role _role = _Role.school;
  bool _schoolLoginMode = false;
  bool _busy = false;
  String _error = '';

  // School
  final _schoolNameCtrl = TextEditingController();
  final _branchCtrl = TextEditingController(text: 'Main Branch');
  final _locationCtrl = TextEditingController();
  final _schoolEmailCtrl = TextEditingController();
  final _schoolPasswordCtrl = TextEditingController();
  String _registerStep = 'form'; // 'form' | 'otp'
  final _otpCtrl = TextEditingController();
  String _otpNote = '';

  // Teacher / Student
  final _loginIdCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();

  @override
  void dispose() {
    _schoolNameCtrl.dispose();
    _branchCtrl.dispose();
    _locationCtrl.dispose();
    _schoolEmailCtrl.dispose();
    _schoolPasswordCtrl.dispose();
    _otpCtrl.dispose();
    _loginIdCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  Future<void> _submitSchool() async {
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      final auth = ref.read(authServiceProvider);
      if (_schoolLoginMode) {
        final res = await auth.schoolLogin(_schoolEmailCtrl.text.trim(), _schoolPasswordCtrl.text);
        if (res['success'] != true || res['token'] == null) {
          setState(() => _error = res['error']?.toString() ?? 'School authentication failed');
          return;
        }
        final school = res['school'] as Map? ?? {};
        await ref.read(sessionProvider.notifier).login(Session(
              role: 'school_admin',
              token: res['token'].toString(),
              schoolId: school['id']?.toString() ?? '',
              name: school['schoolName']?.toString() ?? _schoolNameCtrl.text.trim(),
              email: school['email']?.toString() ?? _schoolEmailCtrl.text.trim(),
            ));
        return;
      }

      if (_registerStep == 'form') {
        final res = await auth.schoolRegisterRequestOtp(
          email: _schoolEmailCtrl.text.trim(),
          schoolName: _schoolNameCtrl.text.trim(),
          branch: _branchCtrl.text.trim(),
          location: _locationCtrl.text.trim(),
          password: _schoolPasswordCtrl.text,
        );
        if (res['success'] != true) {
          setState(() => _error = res['error']?.toString() ?? 'Could not send a verification code.');
          return;
        }
        setState(() {
          _otpNote = 'We sent a 6-digit code to ${_schoolEmailCtrl.text.trim()}.';
          _otpCtrl.clear();
          _registerStep = 'otp';
        });
        return;
      }

      final res = await auth.schoolRegisterVerifyOtp(_schoolEmailCtrl.text.trim(), _otpCtrl.text.trim());
      if (res['success'] != true || res['token'] == null) {
        setState(() => _error = res['error']?.toString() ?? 'Verification failed');
        return;
      }
      final school = res['school'] as Map? ?? {};
      await ref.read(sessionProvider.notifier).login(Session(
            role: 'school_admin',
            token: res['token'].toString(),
            schoolId: school['id']?.toString() ?? '',
            name: school['schoolName']?.toString() ?? _schoolNameCtrl.text.trim(),
            email: school['email']?.toString() ?? _schoolEmailCtrl.text.trim(),
          ));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submitTeacher() async {
    setState(() {
      _busy = true;
      _error = '';
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
              if (_error.isNotEmpty) _buildErrorBanner(),
              switch (_role) {
                _Role.school => _buildSchoolForm(),
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
              child: const Text('EG', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
            ),
            const SizedBox(width: 12),
            const Text('AcademiX', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
          ],
        ),
        const SizedBox(height: 16),
        const Text('School, Teacher and Student Access', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
        const SizedBox(height: 6),
        const Text(
          'School admins onboard teachers, teachers onboard students, and invite links support self-registration.',
          style: TextStyle(color: AppColors.muted, fontSize: 13),
        ),
      ],
    );
  }

  Widget _buildRoleToggle() {
    return SegmentedButton<_Role>(
      segments: const [
        ButtonSegment(value: _Role.school, label: Text('School')),
        ButtonSegment(value: _Role.teacher, label: Text('Teacher')),
        ButtonSegment(value: _Role.student, label: Text('Student')),
      ],
      selected: {_role},
      onSelectionChanged: (s) => setState(() {
        _role = s.first;
        _error = '';
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

  Widget _buildSchoolForm() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SegmentedButton<bool>(
          segments: const [
            ButtonSegment(value: false, label: Text('Register School')),
            ButtonSegment(value: true, label: Text('School Login')),
          ],
          selected: {_schoolLoginMode},
          onSelectionChanged: (s) => setState(() {
            _schoolLoginMode = s.first;
            _registerStep = 'form';
            _error = '';
            _otpNote = '';
          }),
        ),
        const SizedBox(height: 16),
        if (!_schoolLoginMode && _registerStep == 'form') ...[
          TextField(controller: _schoolNameCtrl, decoration: const InputDecoration(labelText: 'School name')),
          const SizedBox(height: 10),
          TextField(controller: _branchCtrl, decoration: const InputDecoration(labelText: 'Branch')),
          const SizedBox(height: 10),
          TextField(controller: _locationCtrl, decoration: const InputDecoration(labelText: 'Location')),
          const SizedBox(height: 10),
        ],
        if (!_schoolLoginMode && _registerStep == 'otp') ...[
          Text(_otpNote, style: const TextStyle(color: AppColors.muted, fontSize: 13)),
          const SizedBox(height: 10),
          TextField(
            controller: _otpCtrl,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: '6-digit code'),
          ),
          const SizedBox(height: 10),
        ],
        if (_schoolLoginMode || _registerStep == 'form') ...[
          TextField(
            controller: _schoolEmailCtrl,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(labelText: 'Email'),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _schoolPasswordCtrl,
            obscureText: true,
            decoration: const InputDecoration(labelText: 'Password'),
          ),
          const SizedBox(height: 16),
        ],
        ElevatedButton(
          onPressed: _busy ? null : _submitSchool,
          child: _busy
              ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : Text(_schoolLoginMode
                  ? 'Log In'
                  : (_registerStep == 'form' ? 'Send Verification Code' : 'Verify & Create Account')),
        ),
      ],
    );
  }

  Widget _buildSimpleLoginForm({required Future<void> Function() onSubmit, required String label}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(controller: _loginIdCtrl, decoration: const InputDecoration(labelText: 'Login ID')),
        const SizedBox(height: 10),
        TextField(controller: _passwordCtrl, obscureText: true, decoration: const InputDecoration(labelText: 'Password')),
        const SizedBox(height: 16),
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
