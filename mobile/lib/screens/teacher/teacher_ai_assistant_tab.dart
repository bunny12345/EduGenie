import 'dart:convert';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../models/chat_message.dart';
import '../../state/session_provider.dart';
import '../../state/teacher_providers.dart';
import '../../state/teacher_tutor_providers.dart';
import '../../state/tutor_providers.dart';
import '../../theme/ai_tutor_colors.dart';

/// Teacher "AI Assistant" tab — mirrors `TeacherDashboard.jsx`'s
/// `activeSection === 'ai-assistant'` section exactly: locked-subject +
/// lesson dropdown, speed control, chat with per-message "Play Voice",
/// simple follow-up chips (no collapsible Quiz Me/Explain Back/etc — the
/// teacher section doesn't have those, only the student one does), image
/// attach row, and the "Select a lesson to get started" empty state. Same
/// dark `.eg-ai-panel` gradient/colors as the student AI Tutor.
class TeacherAiAssistantTab extends ConsumerStatefulWidget {
  const TeacherAiAssistantTab({super.key});

  @override
  ConsumerState<TeacherAiAssistantTab> createState() =>
      _TeacherAiAssistantTabState();
}

class _TeacherAiAssistantTabState extends ConsumerState<TeacherAiAssistantTab> {
  final _inputCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();
  final AudioPlayer _player = AudioPlayer();
  double _speed = 1.0;
  String? _playingMessageId;
  String? _loadingVoiceMessageId;

  @override
  void dispose() {
    _inputCtrl.dispose();
    _scrollCtrl.dispose();
    _player.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollCtrl.hasClients) return;
      _scrollCtrl.animateTo(
        _scrollCtrl.position.maxScrollExtent,
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOut,
      );
    });
  }

  Future<void> _send([String? overrideText]) async {
    final text = overrideText ?? _inputCtrl.text;
    if (text.trim().isEmpty &&
        ref.read(teacherTutorProvider).chatImages.isEmpty) {
      return;
    }
    _inputCtrl.clear();
    await ref.read(teacherTutorProvider.notifier).sendMessage(text);
    _scrollToBottom();
  }

  Future<void> _pickImages() async {
    final picked = await ImagePicker().pickMultiImage(
      imageQuality: 80,
      limit: 6,
    );
    if (picked.isEmpty) return;
    final images = <PendingImage>[];
    for (final file in picked) {
      final bytes = await file.readAsBytes();
      final mimeType = file.mimeType ?? 'image/jpeg';
      images.add(
        PendingImage(
          name: file.name,
          dataUrl: 'data:$mimeType;base64,${base64Encode(bytes)}',
        ),
      );
    }
    ref.read(teacherTutorProvider.notifier).addImages(images);
  }

  Future<void> _toggleVoice(String messageId, String text) async {
    if (_playingMessageId == messageId) {
      await _player.stop();
      setState(() => _playingMessageId = null);
      return;
    }
    setState(() => _loadingVoiceMessageId = messageId);
    try {
      final teacherId = ref.read(sessionProvider).value?.userId ?? '';
      final actorId = 'teacher-$teacherId';
      final tts = await ref
          .read(chatApiServiceProvider)
          .generateLocalTtsAudio(text, actorId, voice: 'ash', speed: _speed);
      final audioBase64 = tts['audioBase64']?.toString() ?? '';
      if (audioBase64.isEmpty) throw Exception('Empty audio');
      await _player.stop();
      await _player.play(BytesSource(base64Decode(audioBase64)));
      if (!mounted) return;
      setState(() {
        _playingMessageId = messageId;
        _loadingVoiceMessageId = null;
      });
      _player.onPlayerComplete.first.then((_) {
        if (mounted && _playingMessageId == messageId) {
          setState(() => _playingMessageId = null);
        }
      });
    } catch (_) {
      if (mounted) setState(() => _loadingVoiceMessageId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final subject =
        ref.watch(teacherProfileProvider).value?['subject']?.toString() ?? '';
    final targetClass = ref.watch(teacherTargetClassProvider);
    final lessons =
        ref.watch(teacherLessonsProvider).value ??
        const <Map<String, dynamic>>[];
    final tutorState = ref.watch(teacherTutorProvider);
    final lesson = tutorState.lesson;

    return DecoratedBox(
      decoration: const BoxDecoration(gradient: AiTutorColors.panelGradient),
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
            decoration: const BoxDecoration(
              border: Border(bottom: BorderSide(color: AiTutorColors.border)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    const Text(
                      '🤖 AI Assistant',
                      style: TextStyle(
                        color: AiTutorColors.headText,
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const Spacer(),
                    _SpeedControl(
                      speed: _speed,
                      onChanged: (v) => setState(() => _speed = v),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: Container(
                        height: 36,
                        alignment: Alignment.centerLeft,
                        padding: const EdgeInsets.symmetric(horizontal: 10),
                        decoration: BoxDecoration(
                          color: AiTutorColors.selectBg,
                          border: Border.all(color: AiTutorColors.border),
                          borderRadius: BorderRadius.circular(9),
                        ),
                        child: Text(
                          subject.isEmpty ? 'No subject set' : subject,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 12.5,
                            color: AiTutorColors.selectText,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _DarkLessonDropdown(
                        lessons: lessons,
                        selectedId: lesson?['id']?.toString(),
                        onChanged: (id) {
                          final next = lessons.firstWhere(
                            (l) => l['id']?.toString() == id,
                            orElse: () => const {},
                          );
                          ref
                              .read(teacherTutorProvider.notifier)
                              .selectLesson(next.isEmpty ? null : next);
                        },
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  targetClass != 'all'
                      ? 'Visible lessons for $targetClass'
                      : 'Showing lessons across all your classes.',
                  style: const TextStyle(
                    fontSize: 11,
                    color: AiTutorColors.mutedText,
                  ),
                ),
                if (lesson != null) ...[
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: AiTutorColors.lessonChipBg,
                      border: Border.all(color: AiTutorColors.lessonChipBorder),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      'Teaching: ${lesson['title'] ?? ''} \u00b7 ${lesson['subject'] ?? subject}',
                      style: const TextStyle(
                        fontSize: 12,
                        color: AiTutorColors.lessonChipText,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
          Expanded(
            child: lesson == null
                ? const _SelectLessonPrompt()
                : _ChatArea(
                    tutorState: tutorState,
                    scrollCtrl: _scrollCtrl,
                    playingMessageId: _playingMessageId,
                    loadingVoiceMessageId: _loadingVoiceMessageId,
                    onToggleVoice: _toggleVoice,
                  ),
          ),
          if (lesson != null &&
              !tutorState.sending &&
              tutorState.followups.isNotEmpty)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: Wrap(
                spacing: 7,
                runSpacing: 7,
                children: [
                  for (final f in tutorState.followups)
                    _FollowupChip(label: f, onTap: () => _send(f)),
                ],
              ),
            ),
          if (lesson != null)
            _InputRow(
              controller: _inputCtrl,
              sending: tutorState.sending,
              chatImages: tutorState.chatImages,
              onSend: _send,
              onStop: () =>
                  ref.read(teacherTutorProvider.notifier).stopSending(),
              onPickImages: _pickImages,
              onRemoveImage: (i) =>
                  ref.read(teacherTutorProvider.notifier).removeImage(i),
            ),
        ],
      ),
    );
  }
}

class _SpeedControl extends StatelessWidget {
  final double speed;
  final ValueChanged<double> onChanged;

  const _SpeedControl({required this.speed, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6),
      height: 30,
      decoration: BoxDecoration(
        color: const Color(0x8D0E1D60),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AiTutorColors.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text(
            'Speed',
            style: TextStyle(
              color: AiTutorColors.selectText,
              fontSize: 9,
              fontWeight: FontWeight.w600,
            ),
          ),
          SizedBox(
            width: 60,
            child: SliderTheme(
              data: SliderTheme.of(context).copyWith(
                trackHeight: 1.5,
                thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 5),
                overlayShape: const RoundSliderOverlayShape(overlayRadius: 10),
              ),
              child: Slider(
                value: speed,
                min: 0.6,
                max: 1.8,
                divisions: 12,
                activeColor: AiTutorColors.userBubbleStart,
                onChanged: onChanged,
              ),
            ),
          ),
          Text(
            '${speed.toStringAsFixed(1)}x',
            style: const TextStyle(
              color: AiTutorColors.selectText,
              fontSize: 10,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _DarkLessonDropdown extends StatelessWidget {
  final List<Map<String, dynamic>> lessons;
  final String? selectedId;
  final ValueChanged<String?> onChanged;

  const _DarkLessonDropdown({
    required this.lessons,
    required this.selectedId,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 36,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
        color: AiTutorColors.selectBg,
        border: Border.all(color: AiTutorColors.border),
        borderRadius: BorderRadius.circular(9),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: lessons.any((l) => l['id']?.toString() == selectedId)
              ? selectedId
              : null,
          isExpanded: true,
          isDense: true,
          dropdownColor: const Color(0xFF12205E),
          icon: const Icon(
            Icons.keyboard_arrow_down_rounded,
            color: AiTutorColors.selectText,
            size: 16,
          ),
          hint: Text(
            lessons.isEmpty ? 'No lessons yet' : 'Select a lesson',
            style: const TextStyle(
              fontSize: 12.5,
              color: AiTutorColors.mutedText,
            ),
          ),
          items: [
            for (final l in lessons)
              DropdownMenuItem(
                value: l['id']?.toString(),
                child: Text(
                  l['title']?.toString() ?? '',
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 13,
                    color: AiTutorColors.selectText,
                  ),
                ),
              ),
          ],
          onChanged: lessons.isEmpty ? null : onChanged,
        ),
      ),
    );
  }
}

class _SelectLessonPrompt extends StatelessWidget {
  const _SelectLessonPrompt();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('📚', style: TextStyle(fontSize: 40)),
            const SizedBox(height: 12),
            const Text(
              'Select a lesson to get started',
              style: TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: 17,
                color: AiTutorColors.headText,
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              'Choose an available lesson from the dropdown above to start a focused assistant session for it.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: AiTutorColors.mutedText,
                fontSize: 13,
                height: 1.6,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ChatArea extends StatelessWidget {
  final TeacherTutorState tutorState;
  final ScrollController scrollCtrl;
  final String? playingMessageId;
  final String? loadingVoiceMessageId;
  final void Function(String messageId, String text) onToggleVoice;

  const _ChatArea({
    required this.tutorState,
    required this.scrollCtrl,
    required this.playingMessageId,
    required this.loadingVoiceMessageId,
    required this.onToggleVoice,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [AiTutorColors.chatBgTop, AiTutorColors.chatBgBottom],
        ),
        border: Border.all(color: AiTutorColors.chatBorder),
        borderRadius: BorderRadius.circular(14),
      ),
      child: ListView.builder(
        controller: scrollCtrl,
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
        itemCount:
            tutorState.messages.length +
            (tutorState.sending ? 1 : 0) +
            (tutorState.messages.isEmpty && !tutorState.sending ? 1 : 0),
        itemBuilder: (context, i) {
          if (tutorState.messages.isEmpty && !tutorState.sending && i == 0) {
            return const Align(
              alignment: Alignment.centerLeft,
              child: Padding(
                padding: EdgeInsets.symmetric(vertical: 4),
                child: Text(
                  '\ud83d\udc4b Ask me anything about this lesson to help plan or recap it.',
                  style: TextStyle(color: AiTutorColors.botText, fontSize: 13),
                ),
              ),
            );
          }
          if (i >= tutorState.messages.length) return const _TypingBubble();
          final m = tutorState.messages[i];
          return _MessageBubble(
            message: m,
            playing: playingMessageId == m.id,
            loadingVoice: loadingVoiceMessageId == m.id,
            onToggleVoice: () => onToggleVoice(m.id, m.text),
          );
        },
      ),
    );
  }
}

class _TypingBubble extends StatelessWidget {
  const _TypingBubble();

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: AiTutorColors.botBubble,
          border: Border.all(color: AiTutorColors.botBubbleBorder),
          borderRadius: BorderRadius.circular(14),
        ),
        child: const Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'AcademiX is thinking',
              style: TextStyle(color: AiTutorColors.botText, fontSize: 13),
            ),
            SizedBox(width: 8),
            SizedBox(
              width: 16,
              height: 16,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: AiTutorColors.botText,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  final ChatMessage message;
  final bool playing;
  final bool loadingVoice;
  final VoidCallback onToggleVoice;

  const _MessageBubble({
    required this.message,
    required this.playing,
    required this.loadingVoice,
    required this.onToggleVoice,
  });

  @override
  Widget build(BuildContext context) {
    final bool isUser = message.isUser;
    final String text = message.text;
    final List<String> imageDataUrls = message.imageDataUrls;
    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Column(
        crossAxisAlignment: isUser
            ? CrossAxisAlignment.end
            : CrossAxisAlignment.start,
        children: [
          Container(
            constraints: BoxConstraints(
              maxWidth: MediaQuery.of(context).size.width * 0.78,
            ),
            margin: const EdgeInsets.only(top: 4),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              gradient: isUser
                  ? const LinearGradient(
                      colors: [
                        AiTutorColors.userBubbleStart,
                        AiTutorColors.userBubbleEnd,
                      ],
                    )
                  : null,
              color: isUser ? null : AiTutorColors.botBubble,
              border: Border.all(
                color: isUser
                    ? Colors.transparent
                    : AiTutorColors.botBubbleBorder,
              ),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                if (imageDataUrls.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: imageDataUrls
                          .map(
                            (url) => ClipRRect(
                              borderRadius: BorderRadius.circular(8),
                              child: Image.memory(
                                base64Decode(url.split(',').last),
                                width: 90,
                                height: 90,
                                fit: BoxFit.cover,
                              ),
                            ),
                          )
                          .toList(),
                    ),
                  ),
                Text(
                  text,
                  style: TextStyle(
                    color: isUser ? Colors.white : AiTutorColors.botText,
                    fontSize: 14,
                    height: 1.5,
                  ),
                ),
              ],
            ),
          ),
          if (!isUser && text.isNotEmpty)
            TextButton.icon(
              onPressed: loadingVoice ? null : onToggleVoice,
              icon: const Icon(
                Icons.volume_up_rounded,
                size: 13,
                color: Color(0xFFD8FFF3),
              ),
              label: Text(
                loadingVoice
                    ? 'Generating Voice...'
                    : (playing ? 'Stop Voice' : 'Play Voice'),
                style: const TextStyle(
                  fontSize: 11,
                  color: Color(0xFFD8FFF3),
                  fontWeight: FontWeight.w700,
                ),
              ),
              style: TextButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                minimumSize: const Size(0, 26),
              ),
            ),
        ],
      ),
    );
  }
}

class _FollowupChip extends StatelessWidget {
  final String label;
  final VoidCallback onTap;

  const _FollowupChip({required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AiTutorColors.followupBg,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
          decoration: BoxDecoration(
            border: Border.all(color: AiTutorColors.followupBorder),
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(
            label,
            style: const TextStyle(
              fontSize: 12.5,
              color: AiTutorColors.followupText,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ),
    );
  }
}

class _InputRow extends StatelessWidget {
  final TextEditingController controller;
  final bool sending;
  final List<PendingImage> chatImages;
  final void Function([String?]) onSend;
  final VoidCallback onStop;
  final VoidCallback onPickImages;
  final void Function(int) onRemoveImage;

  const _InputRow({
    required this.controller,
    required this.sending,
    required this.chatImages,
    required this.onSend,
    required this.onStop,
    required this.onPickImages,
    required this.onRemoveImage,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (chatImages.isNotEmpty)
          Container(
            height: 64,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: const BoxDecoration(
              border: Border(top: BorderSide(color: AiTutorColors.border)),
            ),
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: chatImages.length,
              separatorBuilder: (_, _) => const SizedBox(width: 6),
              itemBuilder: (context, i) => Stack(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Image.memory(
                      base64Decode(chatImages[i].dataUrl.split(',').last),
                      width: 52,
                      height: 52,
                      fit: BoxFit.cover,
                    ),
                  ),
                  Positioned(
                    top: -4,
                    right: -4,
                    child: GestureDetector(
                      onTap: () => onRemoveImage(i),
                      child: Container(
                        width: 18,
                        height: 18,
                        decoration: const BoxDecoration(
                          color: Colors.black87,
                          shape: BoxShape.circle,
                        ),
                        alignment: Alignment.center,
                        child: const Icon(
                          Icons.close_rounded,
                          size: 12,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        Container(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
          decoration: const BoxDecoration(
            border: Border(top: BorderSide(color: AiTutorColors.border)),
          ),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: controller,
                  enabled: !sending,
                  style: const TextStyle(
                    color: AiTutorColors.text,
                    fontSize: 14,
                  ),
                  decoration: InputDecoration(
                    hintText: 'Ask about this lesson... (Enter to send)',
                    hintStyle: const TextStyle(color: Color(0xB8D9E4FF)),
                    isDense: true,
                    filled: true,
                    fillColor: AiTutorColors.inputBg,
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 12,
                    ),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(11),
                      borderSide: const BorderSide(
                        color: AiTutorColors.inputBorder,
                      ),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(11),
                      borderSide: const BorderSide(
                        color: AiTutorColors.inputBorder,
                      ),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(11),
                      borderSide: const BorderSide(
                        color: Color(0xFFA8BEFF),
                        width: 1.5,
                      ),
                    ),
                  ),
                  onSubmitted: (_) => onSend(),
                  textInputAction: TextInputAction.send,
                ),
              ),
              const SizedBox(width: 2),
              _AttachButton(onTap: onPickImages),
              const SizedBox(width: 6),
              _SendButton(sending: sending, onSend: onSend, onStop: onStop),
            ],
          ),
        ),
      ],
    );
  }
}

class _AttachButton extends StatelessWidget {
  final VoidCallback onTap;

  const _AttachButton({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: const SizedBox(
          width: 34,
          height: 42,
          child: Icon(
            Icons.attach_file_rounded,
            color: Color(0xFFEAF1FF),
            size: 20,
          ),
        ),
      ),
    );
  }
}

class _SendButton extends StatelessWidget {
  final bool sending;
  final void Function([String?]) onSend;
  final VoidCallback onStop;

  const _SendButton({
    required this.sending,
    required this.onSend,
    required this.onStop,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: sending ? onStop : () => onSend(),
      child: Container(
        height: 42,
        padding: const EdgeInsets.symmetric(horizontal: 18),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: sending
                ? [
                    AiTutorColors.stopGradientStart,
                    AiTutorColors.stopGradientEnd,
                  ]
                : [
                    AiTutorColors.sendGradientStart,
                    AiTutorColors.sendGradientEnd,
                  ],
          ),
          borderRadius: BorderRadius.circular(10),
        ),
        alignment: Alignment.center,
        child: sending
            ? const Text(
                'Stop',
                style: TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                ),
              )
            : const Icon(Icons.send_rounded, color: Colors.white, size: 18),
      ),
    );
  }
}
