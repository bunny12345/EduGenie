import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/session_provider.dart';
import '../../theme/app_colors.dart';
import '../../widgets/guided_highlight.dart';

/// Returned to the login screen after a successful reset.
class ForgotPasswordResult {
  const ForgotPasswordResult(this.loginId, this.message);
  final String loginId;
  final String message;
}

/// Same rules the backend enforces (`passwordPolicyError`) and web shows
/// (`PASSWORD_RULES` in ForgotPasswordPanel.jsx).
final passwordRules = <(String, bool Function(String))>[
  ('At least 8 characters', (v) => v.length >= 8 && v.length <= 128),
  ('A letter (a–z)', (v) => RegExp(r'[A-Za-z]').hasMatch(v)),
  ('A number (0–9)', (v) => RegExp(r'\d').hasMatch(v)),
  ('A special character (e.g. ! @ # \$)', (v) => RegExp(r'[^A-Za-z0-9\s]').hasMatch(v)),
];

const _countries = <(String, String, String)>[
  ('IN', 'India', '91'),
  ('AE', 'United Arab Emirates', '971'),
  ('AU', 'Australia', '61'),
  ('BD', 'Bangladesh', '880'),
  ('BH', 'Bahrain', '973'),
  ('CA', 'Canada', '1'),
  ('DE', 'Germany', '49'),
  ('FR', 'France', '33'),
  ('GB', 'United Kingdom', '44'),
  ('ID', 'Indonesia', '62'),
  ('IE', 'Ireland', '353'),
  ('JP', 'Japan', '81'),
  ('KE', 'Kenya', '254'),
  ('KW', 'Kuwait', '965'),
  ('LK', 'Sri Lanka', '94'),
  ('MY', 'Malaysia', '60'),
  ('NG', 'Nigeria', '234'),
  ('NP', 'Nepal', '977'),
  ('NZ', 'New Zealand', '64'),
  ('OM', 'Oman', '968'),
  ('PH', 'Philippines', '63'),
  ('PK', 'Pakistan', '92'),
  ('QA', 'Qatar', '974'),
  ('SA', 'Saudi Arabia', '966'),
  ('SG', 'Singapore', '65'),
  ('US', 'United States', '1'),
  ('ZA', 'South Africa', '27'),
];

/// Mobile port of `web/src/components/ForgotPasswordPanel.jsx`.
class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key, required this.role, this.initialLoginId = ''});

  /// `teacher` or `student`.
  final String role;
  final String initialLoginId;

  @override
  ConsumerState<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  late final _loginIdCtrl = TextEditingController(text: widget.initialLoginId);
  final _emailCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _codeCtrl = TextEditingController();
  final _newCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();

  bool _resetStep = false;
  String _channel = 'email';
  String _country = 'IN';
  Map<String, dynamic>? _challenge;
  bool _busy = false;
  bool _showNew = false;
  bool _showConfirm = false;
  String _error = '';
  String? _validationTarget;
  final _loginKey = GlobalKey();
  final _contactKey = GlobalKey();
  final _codeKey = GlobalKey();
  final _newPasswordKey = GlobalKey();
  final _confirmPasswordKey = GlobalKey();
  int _guidePulse = 0;
  int _resendIn = 0;
  Timer? _timer;

  String get _label => widget.role == 'teacher' ? 'Teacher' : 'Student';
  bool get _rulesMet => passwordRules.every((rule) => rule.$2(_newCtrl.text));
  bool get _suggestsOther =>
      _error.isNotEmpty &&
      !_resetStep &&
      !RegExp('contact your school admin', caseSensitive: false).hasMatch(_error) &&
      RegExp(_channel == 'email' ? 'mobile number' : 'email', caseSensitive: false).hasMatch(_error);

  @override
  void dispose() {
    _timer?.cancel();
    for (final c in [_loginIdCtrl, _emailCtrl, _phoneCtrl, _codeCtrl, _newCtrl, _confirmCtrl]) {
      c.dispose();
    }
    super.dispose();
  }

  void _startCountdown(int seconds) {
    _timer?.cancel();
    setState(() => _resendIn = seconds);
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted || _resendIn <= 1) {
        timer.cancel();
        if (mounted) setState(() => _resendIn = 0);
        return;
      }

      setState(() => _resendIn -= 1);
    });
  }

  void _showValidation(String error, String field, GlobalKey key) {
    setState(() {
      _error = error;
      _validationTarget = field;
      _guidePulse++;
    });
    showGuidedTarget(key);
  }

  void _fieldChanged() {
    setState(() {
      if (_validationTarget != null) {
        _validationTarget = null;
        _error = '';
      }
    });
  }

  Future<void> _sendCode() async {
    final loginId = _loginIdCtrl.text.trim();
    if (loginId.isEmpty) return _showValidation('Enter your ${_label.toLowerCase()} login ID.', 'login', _loginKey);
    if (_channel == 'email' && !RegExp(r'^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$').hasMatch(_emailCtrl.text.trim())) {
      return _showValidation('Enter a valid email address, or verify with your registered mobile number instead.', 'contact', _contactKey);
    }
    if (_channel == 'phone' && !RegExp(r'^[0-9 ()+-]{4,20}$').hasMatch(_phoneCtrl.text.trim())) {
      return _showValidation('Enter a valid mobile number.', 'contact', _contactKey);
    }
    setState(() {
      _busy = true;
      _error = '';
      _validationTarget = null;
    });
    try {
      final res = await ref.read(authServiceProvider).requestPasswordResetCode(
            role: widget.role,
            loginId: loginId,
            channel: _channel,
            email: _emailCtrl.text.trim(),
            country: _country,
            phone: _phoneCtrl.text.trim(),
          );
      if (!mounted) return;
      if (res['success'] != true) {
        setState(() => _error = res['error']?.toString() ?? 'Could not send the verification code.');
        return;
      }
      _codeCtrl.clear();
      setState(() {
        _challenge = res;
        _resetStep = true;
      });
      _startCountdown(int.tryParse('${res['resendAfter']}') ?? 60);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _reset() async {
    if (!RegExp(r'^\d{6}$').hasMatch(_codeCtrl.text.trim())) {
      return _showValidation('Enter the six-digit verification code.', 'code', _codeKey);
    }
    if (!_rulesMet) {
      return _showValidation('Password must be at least 8 characters and include a letter, a number and a special character.', 'new', _newPasswordKey);
    }
    if (_newCtrl.text != _confirmCtrl.text) {
      return _showValidation('The new password and confirmation do not match.', 'confirm', _confirmPasswordKey);
    }
    setState(() {
      _busy = true;
      _error = '';
      _validationTarget = null;
    });
    try {
      final loginId = _loginIdCtrl.text.trim();
      final res = await ref.read(authServiceProvider).resetForgottenPassword(
            role: widget.role,
            loginId: loginId,
            challengeId: _challenge?['challengeId']?.toString() ?? '',
            code: _codeCtrl.text.trim(),
            newPassword: _newCtrl.text,
            confirmPassword: _confirmCtrl.text,
          );
      if (!mounted) return;
      if (res['success'] != true) {
        setState(() => _error = res['error']?.toString() ?? 'Could not reset the password.');
        return;
      }
      Navigator.of(context).pop(ForgotPasswordResult(
        loginId,
        res['message']?.toString() ?? 'Your password has been changed. Please log in with your new password.',
      ));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_resetStep ? 'Set a new password' : 'Forgot password')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: _resetStep ? _buildResetStep() : _buildRequestStep(),
          ),
        ),
      ),
    );
  }

  List<Widget> _buildRequestStep() {
    return [
      Text(
        'Verify the email address or mobile number registered on your ${_label.toLowerCase()} account to set a new password.',
        style: TextStyle(color: AppColors.muted, fontSize: 13),
      ),
      const SizedBox(height: 16),
      GuidedHighlight(
        key: _loginKey,
        active: !_busy && (_validationTarget == 'login' || (_validationTarget == null && _loginIdCtrl.text.trim().isEmpty)),
        pulseVersion: _guidePulse,
        child: TextField(
          key: const Key('forgot-login-id'),
          controller: _loginIdCtrl,
          onChanged: (_) => _fieldChanged(),
          decoration: InputDecoration(labelText: '$_label Login ID', errorText: _validationTarget == 'login' ? _error : null),
        ),
      ),
      const SizedBox(height: 14),
      SegmentedButton<String>(
        segments: const [
          ButtonSegment(value: 'email', label: Text('Email')),
          ButtonSegment(value: 'phone', label: Text('Mobile number')),
        ],
        selected: {_channel},
        onSelectionChanged: (s) => setState(() {
          _channel = s.first;
          _error = '';
          _validationTarget = null;
        }),
      ),
      const SizedBox(height: 14),
      if (_channel == 'email')
        GuidedHighlight(
          key: _contactKey,
          active: !_busy && (_validationTarget == 'contact' || (_validationTarget == null && _loginIdCtrl.text.trim().isNotEmpty && _emailCtrl.text.trim().isEmpty)),
          pulseVersion: _guidePulse,
          child: TextField(
            key: const Key('forgot-email'),
            controller: _emailCtrl,
            onChanged: (_) => _fieldChanged(),
            keyboardType: TextInputType.emailAddress,
            decoration: InputDecoration(labelText: 'Registered email', errorText: _validationTarget == 'contact' ? _error : null, errorMaxLines: 3),
          ),
        )
      else
        Row(
          children: [
            SizedBox(
              width: 132,
              child: DropdownButtonFormField<String>(
                key: const Key('forgot-country'),
                initialValue: _country,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Country'),
                items: [
                  for (final (iso, name, dial) in _countries)
                    DropdownMenuItem(value: iso, child: Text('$iso +$dial', overflow: TextOverflow.ellipsis, semanticsLabel: name)),
                ],
                onChanged: (value) => setState(() => _country = value ?? 'IN'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: GuidedHighlight(
                key: _contactKey,
                active: !_busy && (_validationTarget == 'contact' || (_validationTarget == null && _loginIdCtrl.text.trim().isNotEmpty && _phoneCtrl.text.trim().isEmpty)),
                pulseVersion: _guidePulse,
                child: TextField(
                  key: const Key('forgot-phone'),
                  controller: _phoneCtrl,
                  onChanged: (_) => _fieldChanged(),
                  keyboardType: TextInputType.phone,
                  decoration: InputDecoration(labelText: 'Registered mobile number', errorText: _validationTarget == 'contact' ? _error : null, errorMaxLines: 3),
                ),
              ),
            ),
          ],
        ),
      const SizedBox(height: 14),
      if (_error.isNotEmpty && _validationTarget == null) _errorBanner(),
      if (_suggestsOther)
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton(
            onPressed: () => setState(() {
              _channel = _channel == 'email' ? 'phone' : 'email';
              _error = '';
              _validationTarget = null;
            }),
            child: Text('Verify with ${_channel == 'email' ? 'mobile number' : 'email'} instead'),
          ),
        ),
      const SizedBox(height: 4),
      ElevatedButton(
        onPressed: _busy ? null : _sendCode,
        child: _busy ? _spinner() : const Text('Send verification code'),
      ),
    ];
  }

  List<Widget> _buildResetStep() {
    final destination = _challenge?['destination']?.toString() ?? '';
    final viaPhone = _challenge?['channel'] == 'phone';
    final mismatch = _confirmCtrl.text.isNotEmpty && _confirmCtrl.text != _newCtrl.text;
    return [
      Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.brand.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Text(
          'We sent a 6-digit code to ${viaPhone ? 'your mobile number' : 'your email'} $destination. It expires in 10 minutes.',
          style: const TextStyle(fontSize: 13),
        ),
      ),
      const SizedBox(height: 14),
      GuidedHighlight(
        key: _codeKey,
        active: !_busy && (_validationTarget == 'code' || (_validationTarget == null && _codeCtrl.text.length != 6)),
        pulseVersion: _guidePulse,
        child: TextField(
          key: const Key('forgot-code'),
          controller: _codeCtrl,
          onChanged: (_) => _fieldChanged(),
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
          autofillHints: const [AutofillHints.oneTimeCode],
          decoration: InputDecoration(labelText: 'Verification code', errorText: _validationTarget == 'code' ? _error : null),
        ),
      ),
      const SizedBox(height: 10),
      GuidedHighlight(
        key: _newPasswordKey,
        active: !_busy && (_validationTarget == 'new' || (_validationTarget == null && _codeCtrl.text.length == 6 && !_rulesMet)),
        pulseVersion: _guidePulse,
        child: _passwordField(const Key('forgot-new-password'), _newCtrl, 'New password', _showNew, (v) => setState(() => _showNew = v), errorText: _validationTarget == 'new' ? _error : null),
      ),
      const SizedBox(height: 8),
      for (final (label, test) in passwordRules)
        _ruleRow(label, test(_newCtrl.text)),
      _ruleRow('Must be different from your current password', null),
      const SizedBox(height: 10),
      GuidedHighlight(
        key: _confirmPasswordKey,
        active: !_busy && (_validationTarget == 'confirm' || (_validationTarget == null && _codeCtrl.text.length == 6 && _rulesMet && _confirmCtrl.text != _newCtrl.text)),
        pulseVersion: _guidePulse,
        child: _passwordField(const Key('forgot-confirm-password'), _confirmCtrl, 'Confirm new password', _showConfirm,
            (v) => setState(() => _showConfirm = v), errorText: _validationTarget == 'confirm' ? _error : null),
      ),
      if (mismatch)
        const Padding(
          padding: EdgeInsets.only(top: 6),
          child: Text('Passwords do not match.', style: TextStyle(color: AppColors.danger, fontSize: 12)),
        ),
      const SizedBox(height: 14),
      if (_error.isNotEmpty && _validationTarget == null) _errorBanner(),
      ElevatedButton(
        onPressed: _busy ? null : _reset,
        child: _busy ? _spinner() : const Text('Change password'),
      ),
      const SizedBox(height: 6),
      Wrap(
        alignment: WrapAlignment.spaceBetween,
        children: [
          TextButton(
            onPressed: _busy || _resendIn > 0 ? null : _sendCode,
            child: Text(_resendIn > 0 ? 'Resend code in ${_resendIn}s' : 'Resend code'),
          ),
          TextButton(
            onPressed: _busy
                ? null
                : () => setState(() {
                      _resetStep = false;
                      _error = '';
                      _validationTarget = null;
                    }),
            child: const Text('Use a different email or mobile'),
          ),
        ],
      ),
    ];
  }

  Widget _passwordField(Key key, TextEditingController ctrl, String label, bool visible, ValueChanged<bool> setVisible, {String? errorText}) {
    return TextField(
      key: key,
      controller: ctrl,
      obscureText: !visible,
      onChanged: (_) => _fieldChanged(),
      decoration: InputDecoration(
        labelText: label,
        errorText: errorText,
        errorMaxLines: 3,
        suffixIcon: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTapDown: (_) => setVisible(true),
          onTapUp: (_) => setVisible(false),
          onTapCancel: () => setVisible(false),
          child: Icon(visible ? Icons.visibility_off_rounded : Icons.visibility_rounded, size: 20, color: AppColors.muted),
        ),
      ),
    );
  }

  Widget _ruleRow(String label, bool? met) {
    final color = met == true ? AppColors.ok : AppColors.muted;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 1.5),
      child: Row(
        children: [
          Icon(
            met == null ? Icons.info_outline_rounded : (met ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded),
            size: 14,
            color: color,
          ),
          const SizedBox(width: 6),
          Expanded(child: Text(label, style: TextStyle(fontSize: 12, color: color))),
        ],
      ),
    );
  }

  Widget _errorBanner() {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.danger.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.danger.withValues(alpha: 0.3)),
      ),
      child: Text(_error, style: const TextStyle(color: AppColors.danger, fontSize: 13)),
    );
  }

  Widget _spinner() =>
      const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white));
}
