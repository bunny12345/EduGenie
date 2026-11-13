import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/models/session.dart';
import 'package:mobile/services/api_client.dart';
import 'package:mobile/services/chat_api_service.dart';
import 'package:mobile/state/exam_access_provider.dart';
import 'package:mobile/state/session_provider.dart';
import 'package:mobile/state/talk_to_sam_provider.dart';
import 'package:mobile/state/tutor_providers.dart';
import 'package:mobile/utils/wav_encoder.dart';

class _Session extends SessionNotifier {
  @override
  Future<Session?> build() async => const Session(role: 'student', userId: 'student', token: 'fixture');
}

class _Player implements AudioPlayer {
  final complete = StreamController<void>.broadcast();
  final sources = <Source>[];
  int plays = 0;
  bool failSource = false;
  @override
  Stream<PlayerState> get onPlayerStateChanged => const Stream.empty();
  @override
  Stream<Duration> get onPositionChanged => const Stream.empty();
  @override
  Stream<Duration> get onDurationChanged => const Stream.empty();
  @override
  Stream<void> get onPlayerComplete => complete.stream;
  @override
  Future<void> setSource(Source source) async {
    if (failSource) throw StateError('decoder failed');
    sources.add(source);
  }
  @override
  Future<void> resume() async => plays++;
  @override
  Future<void> stop() async {}
  @override
  Future<void> dispose() async => complete.close();
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _Chat extends ChatApiService {
  _Chat() : super(ApiClient());
  final requests = <Completer<Map<String, dynamic>>>[];
  @override
  Future<Map<String, dynamic>> generateLocalTtsAudio(
    String text, String studentId, {
    String targetLanguage = 'en-US', String? voice, double speed = 1, String? format,
  }) {
    final result = Completer<Map<String, dynamic>>();
    requests.add(result);
    return result.future;
  }
}

Map<String, dynamic> _tts() {
  final wav = wrapPcm16AsWav(Uint8List(480), sampleRate: 24000);
  final header = ByteData.sublistView(wav);
  header.setUint32(4, 0xffffffff, Endian.little);
  header.setUint32(40, 0xffffffff, Endian.little);
  return {'audioBase64': base64Encode(wav), 'mimeType': 'audio/wav'};
}

Future<void> _flush() => Future<void>.delayed(Duration.zero);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late ProviderContainer container;
  late _Player player;
  late _Chat chat;
  late TalkToSamNotifier notifier;
  setUp(() async {
    player = _Player();
    chat = _Chat();
    container = ProviderContainer(overrides: [
      sessionProvider.overrideWith(_Session.new),
      talkToSamAudioPlayerProvider.overrideWithValue(player),
      chatApiServiceProvider.overrideWithValue(chat),
      examAccessProvider.overrideWith((ref) => Stream.value(const ExamAccess())),
    ]);
    await container.read(sessionProvider.future);
    container.listen(examAccessProvider, (_, _) {});
    await container.read(examAccessProvider.future);
    notifier = container.read(talkToSamProvider.notifier);
  });
  tearDown(() {
    container.dispose();
  });

  test('Tutor uses finalized WAV with MIME and waits for real completion', () async {
    final speaking = notifier.speak('Hello', messageId: 'message');
    chat.requests.single.complete(_tts());
    await _flush();
    final source = player.sources.single as BytesSource;
    expect(source.mimeType, 'audio/wav');
    final header = ByteData.sublistView(source.bytes);
    expect(header.getUint32(4, Endian.little), source.bytes.length - 8);
    expect(header.getUint32(40, Endian.little), 480);
    expect(container.read(talkToSamProvider).playingMessageId, 'message');
    player.complete.add(null);
    await speaking;
    expect(container.read(talkToSamProvider).speaking, isFalse);
    expect(container.read(talkToSamProvider).error, isNull);
  });

  for (final eventError in [false, true]) {
    test('Tutor surfaces ${eventError ? 'asynchronous' : 'source'} decoder errors', () async {
      player.failSource = !eventError;
      final speaking = notifier.speak('Hello', messageId: 'message');
      chat.requests.single.complete(_tts());
      await _flush();
      if (eventError) player.complete.addError(StateError('decoder failed'), StackTrace.current);
      await speaking;
      expect(container.read(talkToSamProvider).error, contains('voice is unavailable'));
      expect(container.read(talkToSamProvider).speaking, isFalse);
      expect(container.read(talkToSamProvider).playingMessageId, isNull);
      expect(player.complete.hasListener, isFalse);
    });
  }

  test('stopping pending synthesis prevents late Tutor playback', () async {
    final speaking = notifier.speak('Hello');
    notifier.stopSpeaking();
    chat.requests.single.complete(_tts());
    await speaking;
    expect(player.plays, 0);
  });

  test('stopping playback releases the completion wait and drops queued speech', () async {
    final speaking = notifier.speak('Hello');
    chat.requests.single.complete(_tts());
    await _flush();
    await notifier.speak('Queued');
    notifier.stopSpeaking();
    await speaking;
    expect(chat.requests.length, 1);
    expect(player.complete.hasListener, isFalse);
    expect(container.read(talkToSamProvider).speaking, isFalse);
  });
}
