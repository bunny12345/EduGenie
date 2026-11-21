import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:audioplayers/audioplayers.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/models/session.dart';
import 'package:mobile/services/api_client.dart';
import 'package:mobile/services/chat_api_service.dart';
import 'package:mobile/state/quick_sam_provider.dart';
import 'package:mobile/state/session_provider.dart';
import 'package:mobile/state/tutor_providers.dart';
import 'package:mobile/utils/sam_speech_chunks.dart';
import 'package:mobile/utils/wav_encoder.dart';

class _Session extends SessionNotifier {
  @override
  Future<Session?> build() async => const Session(role: 'student', userId: 'student', token: 'fixture');
}

class _Player implements AudioPlayer {
  final complete = StreamController<void>.broadcast();
  final sources = <Source>[];
  final rates = <double>[];
  int plays = 0;
  int stops = 0;
  @override
  Stream<PlayerState> get onPlayerStateChanged => const Stream.empty();
  @override
  Stream<Duration> get onPositionChanged => const Stream.empty();
  @override
  Stream<void> get onPlayerComplete => complete.stream;
  @override
  PlayerState get state => PlayerState.stopped;
  @override
  Future<void> setSource(Source source) async => sources.add(source);
  @override
  Future<void> setPlaybackRate(double rate) async => rates.add(rate);
  @override
  Future<void> resume() async => plays++;
  @override
  Future<void> stop() async => stops++;
  @override
  Future<void> dispose() async => complete.close();
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _Chat extends ChatApiService {
  _Chat() : super(ApiClient());
  String reply = 'First short sentence. Then the rest of the answer.';
  String language = 'en-US';
  String subject = 'Science';
  final voiceLanguages = <String>[];
  final voiceSubjects = <String>[];
  final preparedFlags = <bool>[];
  final scriptRequests = <({String text, String language, String subject})>[];
  String speechText = 'पहला concept समझें। अब बाकी explanation देखें।';
  Completer<Map<String, dynamic>>? pendingScript;
  String? scriptFailure;
  final requests = <({String text, Completer<Map<String, dynamic>> result})>[];
  final quickRequests = <({String? homeworkId, List<Map<String, String>> history})>[];
  String? failure;
  @override
  Future<Map<String, dynamic>> sendQuickChat({
    required String studentId,
    required String message,
    List<Map<String, String>> recentMessages = const [],
    CancelToken? cancelToken,
    String? homeworkId,
  }) async {
    quickRequests.add((homeworkId: homeworkId, history: recentMessages));
    if (failure != null) throw Exception(failure);
    return {'reply': reply, 'speechLanguage': language, 'speechSubject': subject};
  }
  @override
  Future<Map<String, dynamic>> prepareSamSpeech(String text, String studentId, {required String targetLanguage, String subject = ''}) async {
    scriptRequests.add((text: text, language: targetLanguage, subject: subject));
    if (scriptFailure != null) throw StateError(scriptFailure!);
    return pendingScript != null ? pendingScript!.future : {'speechText': speechText};
  }
  @override
  Future<Map<String, dynamic>> generateLocalTtsAudio(
    String text,
    String studentId, {
    String targetLanguage = 'en-US',
    String? voice,
    double speed = 1,
    String? format,
    String subject = '',
    bool speechPrepared = false,
  }) {
    expect(speed, 1);
    voiceLanguages.add(targetLanguage);
    voiceSubjects.add(subject);
    preparedFlags.add(speechPrepared);
    final result = Completer<Map<String, dynamic>>();
    requests.add((text: text, result: result));
    return result.future;
  }
}

Map<String, dynamic> get _tts => {
  'audioBase64': base64Encode([1, 2, 3]),
  'mimeType': 'audio/mpeg',
};
Future<void> _flush() => Future<void>.delayed(Duration.zero);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late ProviderContainer container;
  late _Player player;
  late _Chat chat;
  late QuickSamNotifier notifier;
  setUp(() async {
    player = _Player();
    chat = _Chat();
    container = ProviderContainer(
      overrides: [
        sessionProvider.overrideWith(_Session.new),
        quickSamAudioPlayerProvider.overrideWithValue(player),
        chatApiServiceProvider.overrideWithValue(chat),
      ],
    );
    await container.read(sessionProvider.future);
    notifier = container.read(quickSamProvider.notifier);
    notifier.open();
    await notifier.stopSpeaking();
  });
  tearDown(() async {
    container.dispose();
    await _flush();
  });

  test('opening Sam speaks a local greeting and mic interrupts without recording or changing history', () async {
    notifier.open(firstName: 'Alex');
    await _flush();
    expect(chat.requests.single.text, 'Hi Alex!');
    expect(chat.quickRequests, isEmpty);
    expect(container.read(quickSamProvider).messages.single.local, isTrue);
    expect(container.read(quickSamProvider).messages.single.text, contains('What would you like to learn today?'));
    chat.requests.first.result.complete(_tts);
    await _flush();
    expect(player.plays, 1);
    expect(chat.requests.length, 2);
    await notifier.toggleRecording();
    expect(container.read(quickSamProvider).speechActive, isFalse);
    expect(container.read(quickSamProvider).recording, isFalse);
    expect(container.read(quickSamProvider).muted, isFalse);
    chat.requests.last.result.complete(_tts);
    await _flush();
    expect(player.plays, 1);
    await notifier.send('Explain fractions');
    expect(chat.quickRequests.single.history, isEmpty);
  });

  test('muted opening retains the greeting without speaking', () async {
    await notifier.toggleMute();
    notifier.open();
    await _flush();
    expect(chat.requests, isEmpty);
    expect(container.read(quickSamProvider).messages.single.text, contains('What would you like to learn today?'));
    expect(container.read(quickSamProvider).speechActive, isFalse);
  });

  test('short first segment preserves all speech and bounds synthesis requests', () {
    final text = 'A quick introduction. ${List.filled(100, 'More explanation').join(' ')}';
    final chunks = splitSamSpeech(text);
    expect(chunks.first, 'A quick introduction.');
    expect(chunks.first.length, lessThanOrEqualTo(240));
    expect(chunks.skip(1).every((chunk) => chunk.length <= 600), isTrue);
    expect(chunks.join(' '), text);
  });

  test('selected homework stays on every follow-up and is forgotten when Sam closes', () async {
    await notifier.toggleMute();
    notifier.open(homeworkId: 'homework-a');
    await notifier.send('Give me a hint');
    await notifier.send('I tried a factor. What should I check?');
    expect(chat.quickRequests.map((request) => request.homeworkId), ['homework-a', 'homework-a']);
    expect(chat.quickRequests.last.history.first['content'], 'Give me a hint');
    await notifier.close();
    expect(container.read(quickSamProvider).homeworkId, isNull);
    notifier.open();
    await notifier.send('Teach me about leaves');
    expect(chat.quickRequests.last.homeworkId, isNull);
    expect(chat.quickRequests.last.history, isEmpty);
  });

  test('homework refusal reports the backend reason to the student', () async {
    chat.failure = 'This homework has already been submitted.';
    notifier.open(homeworkId: 'done');
    await notifier.send('Help');
    expect(container.read(quickSamProvider).error, chat.failure);
    expect(chat.requests, isEmpty);
  });

  test('first audio starts before remaining synthesis completes; prefetched audio waits for completion', () async {
    chat.language = 'hi-IN';
    await notifier.send('Question');
    await _flush();
    expect(chat.scriptRequests.single, (text: chat.reply, language: 'hi-IN', subject: 'Science'));
    expect(chat.voiceLanguages.single, 'hi-IN');
    expect(chat.voiceSubjects.single, 'Science');
    expect(chat.requests.single.text, 'पहला concept समझें।');
    expect(chat.preparedFlags.single, isTrue);
    expect(container.read(quickSamProvider).messages.last.text, chat.reply);
    chat.requests.first.result.complete(_tts);
    await _flush();
    expect(player.plays, 1);
    expect(chat.requests.length, 2);
    expect(chat.requests.map((request) => request.text).join(' '), chat.speechText);
    expect(chat.scriptRequests.length, 1);
    chat.requests.last.result.complete(_tts);
    await _flush();
    expect(player.plays, 1);
    player.complete.add(null);
    await _flush();
    expect(player.plays, 2);
    expect(container.read(quickSamProvider).speechActive, isTrue);
  });

  test('Home Sam supplies WAV MIME and finalized streaming lengths to the player', () async {
    final wav = wrapPcm16AsWav(Uint8List(480), sampleRate: 24000);
    final data = ByteData.sublistView(wav);
    data.setUint32(4, 0xffffffff, Endian.little);
    data.setUint32(40, 0xffffffff, Endian.little);
    await notifier.send('Question');
    expect(chat.scriptRequests, isEmpty);
    expect(chat.preparedFlags.single, isFalse);
    chat.requests.first.result.complete({
      'audioBase64': base64Encode(wav),
      'mimeType': 'audio/wav',
    });
    await _flush();
    final source = player.sources.single as BytesSource;
    expect(source.mimeType, 'audio/wav');
    final header = ByteData.sublistView(source.bytes);
    expect(header.getUint32(4, Endian.little), wav.length - 8);
    expect(header.getUint32(40, Endian.little), 480);
    expect(player.plays, 1);
    await notifier.close();
    chat.requests.last.result.complete(_tts);
  });

  test('all speeds apply to current and future segments and survive reopening', () async {
    for (final rate in [1, 2]) {
      await notifier.setSpeechRate(rate);
      expect(container.read(quickSamProvider).speechRate, rate);
      expect(player.rates.last, rate.toDouble());
    }
    await notifier.send('Question');
    chat.requests.first.result.complete(_tts);
    await _flush();
    expect(player.rates.last, 2);
    await notifier.setSpeechRate(1);
    chat.requests.last.result.complete(_tts);
    player.complete.add(null);
    await _flush();
    expect(player.rates.last, 1);
    await notifier.close();
    notifier.open();
    expect(container.read(quickSamProvider).speechRate, 1);
  });

  test('unsupported faster speeds are rejected without changing playback', () async {
    await expectLater(notifier.setSpeechRate(3), throwsArgumentError);
    await expectLater(notifier.setSpeechRate(4), throwsArgumentError);
    expect(container.read(quickSamProvider).speechRate, 1);
    expect(player.rates, isEmpty);
  });

  for (final action in ['stop', 'mute', 'close', 'new question']) {
    test('late TTS cannot play after $action', () async {
      await notifier.send('Question');
      final old = chat.requests.single;
      if (action == 'stop') {
        await notifier.toggleRecording();
        expect(container.read(quickSamProvider).recording, isFalse);
      } else if (action == 'mute') {
        await notifier.toggleMute();
        await notifier.toggleMute();
      } else if (action == 'close') {
        await notifier.close();
      } else {
        await notifier.send('New question');
      }
      old.result.complete(_tts);
      await _flush();
      expect(player.plays, 0);
    });
  }

  for (final action in ['stop', 'mute', 'close', 'new question']) {
    test('late regional preparation cannot start audio after $action', () async {
      final pending = Completer<Map<String, dynamic>>();
      chat.language = 'hi-IN';
      chat.pendingScript = pending;
      await notifier.send('Old question');
      expect(chat.scriptRequests.length, 1);
      expect(chat.requests, isEmpty);
      if (action == 'stop') {
        await notifier.toggleRecording();
      } else if (action == 'mute') {
        await notifier.toggleMute();
        await notifier.toggleMute();
      } else if (action == 'close') {
        await notifier.close();
      } else {
        chat.language = 'en-US';
        await notifier.send('New question');
      }
      final count = chat.requests.length;
      pending.complete({'speechText': chat.speechText});
      await _flush();
      expect(chat.requests.length, count);
      expect(player.plays, 0);
    });
  }

  test('regional preparation failure retains the written reply without English fallback', () async {
    chat.language = 'hi-IN';
    chat.scriptFailure = 'Spoken explanation verification failed';
    await notifier.send('Question');
    await _flush();
    expect(container.read(quickSamProvider).error, contains('voice is unavailable'));
    expect(container.read(quickSamProvider).messages.last.text, chat.reply);
    expect(chat.requests, isEmpty);
    expect(player.plays, 0);
  });

  test('mute stops current audio and drops already prefetched audio', () async {
    await notifier.send('Question');
    chat.requests.first.result.complete(_tts);
    await _flush();
    chat.requests.last.result.complete(_tts);
    await notifier.toggleMute();
    await _flush();
    expect(player.plays, 1);
    expect(player.stops, greaterThan(1));
  });

  test('TTS failures are visible while the complete text reply is retained', () async {
    await notifier.send('Question');
    chat.requests.first.result.completeError(StateError('TTS offline'));
    await _flush();
    expect(container.read(quickSamProvider).error, contains('voice is unavailable'));
    expect(container.read(quickSamProvider).messages.last.text, chat.reply);
    expect(player.plays, 0);
  });

  test('playback errors stop the pipeline and show feedback', () async {
    await notifier.send('Question');
    chat.requests.first.result.complete(_tts);
    await _flush();
    player.complete.addError(StateError('decoder failed'), StackTrace.current);
    await _flush();
    expect(container.read(quickSamProvider).error, contains('stopped unexpectedly'));
    chat.requests.last.result.complete(_tts);
    await _flush();
    expect(player.plays, 1);
  });
}
