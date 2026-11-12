import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../state/quick_sam_provider.dart';
import '../state/exam_access_provider.dart';
import 'exam_tutor_notice.dart';
import '../state/session_provider.dart';
import '../state/student_providers.dart';
import '../utils/tutor_text.dart';
import 'pressable_scale.dart';
import 'sam_avatar.dart';

/// Floating blue "Sam" bubble on the student Home tab — mirrors
/// `.eg-quick-sam-fab` on web. Opens [QuickSamScreen].
class QuickSamBubble extends ConsumerStatefulWidget {
  const QuickSamBubble({super.key});

  @override
  ConsumerState<QuickSamBubble> createState() => _QuickSamBubbleState();
}

class _QuickSamBubbleState extends ConsumerState<QuickSamBubble> with SingleTickerProviderStateMixin {
  late final AnimationController _spin;

  @override
  void initState() {
    super.initState();
    _spin = AnimationController(vsync: this, duration: const Duration(seconds: 4));
  }

  @override
  void dispose() {
    _spin.dispose();
    super.dispose();
  }

  Future<void> _open() async {
    final name = (ref.read(sessionProvider).value?.name ?? '').trim();
    ref.read(quickSamProvider.notifier).open(firstName: name.split(RegExp(r'\s+')).first);
    await Navigator.of(context, rootNavigator: true).push(
      PageRouteBuilder<void>(
        opaque: true,
        transitionDuration: const Duration(milliseconds: 260),
        pageBuilder: (_, _, _) => const QuickSamScreen(),
        transitionsBuilder: (_, anim, _, child) => FadeTransition(
          opacity: anim,
          child: ScaleTransition(scale: Tween(begin: 0.94, end: 1.0).animate(CurvedAnimation(parent: anim, curve: Curves.easeOutCubic)), child: child),
        ),
      ),
    );
    // However the screen was left (close button, back gesture), the chat is forgotten.
    await ref.read(quickSamProvider.notifier).close();
  }

  @override
  Widget build(BuildContext context) {
    final access = ref.watch(examAccessProvider);
    if (!access.hasValue || access.value!.blocked) {
      _spin.stop();
      return const SizedBox.shrink();
    }
    if (!_spin.isAnimating) _spin.repeat();
    final reduceMotion = MediaQuery.of(context).disableAnimations;
    return Semantics(
      button: true,
      label: 'Ask Sam — quick help for all your subjects',
      child: PressableScale(
        onTap: _open,
        pressedScale: 0.9,
        child: AnimatedBuilder(
          animation: _spin,
          builder: (context, _) {
            final t = reduceMotion ? 0.0 : _spin.value;
            final pulse = 0.5 + 0.5 * math.sin(t * math.pi * 4);
            return SizedBox(
              width: 68,
              height: 68,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  // Soft outer glow.
                  Container(
                    width: 68,
                    height: 68,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(color: const Color(0xFF3D8BFF).withValues(alpha: 0.35 + 0.25 * pulse), blurRadius: 16 + 8 * pulse, spreadRadius: 1 + 2 * pulse),
                        const BoxShadow(color: Color(0x40121E55), blurRadius: 10, offset: Offset(0, 6)),
                      ],
                    ),
                  ),
                  // Spinning glowing rim.
                  Transform.rotate(
                    angle: t * 2 * math.pi,
                    child: Container(
                      width: 66,
                      height: 66,
                      decoration: const BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: SweepGradient(colors: [Color(0xFF5BC8FF), Color(0xFF3D5BFF), Color(0xFF9C7BFF), Color(0xFF38E1FF), Color(0xFF5BC8FF)]),
                      ),
                    ),
                  ),
                  Container(
                    width: 58,
                    height: 58,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: const RadialGradient(
                        center: Alignment(-0.35, -0.45),
                        radius: 1.0,
                        colors: [Color(0xFF4F8DFF), Color(0xFF2347D8), Color(0xFF0E1E7A)],
                        stops: [0.0, 0.55, 1.0],
                      ),
                      border: Border.all(color: Colors.white.withValues(alpha: 0.55), width: 1.2),
                    ),
                    child: const Text(
                      'Sam',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.4,
                        shadows: [Shadow(color: Color(0xAA5BC8FF), blurRadius: 8)],
                      ),
                    ),
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

/// Full-screen Sam (same avatar + dark look as the AI Tutor's Talk-to-Sam),
/// with no subject/lesson filter. The conversation is never saved.
class QuickSamScreen extends ConsumerStatefulWidget {
  const QuickSamScreen({super.key});

  @override
  ConsumerState<QuickSamScreen> createState() => _QuickSamScreenState();
}

class _QuickSamScreenState extends ConsumerState<QuickSamScreen> {
  final _input = TextEditingController();
  final _scroll = ScrollController();

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _send([String? text]) {
    final value = (text ?? _input.text).trim();
    if (value.isEmpty) return;
    _input.clear();
    ref.read(quickSamProvider.notifier).send(value);
  }

  void _scrollToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(_scroll.position.maxScrollExtent, duration: const Duration(milliseconds: 240), curve: Curves.easeOut);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(examAccessProvider, (_, next) {
      if ((!next.hasValue || next.value!.blocked) && ref.exists(quickSamProvider)) {
        ref.read(quickSamProvider.notifier).close();
      }
    });
    final access = ref.watch(examAccessProvider);
    if (!access.hasValue || access.value!.blocked) return ExamTutorNotice(access: access.value);
    final s = ref.watch(quickSamProvider);
    ref.listen<QuickSamState>(quickSamProvider, (prev, next) {
      if (prev?.messages.length != next.messages.length || prev?.sending != next.sending) _scrollToEnd();
    });
    final notifier = ref.read(quickSamProvider.notifier);
    final schoolName = ref.watch(dashboardProvider).value?.schoolName ?? '';
    final busy = s.sending || s.transcribing;
    final mode = s.voicePlaying
        ? SamMode.speaking
        : s.recording
            ? SamMode.listening
            : busy
                ? SamMode.thinking
                : SamMode.idle;
    final glow = s.voicePlaying
        ? const Color(0x5532DC8C)
        : s.recording
            ? const Color(0x55FF5A6E)
            : const Color(0x335B6CFF);
    const bgBottom = Color(0xFF0A1345);
    final status = s.recording
        ? '🎙️ Listening… tap the mic again when you are done'
        : s.transcribing
            ? '💭 Sam is listening back…'
            : s.sending
                ? '💭 Sam is thinking…'
                : s.voicePlaying
                    ? '🔊 Sam is talking…'
                    : '';

    return Scaffold(
      backgroundColor: bgBottom,
      resizeToAvoidBottomInset: true,
      body: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFF22339F), Color(0xFF0E1A66), bgBottom],
          ),
        ),
        child: SafeArea(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 12, 0),
                child: Row(
                  children: [
                    const Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Sam', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w800)),
                          Text('Quick help · all your class subjects',
                              maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: Color(0xCCDCE4FF), fontSize: 12)),
                        ],
                      ),
                    ),
                    IconButton(
                      tooltip: s.muted ? 'Unmute Sam' : 'Mute Sam',
                      icon: Icon(s.muted ? Icons.volume_off_rounded : Icons.volume_up_rounded, color: Colors.white, size: 20),
                      onPressed: notifier.toggleMute,
                    ),
                    TextButton.icon(
                      onPressed: () => Navigator.of(context).maybePop(),
                      icon: const Icon(Icons.close_rounded, size: 16, color: Colors.white),
                      label: const Text('Close', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 12)),
                      style: TextButton.styleFrom(
                        backgroundColor: const Color(0x66E5384F),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                flex: 5,
                child: Stack(
                  children: [
                    Positioned.fill(
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: RadialGradient(center: const Alignment(0, 0.2), radius: 0.75, colors: [glow, Colors.transparent]),
                        ),
                      ),
                    ),
                    Align(
                      alignment: Alignment.bottomCenter,
                      child: SamAvatar(mode: mode, schoolName: schoolName, getLevel: notifier.sampleVoice, viewTop: 96, viewHeight: 590),
                    ),
                    Positioned(
                      left: 0,
                      right: 0,
                      bottom: 0,
                      height: 48 * MediaQuery.textScalerOf(context).scale(12) / 12,
                      child: IgnorePointer(
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.topCenter,
                              end: Alignment.bottomCenter,
                              colors: [bgBottom.withValues(alpha: 0), bgBottom],
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                flex: 4,
                child: Container(
                  margin: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                  padding: const EdgeInsets.fromLTRB(10, 10, 10, 10),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [Color(0xF2121E55), Color(0xF50C1641)],
                    ),
                    border: Border.all(color: const Color(0x59788FFF)),
                    borderRadius: BorderRadius.circular(18),
                  ),
                  child: Column(
                    children: [
                      Expanded(
                        child: ListView.builder(
                          controller: _scroll,
                          itemCount: s.messages.length + (s.sending ? 1 : 0),
                          itemBuilder: (_, i) {
                            if (i >= s.messages.length) return const _TypingBubble();
                            return _MessageBubble(message: s.messages[i]);
                          },
                        ),
                      ),
                      if (s.followups.isNotEmpty && !busy)
                        SizedBox(
                          height: 36,
                          child: ListView.separated(
                            scrollDirection: Axis.horizontal,
                            itemCount: s.followups.length,
                            separatorBuilder: (_, _) => const SizedBox(width: 6),
                            itemBuilder: (_, i) => ActionChip(
                              label: Text(s.followups[i]),
                              labelStyle: const TextStyle(color: Color(0xFFEEF1FF), fontSize: 12, fontWeight: FontWeight.w600),
                              color: const WidgetStatePropertyAll(Color(0xFF263B80)),
                              surfaceTintColor: Colors.transparent,
                              side: const BorderSide(color: Color(0xFF8DAAFF)),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                              onPressed: () => _send(s.followups[i]),
                            ),
                          ),
                        ),
                      if (status.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 6),
                          child: Text(status, style: const TextStyle(color: Colors.white70, fontSize: 12)),
                        ),
                      if ((s.error ?? '').isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 6),
                          child: Text(s.error!, style: const TextStyle(color: Color(0xFFFFB4BE), fontSize: 12)),
                        ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          _RoundIcon(
                            icon: s.recording ? Icons.stop_rounded : Icons.mic_rounded,
                            color: s.recording ? const Color(0xFFE5384F) : const Color(0x335B6CFF),
                            tooltip: s.recording ? 'Stop and send' : 'Speak your question',
                            onTap: (s.sending || s.transcribing) ? null : notifier.toggleRecording,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: TextField(
                              controller: _input,
                              enabled: !s.recording,
                              textInputAction: TextInputAction.send,
                              onSubmitted: (_) => _send(),
                              style: const TextStyle(color: Colors.white, fontSize: 14),
                              cursorColor: Colors.white,
                              decoration: InputDecoration(
                                isDense: true,
                                hintText: 'Ask Sam anything from your subjects…',
                                hintStyle: const TextStyle(color: Color(0x99DCE4FF), fontSize: 13),
                                filled: true,
                                fillColor: const Color(0x14FFFFFF),
                                contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                                border: OutlineInputBorder(borderRadius: BorderRadius.circular(22), borderSide: const BorderSide(color: Color(0x59788FFF))),
                                enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(22), borderSide: const BorderSide(color: Color(0x59788FFF))),
                                focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(22), borderSide: const BorderSide(color: Color(0xFF5BC8FF))),
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          _RoundIcon(
                            icon: Icons.send_rounded,
                            color: const Color(0xFF2F5BFF),
                            tooltip: 'Send',
                            onTap: s.sending ? null : _send,
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RoundIcon extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String tooltip;
  final VoidCallback? onTap;

  const _RoundIcon({required this.icon, required this.color, required this.tooltip, this.onTap});

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: Material(
        color: onTap == null ? color.withValues(alpha: 0.35) : color,
        shape: const CircleBorder(side: BorderSide(color: Color(0x59788FFF))),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: SizedBox(width: 42, height: 42, child: Icon(icon, color: Colors.white, size: 20)),
        ),
      ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  final QuickSamMessage message;

  const _MessageBubble({required this.message});

  @override
  Widget build(BuildContext context) {
    final user = message.isUser;
    return Align(
      alignment: user ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.78),
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
        decoration: BoxDecoration(
          gradient: user ? const LinearGradient(colors: [Color(0xFF3D6BFF), Color(0xFF2747D6)]) : null,
          color: user ? null : const Color(0x14FFFFFF),
          border: user ? null : Border.all(color: const Color(0x33788FFF)),
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(14),
            topRight: const Radius.circular(14),
            bottomLeft: Radius.circular(user ? 14 : 4),
            bottomRight: Radius.circular(user ? 4 : 14),
          ),
        ),
        child: Text(
          user ? message.text : tutorDisplayText(message.text),
          style: const TextStyle(color: Color(0xFFEEF1FF), fontSize: 13.5, height: 1.45),
        ),
      ),
    );
  }
}

class _TypingBubble extends StatefulWidget {
  const _TypingBubble();

  @override
  State<_TypingBubble> createState() => _TypingBubbleState();
}

class _TypingBubbleState extends State<_TypingBubble> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 900))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(color: const Color(0x14FFFFFF), borderRadius: BorderRadius.circular(14)),
        child: AnimatedBuilder(
          animation: _c,
          builder: (_, _) => Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (var i = 0; i < 3; i++)
                Container(
                  width: 7,
                  height: 7,
                  margin: const EdgeInsets.symmetric(horizontal: 2),
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: Colors.white.withValues(alpha: 0.35 + 0.65 * (0.5 + 0.5 * math.sin((_c.value - i * 0.18) * 2 * math.pi))),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
