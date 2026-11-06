import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:audioplayers/audioplayers.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:record/record.dart';

import '../utils/tutor_text.dart';
import '../utils/voice_envelope.dart';
import '../utils/wav_encoder.dart';
import 'session_provider.dart';
import 'tutor_providers.dart';

class QuickSamMessage {
  final bool isUser;
  final String text;
  // Sam's on-device greeting — shown, but never sent back as history.
  final bool local;

  const QuickSamMessage({required this.isUser, required this.text, this.local = false});
}

class QuickSamState {
  final bool open;
  final List<QuickSamMessage> messages;
  final List<String> followups;
  final bool sending;
  final bool recording;
  final bool transcribing;
  // True only while Sam's voice is audible — drives the avatar's talking.
  final bool voicePlaying;
  final bool muted;
  final String? error;

  const QuickSamState({
    this.open = false,
    this.messages = const [],
    this.followups = const [],
    this.sending = false,
    this.recording = false,
    this.transcribing = false,
    this.voicePlaying = false,
    this.muted = false,
    this.error,
  });

  QuickSamState copyWith({
    bool? open,
    List<QuickSamMessage>? messages,
    List<String>? followups,
    bool? sending,
    bool? recording,
    bool? transcribing,
    bool? voicePlaying,
    bool? muted,
    String? error,
    bool clearError = false,
  }) =>
      QuickSamState(
        open: open ?? this.open,
        messages: messages ?? this.messages,
        followups: followups ?? this.followups,
        sending: sending ?? this.sending,
        recording: recording ?? this.recording,
        transcribing: transcribing ?? this.transcribing,
        voicePlaying: voicePlaying ?? this.voicePlaying,
        muted: muted ?? this.muted,
        error: clearError ? null : (error ?? this.error),
      );
}

/// Home-page "Quick Sam" — mirrors `QuickSamBubble.jsx` on web. Answers from
/// every subject of the student's class with no subject/lesson filter. The
/// thread only lives in this state: nothing is saved, and [close] wipes it.
class QuickSamNotifier extends Notifier<QuickSamState> {
  final AudioRecorder _recorder = AudioRecorder();
  final AudioPlayer _player = AudioPlayer();
  StreamSubscription<Uint8List>? _recordingSub;
  final List<int> _pcmBuffer = [];
  Timer? _recordingCap;
  CancelToken? _cancel;
  // Bumped on every close so late replies/audio from a closed session are dropped.
  int _session = 0;

  VoiceEnvelope? _envelope;
  Duration _anchorPosition = Duration.zero;
  final Stopwatch _anchorClock = Stopwatch();

  @override
  QuickSamState build() {
    final stateSub = _player.onPlayerStateChanged.listen((s) {
      if (s != PlayerState.playing && state.voicePlaying) {
        state = state.copyWith(voicePlaying: false);
      }
    });
    final positionSub = _player.onPositionChanged.listen((p) {
      _anchorPosition = p;
      _anchorClock
        ..reset()
        ..start();
      if (!state.voicePlaying && p > Duration.zero && _player.state == PlayerState.playing) {
        state = state.copyWith(voicePlaying: true);
      }
    });
    ref.onDispose(() {
      stateSub.cancel();
      positionSub.cancel();
      _recordingCap?.cancel();
      _recordingSub?.cancel();
      _cancel?.cancel();
      _recorder.dispose();
      _player.dispose();
    });
    return const QuickSamState();
  }

  String get _studentId => ref.read(sessionProvider).value?.userId ?? '';

  /// Loudness/brightness of Sam's voice for lip-sync (same as the AI Tutor's Sam).
  ({double level, double bright})? sampleVoice() {
    final env = _envelope;
    if (env == null) return null;
    if (_player.state != PlayerState.playing || !_anchorClock.isRunning) return (level: 0, bright: 0.4);
    final sinceAnchor = math.min(_anchorClock.elapsedMilliseconds, 400);
    return env.at(_anchorPosition + Duration(milliseconds: sinceAnchor));
  }

  void open({String firstName = ''}) {
    _session++;
    final hi = firstName.isNotEmpty ? 'Hi $firstName!' : 'Hi!';
    state = QuickSamState(
      open: true,
      muted: state.muted,
      messages: [
        QuickSamMessage(
          isUser: false,
          local: true,
          text: "$hi 👋 I'm Sam. Ask me anything from your class subjects — no need to pick a subject or lesson.",
        ),
      ],
    );
  }

  /// Ends the session and forgets the whole conversation.
  Future<void> close() async {
    _session++;
    _cancel?.cancel();
    _cancel = null;
    await _stopRecorder();
    await _stopAudio();
    state = QuickSamState(muted: state.muted);
  }

  Future<void> send(String raw) async {
    final text = raw.trim();
    final studentId = _studentId;
    if (text.isEmpty || state.sending || studentId.isEmpty) return;
    final session = _session;
    final history = state.messages
        .where((m) => !m.local)
        .toList()
        .reversed
        .take(12)
        .toList()
        .reversed
        .map((m) => {'role': m.isUser ? 'user' : 'assistant', 'content': m.text})
        .toList();
    await _stopAudio();
    state = state.copyWith(
      messages: [...state.messages, QuickSamMessage(isUser: true, text: text)],
      followups: const [],
      sending: true,
      clearError: true,
    );
    final cancel = CancelToken();
    _cancel = cancel;
    try {
      final res = await ref.read(chatApiServiceProvider).sendQuickChat(
            studentId: studentId,
            message: text,
            recentMessages: history,
            cancelToken: cancel,
          );
      if (session != _session) return;
      var reply = (res['reply'] as String? ?? '').trim();
      if (reply.isEmpty) reply = "Sorry, I couldn't come up with an answer. Try asking in a different way.";
      final followups = (res['followups'] as List? ?? []).map((e) => e.toString()).take(3).toList();
      state = state.copyWith(
        messages: [...state.messages, QuickSamMessage(isUser: false, text: reply)],
        followups: followups,
        sending: false,
      );
      unawaited(_speak(reply, session));
    } catch (_) {
      if (session != _session) return;
      state = state.copyWith(sending: false, error: 'Sam could not answer right now. Please try again.');
    } finally {
      if (identical(_cancel, cancel)) _cancel = null;
    }
  }

  Future<void> _speak(String text, int session) async {
    final speech = tutorSpeechText(text);
    if (speech.isEmpty || state.muted || _studentId.isEmpty) return;
    try {
      final tts = await ref.read(chatApiServiceProvider).generateLocalTtsAudio(speech, _studentId, voice: 'shimmer', speed: 1.15, format: 'wav');
      if (session != _session || state.muted) return;
      final audioBase64 = (tts['audioBase64'] as String? ?? '').trim();
      if (audioBase64.isEmpty) return;
      final bytes = base64Decode(audioBase64);
      // Only WAV can be analysed; an older backend still answers with mp3.
      _envelope = (tts['mimeType'] as String? ?? '').contains('wav') ? VoiceEnvelope.fromWav(bytes) : null;
      _anchorPosition = Duration.zero;
      _anchorClock.reset();
      await _player.play(BytesSource(bytes));
    } catch (_) {
      /* voice is optional — the text reply is already on screen */
    }
  }

  Future<void> _stopAudio() async {
    _envelope = null;
    _anchorClock.stop();
    try {
      await _player.stop();
    } catch (_) {/* ignore */}
    if (state.voicePlaying) state = state.copyWith(voicePlaying: false);
  }

  Future<void> toggleMute() async {
    final muted = !state.muted;
    state = state.copyWith(muted: muted);
    if (muted) await _stopAudio();
  }

  Future<void> toggleRecording() async {
    if (state.recording) {
      await _finishRecording();
      return;
    }
    if (state.sending || state.transcribing) return;
    await _stopAudio();
    try {
      if (!await _recorder.hasPermission()) {
        state = state.copyWith(error: 'Microphone permission denied. You can type your question instead.');
        return;
      }
      _pcmBuffer.clear();
      final stream = await _recorder.startStream(
        const RecordConfig(
          encoder: AudioEncoder.pcm16bits,
          sampleRate: 16000,
          numChannels: 1,
          autoGain: true,
          echoCancel: true,
          noiseSuppress: true,
          androidConfig: AndroidRecordConfig(audioSource: AndroidAudioSource.voiceRecognition),
        ),
      );
      _recordingSub = stream.listen(_pcmBuffer.addAll);
      // A forgotten mic never records forever.
      _recordingCap = Timer(const Duration(seconds: 30), () => unawaited(_finishRecording()));
      state = state.copyWith(recording: true, clearError: true);
    } catch (_) {
      state = state.copyWith(error: 'Microphone is not available. You can type your question instead.');
    }
  }

  Future<void> _finishRecording() async {
    if (!state.recording) return;
    final session = _session;
    await _stopRecorder();
    final pcm = Uint8List.fromList(_pcmBuffer);
    _pcmBuffer.clear();
    if (pcm.length < 3200) {
      state = state.copyWith(error: "I couldn't catch that. Try again!");
      return;
    }
    state = state.copyWith(transcribing: true, clearError: true);
    try {
      final wav = wrapPcm16AsWav(pcm, sampleRate: 16000, numChannels: 1);
      final res = await ref.read(chatApiServiceProvider).transcribeTutorAudio(_studentId, {
        'audioBase64': base64Encode(wav),
        'mimeType': 'audio/wav',
      });
      if (session != _session) return;
      final heard = (res['text'] as String? ?? '').trim();
      state = state.copyWith(transcribing: false);
      if (heard.isEmpty) {
        state = state.copyWith(error: "I couldn't catch that. Try again!");
        return;
      }
      await send(heard);
    } catch (_) {
      if (session != _session) return;
      state = state.copyWith(transcribing: false, error: "I couldn't catch that. Try again!");
    }
  }

  Future<void> _stopRecorder() async {
    _recordingCap?.cancel();
    _recordingCap = null;
    await _recordingSub?.cancel();
    _recordingSub = null;
    try {
      if (await _recorder.isRecording()) await _recorder.stop();
    } catch (_) {/* ignore */}
    if (state.recording) state = state.copyWith(recording: false);
  }
}

final quickSamProvider = NotifierProvider<QuickSamNotifier, QuickSamState>(QuickSamNotifier.new);
