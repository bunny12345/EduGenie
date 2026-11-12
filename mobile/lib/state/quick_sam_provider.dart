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
import '../utils/sam_speech_chunks.dart';
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
  final int speechRate;
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
    this.speechRate = 1,
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
    int? speechRate,
    String? error,
    bool clearError = false,
  }) => QuickSamState(
    open: open ?? this.open,
    messages: messages ?? this.messages,
    followups: followups ?? this.followups,
    sending: sending ?? this.sending,
    recording: recording ?? this.recording,
    transcribing: transcribing ?? this.transcribing,
    voicePlaying: voicePlaying ?? this.voicePlaying,
    muted: muted ?? this.muted,
    speechRate: speechRate ?? this.speechRate,
    error: clearError ? null : (error ?? this.error),
  );
}

final quickSamAudioPlayerProvider = Provider<AudioPlayer>((ref) => AudioPlayer());

/// Home-page class-wide chat. Closing forgets the conversation.
class QuickSamNotifier extends Notifier<QuickSamState> {
  AudioRecorder? _recorder;
  AudioRecorder get _activeRecorder => _recorder ??= AudioRecorder();
  late final AudioPlayer _player;
  StreamSubscription<Uint8List>? _recordingSub;
  final List<int> _pcmBuffer = [];
  Timer? _recordingCap;
  CancelToken? _cancel;
  // Bumped on every close so late replies/audio from a closed session are dropped.
  int _session = 0;
  int _speechRevision = 0;
  Completer<void>? _audioDone;

  VoiceEnvelope? _envelope;
  Duration _anchorPosition = Duration.zero;
  final Stopwatch _anchorClock = Stopwatch();

  @override
  QuickSamState build() {
    _player = ref.read(quickSamAudioPlayerProvider);
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
    final completeSub = _player.onPlayerComplete.listen(
      (_) {
        if (!(_audioDone?.isCompleted ?? true)) _audioDone!.complete();
      },
      onError: (Object error, StackTrace stack) {
        debugPrint('Quick Sam audio playback failed: $error\n$stack');
        unawaited(_stopAudio());
        state = state.copyWith(voicePlaying: false, error: 'Sam’s voice stopped unexpectedly. You can still read the reply.');
      },
    );
    ref.onDispose(() {
      _session++;
      _speechRevision++;
      if (!(_audioDone?.isCompleted ?? true)) _audioDone!.complete();
      stateSub.cancel();
      positionSub.cancel();
      completeSub.cancel();
      _recordingCap?.cancel();
      _recordingSub?.cancel();
      _cancel?.cancel();
      _recorder?.dispose();
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
    final sinceAnchor = math.min(_anchorClock.elapsedMilliseconds, 400) * state.speechRate;
    return env.at(_anchorPosition + Duration(milliseconds: sinceAnchor));
  }

  void open({String firstName = ''}) {
    _session++;
    final hi = firstName.isNotEmpty ? 'Hi $firstName!' : 'Hi!';
    state = QuickSamState(
      open: true,
      muted: state.muted,
      speechRate: state.speechRate,
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
    state = QuickSamState(muted: state.muted, speechRate: state.speechRate);
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
    state = state.copyWith(
      messages: [
        ...state.messages,
        QuickSamMessage(isUser: true, text: text),
      ],
      followups: const [],
      sending: true,
      clearError: true,
    );
    await _stopAudio();
    if (session != _session) return;
    final cancel = CancelToken();
    _cancel = cancel;
    try {
      final res = await ref
          .read(chatApiServiceProvider)
          .sendQuickChat(studentId: studentId, message: text, recentMessages: history, cancelToken: cancel);
      if (session != _session) return;
      var reply = (res['reply'] as String? ?? '').trim();
      if (reply.isEmpty) reply = "Sorry, I couldn't come up with an answer. Try asking in a different way.";
      final followups = (res['followups'] as List? ?? []).map((e) => e.toString()).take(3).toList();
      state = state.copyWith(
        messages: [
          ...state.messages,
          QuickSamMessage(isUser: false, text: reply),
        ],
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
    final revision = _speechRevision;
    bool valid() => session == _session && revision == _speechRevision && !state.muted;
    final service = ref.read(chatApiServiceProvider);
    final studentId = _studentId;
    final chunks = splitSamSpeech(speech);
    Future<({Map<String, dynamic>? tts, Object? error})> prepare(String chunk) async {
      try {
        return (tts: await service.generateLocalTtsAudio(chunk, studentId, voice: 'shimmer', speed: 1, format: 'wav'), error: null);
      } catch (error) {
        return (tts: null, error: error);
      }
    }

    var pending = prepare(chunks.first);
    try {
      for (var i = 0; i < chunks.length; i++) {
        final result = await pending;
        if (!valid()) return;
        if (result.error != null) throw result.error!;
        if (i + 1 < chunks.length) pending = prepare(chunks[i + 1]);
        final tts = result.tts!;
        final audioBase64 = (tts['audioBase64'] as String? ?? '').trim();
        if (audioBase64.isEmpty) throw StateError('Sam returned empty voice audio.');
        final bytes = base64Decode(audioBase64);
        _envelope = (tts['mimeType'] as String? ?? '').contains('wav') ? VoiceEnvelope.fromWav(bytes) : null;
        _anchorPosition = Duration.zero;
        _anchorClock.reset();
        final done = Completer<void>();
        _audioDone = done;
        await _player.setSource(BytesSource(bytes));
        if (!valid()) return;
        await _player.setPlaybackRate(state.speechRate.toDouble());
        if (!valid()) return;
        await _player.resume();
        await done.future;
        if (!valid()) return;
        state = state.copyWith(voicePlaying: false);
      }
    } catch (error, stack) {
      debugPrint('Quick Sam voice failed: $error\n$stack');
      if (valid()) state = state.copyWith(voicePlaying: false, error: 'Sam’s voice is unavailable. You can still read the reply.');
    } finally {
      if (valid()) _audioDone = null;
    }
  }

  Future<void> setSpeechRate(int rate) async {
    if (![1, 2].contains(rate)) throw ArgumentError.value(rate, 'rate');
    final oldRate = state.speechRate;
    if (_anchorClock.isRunning) {
      _anchorPosition += Duration(milliseconds: math.min(_anchorClock.elapsedMilliseconds, 400) * oldRate);
      _anchorClock.reset();
    }
    state = state.copyWith(speechRate: rate);
    try {
      await _player.setPlaybackRate(rate.toDouble());
    } catch (error, stack) {
      debugPrint('Quick Sam speed change failed: $error\n$stack');
      if (state.speechRate == rate) state = state.copyWith(speechRate: oldRate, error: 'Unable to change Sam’s speed. Please try again.');
    }
  }

  Future<void> _stopAudio() async {
    _speechRevision++;
    if (!(_audioDone?.isCompleted ?? true)) _audioDone!.complete();
    _audioDone = null;
    _envelope = null;
    _anchorClock.stop();
    try {
      await _player.stop();
    } catch (error, stack) {
      debugPrint('Quick Sam audio stop failed: $error\n$stack');
      state = state.copyWith(error: 'Unable to stop Sam’s voice. Please close Sam and try again.');
    }
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
      if (!await _activeRecorder.hasPermission()) {
        state = state.copyWith(error: 'Microphone permission denied. You can type your question instead.');
        return;
      }
      _pcmBuffer.clear();
      final stream = await _activeRecorder.startStream(
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
      final recorder = _recorder;
      if (recorder != null && await recorder.isRecording()) await recorder.stop();
    } catch (_) {
      /* ignore */
    }
    if (state.recording) state = state.copyWith(recording: false);
  }
}

final quickSamProvider = NotifierProvider<QuickSamNotifier, QuickSamState>(QuickSamNotifier.new);
