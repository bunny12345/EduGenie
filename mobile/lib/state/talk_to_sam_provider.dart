import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:record/record.dart';

import '../utils/wav_encoder.dart';
import 'session_provider.dart';
import 'tutor_providers.dart';

class TalkToSamState {
  final bool open;
  final bool recording;
  final bool speaking;
  final bool busy; // transcribing / waiting for AI reply
  final String transcript;
  final String? error;
  final bool sessionActive;

  const TalkToSamState({
    this.open = false,
    this.recording = false,
    this.speaking = false,
    this.busy = false,
    this.transcript = '',
    this.error,
    this.sessionActive = false,
  });

  TalkToSamState copyWith({
    bool? open,
    bool? recording,
    bool? speaking,
    bool? busy,
    String? transcript,
    String? error,
    bool? sessionActive,
  }) =>
      TalkToSamState(
        open: open ?? this.open,
        recording: recording ?? this.recording,
        speaking: speaking ?? this.speaking,
        busy: busy ?? this.busy,
        transcript: transcript ?? this.transcript,
        error: error,
        sessionActive: sessionActive ?? this.sessionActive,
      );
}

/// "Talk to Sam" voice loop — mirrors the equivalent flow in
/// `StudentDashboard.jsx`: open -> greet (speak) -> auto-listen -> student
/// speaks -> transcribe -> send as chat -> speak reply -> auto-listen -> loop.
/// Recording uses `record`'s cross-platform PCM16 stream (wrapped as WAV
/// before upload); playback uses `audioplayers` with in-memory bytes.
class TalkToSamNotifier extends Notifier<TalkToSamState> {
  final AudioRecorder _recorder = AudioRecorder();
  final AudioPlayer _player = AudioPlayer();
  StreamSubscription<Uint8List>? _recordingSub;
  final List<int> _pcmBuffer = [];

  @override
  TalkToSamState build() {
    ref.onDispose(() {
      _recordingSub?.cancel();
      _recorder.dispose();
      _player.dispose();
    });
    return const TalkToSamState();
  }

  Future<void> togglePopup() async {
    if (state.open) {
      state = state.copyWith(sessionActive: false, error: '');
      await _player.stop();
      await _stopRecordingSilently();
      state = const TalkToSamState();
      return;
    }
    state = state.copyWith(open: true, sessionActive: true, error: '', transcript: '');
    final lessonTitle = ref.read(tutorProvider).lesson?.title ?? '';
    final greeting = lessonTitle.isNotEmpty
        ? "Hey! Ready to continue with $lessonTitle? Ask me anything or just say teach me and I'll start!"
        : "Hey! I'm Sam, your study buddy. What would you like to learn today?";
    unawaited(speak(greeting, autoListen: true));
  }

  Future<void> speak(String text, {bool autoListen = false}) async {
    final studentId = ref.read(sessionProvider).value?.userId ?? '';
    final cleanText = text.trim();
    if (studentId.isEmpty || cleanText.isEmpty) return;
    state = state.copyWith(speaking: true);
    try {
      final tts = await ref.read(chatApiServiceProvider).generateLocalTtsAudio(cleanText, studentId, voice: 'ash', speed: 1.15);
      final audioBase64 = (tts['audioBase64'] as String? ?? '').trim();
      if (audioBase64.isNotEmpty) {
        final bytes = base64Decode(audioBase64);
        final completer = Completer<void>();
        late final StreamSubscription sub;
        sub = _player.onPlayerComplete.listen((_) {
          sub.cancel();
          if (!completer.isCompleted) completer.complete();
        });
        await _player.play(BytesSource(bytes));
        await completer.future.timeout(const Duration(seconds: 30), onTimeout: () {});
      }
    } catch (_) {
      /* fall through — speaking indicator still clears below */
    } finally {
      state = state.copyWith(speaking: false);
      if (autoListen && state.sessionActive) {
        await startRecording();
      }
    }
  }

  void stopSpeaking() {
    _player.stop();
    state = state.copyWith(speaking: false);
  }

  Future<void> startRecording() async {
    if (state.recording || state.busy) return;
    try {
      if (!await _recorder.hasPermission()) {
        state = state.copyWith(error: 'Microphone permission denied or unavailable.');
        return;
      }
      _pcmBuffer.clear();
      final stream = await _recorder.startStream(
        const RecordConfig(encoder: AudioEncoder.pcm16bits, sampleRate: 16000, numChannels: 1),
      );
      state = state.copyWith(recording: true, error: '', transcript: '');
      _recordingSub = stream.listen((chunk) => _pcmBuffer.addAll(chunk));
    } catch (e) {
      state = state.copyWith(error: 'Microphone permission denied or unavailable.');
    }
  }

  Future<void> stopRecordingAndSend() async {
    if (!state.recording) return;
    await _stopRecordingSilently();
    state = state.copyWith(recording: false, busy: true);

    final pcmBytes = Uint8List.fromList(_pcmBuffer);
    _pcmBuffer.clear();
    if (pcmBytes.isEmpty) {
      state = state.copyWith(busy: false, error: 'I could not catch that. Try again!');
      return;
    }

    final studentId = ref.read(sessionProvider).value?.userId ?? '';
    if (studentId.isEmpty) {
      state = state.copyWith(busy: false);
      return;
    }

    try {
      final wavBytes = wrapPcm16AsWav(pcmBytes, sampleRate: 16000, numChannels: 1);
      final tutor = ref.read(tutorProvider);
      final res = await ref.read(chatApiServiceProvider).transcribeTutorAudio(studentId, {
        'audioBase64': base64Encode(wavBytes),
        'mimeType': 'audio/wav',
        'lessonId': tutor.lesson?.id,
        'lessonTitle': tutor.lesson?.title,
        'lessonSubject': tutor.subject,
      });
      final text = (res['text'] as String? ?? '').trim();
      if (text.isEmpty) {
        state = state.copyWith(busy: false, error: 'I could not catch that. Try again!');
        return;
      }
      state = state.copyWith(busy: false, transcript: text);
      await ref.read(tutorProvider.notifier).sendMessage(text);
      final messages = ref.read(tutorProvider).messages;
      final lastAi = messages.where((m) => !m.isUser).lastOrNull;
      if (lastAi != null && state.sessionActive) {
        await speak(lastAi.text, autoListen: true);
      }
    } catch (e) {
      state = state.copyWith(busy: false, error: 'Voice input failed. Please try again.');
    }
  }

  Future<void> _stopRecordingSilently() async {
    try {
      await _recorder.stop();
    } catch (_) {
      /* ignore */
    }
    await _recordingSub?.cancel();
    _recordingSub = null;
  }
}

final talkToSamProvider = NotifierProvider<TalkToSamNotifier, TalkToSamState>(TalkToSamNotifier.new);
