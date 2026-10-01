import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/focus_lock_provider.dart';
import '../../theme/app_colors.dart';

/// Parent-facing "Focus Mode" lock, reachable from More → Parental Lock.
///
/// Android: pins the app to the foreground via screen pinning (Lock Task),
/// gated by a parent-set 6-digit PIN stored in secure storage. Honest about
/// its real ceiling — see the explanation card below.
///
/// iOS: Apple gives no public API for a third-party app to lock itself to
/// the foreground, so this screen only shows instructions for Apple's own
/// Guided Access / Screen Time, which the parent must enable in iOS Settings.
class ParentalLockScreen extends ConsumerStatefulWidget {
  const ParentalLockScreen({super.key});

  @override
  ConsumerState<ParentalLockScreen> createState() => _ParentalLockScreenState();
}

class _ParentalLockScreenState extends ConsumerState<ParentalLockScreen> {
  @override
  Widget build(BuildContext context) {
    final supported = ref.read(focusLockServiceProvider).isSupported;
    return Scaffold(
      appBar: AppBar(title: const Text('Parental Lock')),
      body: supported ? _AndroidFocusLockView() : const _IosInstructionsView(),
    );
  }
}

class _AndroidFocusLockView extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(focusLockProvider);

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _ExplainerCard(),
        const SizedBox(height: 16),
        if (!state.pinSet) const _CreatePinCard() else _ManageLockCard(state: state),
      ],
    );
  }
}

class _ExplainerCard extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: AppColors.brandSoft, borderRadius: BorderRadius.circular(14)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('🔒 Focus Mode', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
          SizedBox(height: 8),
          Text(
            'Pins AcademiX to the screen so your child can\'t switch to other apps — '
            'the Home and Recent Apps buttons stop working while it\'s on.',
            style: TextStyle(fontSize: 12.5, color: AppColors.text),
          ),
          SizedBox(height: 8),
          Text(
            'Honest limit: this uses Android\'s own screen-pinning feature, not full '
            'device management. A tech-savvy kid holding Back + Recent Apps together can '
            'reach Android\'s own unpin screen — but that asks for the PHONE\'s screen lock, '
            'not this PIN. Set here is still a strong, real deterrent for everyday use.',
            style: TextStyle(fontSize: 11.5, color: AppColors.muted),
          ),
        ],
      ),
    );
  }
}

class _CreatePinCard extends ConsumerStatefulWidget {
  const _CreatePinCard();

  @override
  ConsumerState<_CreatePinCard> createState() => _CreatePinCardState();
}

class _CreatePinCardState extends ConsumerState<_CreatePinCard> {
  final _pinController = TextEditingController();
  final _confirmController = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _pinController.dispose();
    _confirmController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final pin = _pinController.text.trim();
    final confirm = _confirmController.text.trim();
    if (pin.length != 6 || int.tryParse(pin) == null) {
      setState(() => _error = 'PIN must be exactly 6 digits.');
      return;
    }
    if (pin != confirm) {
      setState(() => _error = 'PINs don\'t match.');
      return;
    }
    setState(() => _error = null);
    await ref.read(focusLockProvider.notifier).setPin(pin);
    _pinController.clear();
    _confirmController.clear();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.line)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Create a parent PIN', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
          const SizedBox(height: 4),
          Text('Only you should know this — it\'s required to turn Focus Mode off.', style: TextStyle(fontSize: 12, color: AppColors.muted)),
          const SizedBox(height: 14),
          _PinField(controller: _pinController, label: '6-digit PIN'),
          const SizedBox(height: 10),
          _PinField(controller: _confirmController, label: 'Confirm PIN'),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(_error!, style: const TextStyle(color: AppColors.danger, fontSize: 12)),
          ],
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _save,
              style: ElevatedButton.styleFrom(backgroundColor: AppColors.brand, foregroundColor: Colors.white),
              child: const Text('Save PIN'),
            ),
          ),
        ],
      ),
    );
  }
}

class _ManageLockCard extends ConsumerStatefulWidget {
  final FocusLockState state;

  const _ManageLockCard({required this.state});

  @override
  ConsumerState<_ManageLockCard> createState() => _ManageLockCardState();
}

class _ManageLockCardState extends ConsumerState<_ManageLockCard> {
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    // Only drives the countdown text below — the real auto-unlock timer
    // lives in FocusLockNotifier regardless of whether this screen is open.
    _tick = Timer.periodic(const Duration(seconds: 30), (_) => setState(() {}));
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  FocusLockState get state => widget.state;

  Future<String?> _promptPin(BuildContext context, {required String title}) {
    final controller = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: _PinField(controller: controller, label: '6-digit PIN', autofocus: true),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.of(ctx).pop(controller.text.trim()), child: const Text('Confirm')),
        ],
      ),
    );
  }

  Future<Duration?> _promptDuration(BuildContext context) {
    const options = [Duration(hours: 1), Duration(hours: 2), Duration(hours: 3)];
    return showDialog<Duration>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Lock for how long?'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'AcademiX will pin to the screen for the chosen time. Home and Recent Apps '
              'stop working until it unlocks — either automatically, or earlier with your PIN.',
              style: TextStyle(fontSize: 12.5, color: AppColors.muted),
            ),
            const SizedBox(height: 14),
            for (final d in options)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: SizedBox(
                  width: double.infinity,
                  child: OutlinedButton(
                    onPressed: () => Navigator.of(ctx).pop(d),
                    child: Text('${d.inHours} hour${d.inHours > 1 ? 's' : ''}'),
                  ),
                ),
              ),
          ],
        ),
        actions: [TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Cancel'))],
      ),
    );
  }

  Future<void> _turnOn(BuildContext context, WidgetRef ref) async {
    final duration = await _promptDuration(context);
    if (duration == null) return;
    final ok = await ref.read(focusLockProvider.notifier).enable(duration);
    if (!context.mounted) return;
    if (!ok) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not enable Focus Mode on this device.')));
    }
  }

  Future<void> _turnOff(BuildContext context, WidgetRef ref) async {
    final pin = await _promptPin(context, title: 'Enter PIN to turn off Focus Mode');
    if (pin == null) return;
    final correct = await ref.read(focusLockProvider.notifier).verifyPin(pin);
    if (!context.mounted) return;
    if (!correct) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Incorrect PIN.')));
      return;
    }
    await ref.read(focusLockProvider.notifier).disable();
  }

  Future<void> _changePin(BuildContext context, WidgetRef ref) async {
    final current = await _promptPin(context, title: 'Enter current PIN');
    if (current == null) return;
    final correct = await ref.read(focusLockProvider.notifier).verifyPin(current);
    if (!context.mounted) return;
    if (!correct) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Incorrect PIN.')));
      return;
    }
    final newPin = await _promptPin(context, title: 'Enter new 6-digit PIN');
    if (newPin == null || newPin.length != 6 || int.tryParse(newPin) == null) {
      if (newPin != null && context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('PIN must be exactly 6 digits.')));
      }
      return;
    }
    await ref.read(focusLockProvider.notifier).setPin(newPin);
    if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('PIN updated.')));
  }

  Future<void> _removeLock(BuildContext context, WidgetRef ref) async {
    final pin = await _promptPin(context, title: 'Enter PIN to remove Focus Mode');
    if (pin == null) return;
    final correct = await ref.read(focusLockProvider.notifier).verifyPin(pin);
    if (!context.mounted) return;
    if (!correct) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Incorrect PIN.')));
      return;
    }
    await ref.read(focusLockProvider.notifier).removePin();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.line)),
      child: Column(
        children: [
          SwitchListTile(
            title: const Text('Focus Mode', style: TextStyle(fontWeight: FontWeight.w700)),
            subtitle: Text(state.enabled ? _statusText(state.unlockAt) : 'Off'),
            value: state.enabled,
            onChanged: (v) => v ? _turnOn(context, ref) : _turnOff(context, ref),
          ),
          const Divider(height: 1),
          ListTile(
            leading: const Icon(Icons.password_rounded, color: AppColors.brand),
            title: const Text('Change PIN'),
            onTap: () => _changePin(context, ref),
          ),
          const Divider(height: 1),
          ListTile(
            leading: Icon(Icons.lock_open_rounded, color: state.enabled ? AppColors.muted : AppColors.danger),
            title: Text('Remove Focus Mode', style: TextStyle(color: state.enabled ? AppColors.muted : AppColors.danger)),
            subtitle: state.enabled ? const Text('Turn off Focus Mode first.') : null,
            enabled: !state.enabled,
            onTap: () => _removeLock(context, ref),
          ),
        ],
      ),
    );
  }

  String _statusText(DateTime? unlockAt) {
    if (unlockAt == null) return 'On — child is locked into AcademiX';
    final remaining = unlockAt.difference(DateTime.now());
    if (remaining.isNegative) return 'Unlocking…';
    final h = remaining.inHours;
    final m = remaining.inMinutes % 60;
    final left = h > 0 ? '${h}h ${m}m' : '${m}m';
    return 'On — unlocks automatically in $left';
  }
}

class _PinField extends StatelessWidget {
  final TextEditingController controller;
  final String label;
  final bool autofocus;

  const _PinField({required this.controller, required this.label, this.autofocus = false});

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      autofocus: autofocus,
      obscureText: true,
      keyboardType: TextInputType.number,
      maxLength: 6,
      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
      decoration: InputDecoration(labelText: label, border: const OutlineInputBorder(), counterText: ''),
    );
  }
}

class _IosInstructionsView extends StatelessWidget {
  const _IosInstructionsView();

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: AppColors.brandSoft, borderRadius: BorderRadius.circular(14)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('🔒 Focus Mode on iPhone/iPad', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
              SizedBox(height: 8),
              Text(
                'Apple doesn\'t let any app lock the device into itself — this has to be turned '
                'on by you, the parent, using Apple\'s own built-in tools.',
                style: TextStyle(fontSize: 12.5, color: AppColors.text),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        const _IosStepCard(
          title: 'Option 1 — Guided Access (recommended)',
          steps: [
            'Open Settings → Accessibility → Guided Access, turn it On, and set a Guided Access passcode.',
            'Open the AcademiX app.',
            'Triple-click the Side (or Home) button to start Guided Access — the device is now locked to this app.',
            'To exit later, triple-click again and enter your Guided Access passcode.',
          ],
        ),
        const SizedBox(height: 12),
        const _IosStepCard(
          title: 'Option 2 — Screen Time App Limits',
          steps: [
            'Open Settings → Screen Time → App Limits.',
            'Allow only AcademiX (and block/limit everything else) for your child\'s account.',
          ],
        ),
      ],
    );
  }
}

class _IosStepCard extends StatelessWidget {
  final String title;
  final List<String> steps;

  const _IosStepCard({required this.title, required this.steps});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.line)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
          const SizedBox(height: 10),
          for (var i = 0; i < steps.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('${i + 1}. ', style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.brand, fontSize: 12.5)),
                  Expanded(child: Text(steps[i], style: const TextStyle(fontSize: 12.5))),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
