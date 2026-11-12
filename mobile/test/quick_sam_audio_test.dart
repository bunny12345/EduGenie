import 'dart:async';
import 'dart:convert';

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
  final requests = <({String text, Completer<Map<String, dynamic>> result})>[];
  @override
  Future<Map<String, dynamic>> sendQuickChat({
    required String studentId,
    required String message,
    List<Map<String, String>> recentMessages = const [],
    CancelToken? cancelToken,
  }) async => {'reply': reply};
  @override
  Future<Map<String, dynamic>> generateLocalTtsAudio(
    String text,
    String studentId, {
    String targetLanguage = 'en-US',
    String? voice,
    double speed = 1,
    String? format,
  }) {
    expect(speed, 1);
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
  });
  tearDown(() async {
    container.dispose();
    await _flush();
  });

  test('short first segment preserves all speech and bounds synthesis requests', () {
    final text = 'A quick introduction. ${List.filled(100, 'More explanation').join(' ')}';
    final chunks = splitSamSpeech(text);
    expect(chunks.first, 'A quick introduction.');
    expect(chunks.first.length, lessThanOrEqualTo(240));
    expect(chunks.skip(1).every((chunk) => chunk.length <= 600), isTrue);
    expect(chunks.join(' '), text);
  });

  test('first audio starts before remaining synthesis completes; prefetched audio waits for completion', () async {
    await notifier.send('Question');
    expect(chat.requests.single.text, 'First short sentence.');
    expect(container.read(quickSamProvider).messages.last.text, chat.reply);
    chat.requests.first.result.complete(_tts);
    await _flush();
    expect(player.plays, 1);
    expect(chat.requests.length, 2);
    chat.requests.last.result.complete(_tts);
    await _flush();
    expect(player.plays, 1);
    player.complete.add(null);
    await _flush();
    expect(player.plays, 2);
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

  for (final action in ['mute', 'close', 'new question']) {
    test('late TTS cannot play after $action', () async {
      await notifier.send('Question');
      final old = chat.requests.single;
      if (action == 'mute') {
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
