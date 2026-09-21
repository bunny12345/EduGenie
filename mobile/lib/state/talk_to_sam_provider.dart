import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
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
  // Which chat message's own "Play Voice" button (if any) is currently
  // loading TTS / playing — null while Sam's own greeting/reply is
  // speaking (not tied to a specific message) or nothing is playing.
  final String? loadingMessageId;
  final String? playingMessageId;

  const TalkToSamState({
    this.open = false,
    this.recording = false,
    this.speaking = false,
    this.busy = false,
    this.transcript = '',
    this.error,
    this.sessionActive = false,
    this.loadingMessageId,
    this.playingMessageId,
  });

  TalkToSamState copyWith({
    bool? open,
    bool? recording,
    bool? speaking,
    bool? busy,
    String? transcript,
    String? error,
    bool? sessionActive,
    String? loadingMessageId,
    bool clearLoadingMessageId = false,
    String? playingMessageId,
    bool clearPlayingMessageId = false,
  }) =>
      TalkToSamState(
        open: open ?? this.open,
        recording: recording ?? this.recording,
        speaking: speaking ?? this.speaking,
        busy: busy ?? this.busy,
        transcript: transcript ?? this.transcript,
        error: error,
        sessionActive: sessionActive ?? this.sessionActive,
        loadingMessageId: clearLoadingMessageId ? null : (loadingMessageId ?? this.loadingMessageId),
        playingMessageId: clearPlayingMessageId ? null : (playingMessageId ?? this.playingMessageId),
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

  // Queued speech requests — mirrors web's `samSpeakQueueRef`: if `speak()`
  // is called while audio is already playing (e.g. a message's own "Play
  // Voice" tapped while Sam is mid-reply), queue it instead of clobbering
  // the current playback.
  final List<_QueuedSpeech> _speakQueue = [];

  // Silence auto-stop bookkeeping — mirrors web's Web Audio API silence
  // detector in `onStartTalkToSamRecording` (auto-stops recording after a
  // period of quiet following real speech, so the student doesn't have to
  // tap "Send Now" manually). Web's detector reads `analyser.getByteFrequencyData`,
  // which is already log-scaled (dB-mapped) — that's WHY its threshold (15
  // out of 255) behaves consistently across very different microphones. An
  // earlier version of this used a plain LINEAR PCM amplitude average
  // instead, which is not log-scaled — that only "happened" to work on one
  // device's mic gain and misbehaved on another (laptop Chrome vs phone).
  // Now computes real dBFS (RMS relative to full scale) with light temporal
  // smoothing, which — like web's log-scaled data — stays meaningful across
  // very different mic hardware/gain instead of needing per-device tuning.
  static const double _silenceDbThreshold = -45; // dBFS; quiet room noise floor is usually well below this, normal speech well above
  static const int _minSpeechMs = 600;
  static const int _silenceDurationMs = 1800;
  double? _smoothedDb;
  int? _speechStartMs;
  int? _silenceStartMs;
  bool _hasSpeechStarted = false;
  bool _autoStopTriggered = false;

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
      _speakQueue.clear();
      state = const TalkToSamState();
      return;
    }
    state = state.copyWith(open: true, sessionActive: true, error: '', transcript: '');
    final lessonTitle = ref.read(tutorProvider).lesson?.title ?? '';
    final greeting = lessonTitle.isNotEmpty
        ? "Hey! Ready to continue with $lessonTitle? Ask me anything or just say teach me and I'll start!"
        : "Hey! I'm Sam, your study buddy. What would you like to learn today?";
    unawaited(speak(greeting, autoListen: true, requireSession: true));
  }

  /// [requireSession] gates playback on the Sam popup still being open —
  /// used for Sam's own voice-loop responses (greeting / spoken replies) so
  /// a closed popup can't suddenly start talking. A standalone message's
  /// "Play Voice" tap (which also calls this method, but outside the Sam
  /// popup session) leaves it false so it always plays, mirroring web's
  /// separate `chatVoicePlayId` message-audio system vs. session-gated
  /// `speakSamResponse()`.
  ///
  /// [messageId] identifies which chat message's own "Play Voice" button (if
  /// any) triggered this — drives `loadingMessageId`/`playingMessageId` so
  /// that specific button can show "Generating Voice..."/"Stop Voice" while
  /// every other message's button is disabled, mirroring web's
  /// `chatVoiceLoadingId`/`chatVoicePlayId`.
  Future<void> speak(String text, {bool autoListen = false, bool requireSession = false, String? messageId}) async {
    final cleanText = text.trim();
    if (cleanText.isEmpty) return;
    if (state.speaking) {
      _speakQueue.add(_QueuedSpeech(cleanText, autoListen, requireSession, messageId));
      return;
    }
    await _playSpeech(cleanText, autoListen, requireSession, messageId);
  }

  Future<void> _playSpeech(String text, bool autoListen, bool requireSession, String? messageId) async {
    final studentId = ref.read(sessionProvider).value?.userId ?? '';
    if (studentId.isEmpty) return;
    state = state.copyWith(loadingMessageId: messageId, clearLoadingMessageId: messageId == null);
    try {
      final tts = await ref.read(chatApiServiceProvider).generateLocalTtsAudio(text, studentId, voice: 'shimmer', speed: 1.15);
      // Sam may have been closed while this request was in flight — skip
      // playback so a closed popup can't suddenly start talking. Mirrors
      // web's `samSessionActiveRef.current` check right after the TTS await
      // in `speakSamResponse()`.
      final aborted = requireSession && !state.sessionActive;
      if (!aborted) {
        state = state.copyWith(
          speaking: true,
          clearLoadingMessageId: true,
          playingMessageId: messageId,
          clearPlayingMessageId: messageId == null,
        );
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
      } else {
        state = state.copyWith(clearLoadingMessageId: true);
      }
    } catch (_) {
      /* fall through — speaking indicator still clears below */
    } finally {
      state = state.copyWith(speaking: false, clearLoadingMessageId: true, clearPlayingMessageId: true);
    }
    if (_speakQueue.isNotEmpty) {
      final next = _speakQueue.removeAt(0);
      unawaited(_playSpeech(next.text, next.autoListen, next.requireSession, next.messageId));
    } else if (autoListen && state.sessionActive) {
      await startRecording();
    }
  }

  void stopSpeaking() {
    _player.stop();
    _speakQueue.clear();
    state = state.copyWith(speaking: false, clearLoadingMessageId: true, clearPlayingMessageId: true);
  }

  Future<void> startRecording() async {
    if (state.recording || state.busy) return;
    try {
      if (!await _recorder.hasPermission()) {
        state = state.copyWith(error: 'Microphone permission denied or unavailable.');
        return;
      }
      _pcmBuffer.clear();
      _smoothedDb = null;
      _speechStartMs = null;
      _silenceStartMs = null;
      _hasSpeechStarted = false;
      _autoStopTriggered = false;
      // `record`'s RecordConfig defaults `autoGain`/`echoCancel`/`noiseSuppress`
      // to false — without AGC, raw mic input on many Android devices is far
      // quieter than expected, which is why both transcription and the
      // silence-threshold below were unreliable on real devices. Enabling
      // these (plus Android's dedicated `voiceRecognition` audio source,
      // which tunes gain/processing for speech-to-text specifically) gives
      // normalized, speech-level amplitude.
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
      state = state.copyWith(recording: true, error: '', transcript: '');
      _recordingSub = stream.listen((chunk) {
        _pcmBuffer.addAll(chunk);
        _checkSilence(chunk);
      });
    } catch (e) {
      state = state.copyWith(error: 'Microphone permission denied or unavailable.');
    }
  }

  /// Auto-stops recording after a period of silence following real speech —
  /// mirrors web's `checkSilence`/`SILENCE_THRESHOLD`/`SILENCE_DURATION` loop.
  void _checkSilence(Uint8List chunk) {
    if (_autoStopTriggered || chunk.length < 2) return;
    final byteData = ByteData.sublistView(chunk);
    final sampleCount = chunk.length ~/ 2;
    if (sampleCount == 0) return;
    var sumSquares = 0.0;
    for (var i = 0; i < sampleCount; i++) {
      final sample = byteData.getInt16(i * 2, Endian.little).toDouble();
      sumSquares += sample * sample;
    }
    final rms = math.sqrt(sumSquares / sampleCount);
    final db = rms > 0 ? 20 * (math.log(rms / 32768) / math.ln10) : -100.0;
    // Light temporal smoothing (like web's `analyser.smoothingTimeConstant`)
    // so a single quiet/loud frame doesn't flip the speech/silence decision.
    _smoothedDb = _smoothedDb == null ? db : (_smoothedDb! * 0.7 + db * 0.3);
    final now = DateTime.now().millisecondsSinceEpoch;

    if (_smoothedDb! > _silenceDbThreshold) {
      _silenceStartMs = null;
      if (!_hasSpeechStarted) {
        _hasSpeechStarted = true;
        _speechStartMs = now;
      }
      return;
    }
    if (!_hasSpeechStarted) return;
    if (now - (_speechStartMs ?? now) < _minSpeechMs) return;

    _silenceStartMs ??= now;
    if (now - _silenceStartMs! >= _silenceDurationMs) {
      _autoStopTriggered = true;
      unawaited(stopRecordingAndSend());
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

      // Explain Back is open — treat the spoken answer as the explanation
      // and evaluate it right away instead of sending it as a normal chat
      // message. Mirrors web's `onStopTalkToSamRecording` explainBackActive
      // branch.
      if (ref.read(tutorProvider).explainBackActive) {
        state = state.copyWith(open: false, sessionActive: false);
        await ref.read(tutorProvider.notifier).submitExplainBack(text);
        return;
      }

      await ref.read(tutorProvider.notifier).sendMessage(text);
      final messages = ref.read(tutorProvider).messages;
      final lastAi = messages.where((m) => !m.isUser).lastOrNull;
      if (lastAi != null && state.sessionActive) {
        await speak(lastAi.text, autoListen: true, requireSession: true);
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

/// A pending `speak()` call waiting for the current playback to finish.
class _QueuedSpeech {
  final String text;
  final bool autoListen;
  final bool requireSession;
  final String? messageId;

  const _QueuedSpeech(this.text, this.autoListen, this.requireSession, this.messageId);
}

final talkToSamProvider = NotifierProvider<TalkToSamNotifier, TalkToSamState>(TalkToSamNotifier.new);
