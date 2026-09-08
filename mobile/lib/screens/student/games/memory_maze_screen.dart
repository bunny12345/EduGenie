import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../models/flashcard_models.dart';
import '../../../state/session_provider.dart';
import '../../../state/student_providers.dart';
import 'game_widgets.dart';

enum _MmPhase { loading, picker, playing, summary, empty }

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}

class _MazeTile {
  final String id;
  final String pairId;
  final String text;
  final String side; // 'q' | 'a'

  _MazeTile({required this.id, required this.pairId, required this.text, required this.side});
}

List<T> _shuffled<T>(List<T> input) {
  final list = List<T>.from(input);
  final rng = Random();
  for (var i = list.length - 1; i > 0; i--) {
    final j = rng.nextInt(i + 1);
    final tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
  }
  return list;
}

/// Memory Maze — mirrors `web/src/components/games/MemoryMaze.jsx` + the
/// `.eg-mm-*`/`.eg-fc-*` rules in `StudentGames.css` exactly. Reuses the same
/// flashcard content/endpoints as AI Flashcards (no separate content pipeline).
class MemoryMazeScreen extends ConsumerStatefulWidget {
  const MemoryMazeScreen({super.key});

  @override
  ConsumerState<MemoryMazeScreen> createState() => _MemoryMazeScreenState();
}

class _MemoryMazeScreenState extends ConsumerState<MemoryMazeScreen> {
  static const _pairCount = 8;
  static const _minPairs = 3;
  static const _mismatchDelay = Duration(milliseconds: 850);

  _MmPhase _phase = _MmPhase.loading;
  List<FlashcardSubject> _subjects = [];
  String? _activeSubjectKey;
  String? _error;

  String? _sessionSubjectKey;
  String? _sessionSubjectName;
  Color _sessionAccent = const Color(0xFFEC4899);
  String _sessionTreeEmoji = '🌳';
  String _sessionScope = 'all';
  String? _sessionDeckId;
  String? _sessionChapterId;
  String _sessionChapterTitle = 'All chapters';
  int _totalPairs = 0;

  List<_MazeTile> _tiles = [];
  final List<String> _flippedIds = [];
  final Set<String> _matchedPairIds = {};
  final Set<String> _cleanPairIds = {};
  final Set<String> _missedPairIds = {};
  int _moves = 0;
  bool _locked = false;
  int _startedAtMs = 0;
  bool _saving = false;

  Timer? _mismatchTimer;

  @override
  void initState() {
    super.initState();
    _loadOverview();
  }

  @override
  void dispose() {
    _mismatchTimer?.cancel();
    super.dispose();
  }

  String get _studentId => ref.read(sessionProvider).value?.userId ?? '';

  Future<void> _loadOverview() async {
    _mismatchTimer?.cancel();
    setState(() {
      _phase = _MmPhase.loading;
      _error = null;
    });
    try {
      final subs = await ref.read(studentApiServiceProvider).getFlashcardOverview(_studentId);
      setState(() {
        _subjects = subs;
        _activeSubjectKey = subs.isNotEmpty ? subs.first.subjectKey : null;
        _phase = subs.isNotEmpty ? _MmPhase.picker : _MmPhase.empty;
      });
    } catch (_) {
      setState(() {
        _error = 'Could not load Memory Maze chapters.';
        _phase = _MmPhase.empty;
      });
    }
  }

  Future<void> _startGame(FlashcardSubject subject, FlashcardChapter? chapter) async {
    setState(() => _phase = _MmPhase.loading);
    try {
      final cards = await ref.read(studentApiServiceProvider).getFlashcardCards(
            _studentId,
            subject: subject.subjectKey,
            deckId: chapter?.deckId,
            scope: chapter != null ? 'deck' : 'all',
            mode: 'all',
            limit: _pairCount,
          );
      if (cards.length < _minPairs) {
        setState(() {
          _error = 'Not enough cards here yet for a memory match — try another chapter.';
          _phase = _MmPhase.picker;
        });
        return;
      }
      final tiles = _shuffled(cards.expand((c) => [
            _MazeTile(id: '${c.flashcardId}-q', pairId: c.flashcardId, text: c.front, side: 'q'),
            _MazeTile(id: '${c.flashcardId}-a', pairId: c.flashcardId, text: c.back, side: 'a'),
          ]).toList());
      setState(() {
        _sessionSubjectKey = subject.subjectKey;
        _sessionSubjectName = subject.displayName;
        _sessionAccent = subject.accent;
        _sessionTreeEmoji = subject.treeEmoji;
        _sessionScope = chapter != null ? 'deck' : 'all';
        _sessionDeckId = chapter?.deckId;
        _sessionChapterId = chapter?.chapterId;
        _sessionChapterTitle = chapter?.title ?? 'All chapters';
        _totalPairs = cards.length;
        _tiles = tiles;
        _flippedIds.clear();
        _matchedPairIds.clear();
        _cleanPairIds.clear();
        _missedPairIds.clear();
        _moves = 0;
        _locked = false;
        _startedAtMs = DateTime.now().millisecondsSinceEpoch;
        _error = null;
        _phase = _MmPhase.playing;
      });
    } catch (_) {
      setState(() {
        _error = 'Could not start Memory Maze.';
        _phase = _MmPhase.picker;
      });
    }
  }

  void _flipTile(_MazeTile tile) {
    if (_locked) return;
    if (_matchedPairIds.contains(tile.pairId)) return;
    if (_flippedIds.contains(tile.id)) return;
    if (_flippedIds.length == 2) return;

    setState(() => _flippedIds.add(tile.id));
    if (_flippedIds.length < 2) return;

    final firstId = _flippedIds[0];
    final secondId = _flippedIds[1];
    final first = _tiles.firstWhere((t) => t.id == firstId);
    final second = _tiles.firstWhere((t) => t.id == secondId);
    final isMatch = first.pairId == second.pairId && first.side != second.side;
    final nextMoves = _moves + 1;

    if (isMatch) {
      final pairId = first.pairId;
      final wasClean = !_missedPairIds.contains(pairId);
      setState(() {
        _moves = nextMoves;
        _matchedPairIds.add(pairId);
        if (wasClean) _cleanPairIds.add(pairId);
        _flippedIds.clear();
      });
      if (_matchedPairIds.length == _totalPairs) {
        _finishGame();
      }
    } else {
      setState(() {
        _moves = nextMoves;
        _locked = true;
        _missedPairIds.addAll([first.pairId, second.pairId]);
      });
      _mismatchTimer?.cancel();
      _mismatchTimer = Timer(_mismatchDelay, () {
        if (!mounted) return;
        setState(() {
          _flippedIds.clear();
          _locked = false;
        });
      });
    }
  }

  Future<void> _finishGame() async {
    setState(() {
      _phase = _MmPhase.summary;
      _saving = true;
    });
    try {
      await ref.read(studentApiServiceProvider).logGameSession({
        'gameKey': 'memory_maze',
        'subjectKey': _sessionSubjectKey,
        if (_sessionChapterId != null) 'chapterId': _sessionChapterId,
        'chapterScope': _sessionScope == 'deck' ? _sessionChapterTitle : 'all',
        'score': _cleanPairIds.length,
        'total': _totalPairs,
        'durationMs': DateTime.now().millisecondsSinceEpoch - _startedAtMs,
        'meta': {'moves': _moves, 'pairs': _totalPairs},
      });
    } catch (_) {
      // non-fatal
    }
    if (mounted) setState(() => _saving = false);
  }

  void _playAgain() {
    final subj = _subjects.where((s) => s.subjectKey == _sessionSubjectKey).firstOrNull;
    if (subj == null) {
      _loadOverview();
      return;
    }
    final chapter = _sessionDeckId == null
        ? null
        : subj.chapters.where((c) => c.deckId == _sessionDeckId).firstOrNull;
    _startGame(subj, chapter);
  }

  FlashcardSubject? get _activeSubject {
    for (final s in _subjects) {
      if (s.subjectKey == _activeSubjectKey) return s;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF7F7FC),
      appBar: AppBar(title: const Text('Memory Maze')),
      body: SafeArea(
        child: Padding(padding: const EdgeInsets.all(16), child: _buildPhase()),
      ),
    );
  }

  Widget _buildPhase() {
    switch (_phase) {
      case _MmPhase.loading:
        return const SizedBox.shrink();
      case _MmPhase.empty:
        return GameEmptyView(
          emoji: '🌀',
          title: 'No chapters ready yet',
          message: _error ?? 'Memory Maze uses the same chapters as AI Flashcards — check back once your teacher uploads content!',
          onRefresh: _loadOverview,
        );
      case _MmPhase.picker:
        return _buildPicker();
      case _MmPhase.playing:
        return _buildPlaying();
      case _MmPhase.summary:
        return _buildSummary();
    }
  }

  Widget _buildPicker() {
    final active = _activeSubject;
    return ListView(
      children: [
        const GamePickerHeader(title: 'Choose a subject', subtitle: 'Flip tiles to pair each question with its answer.'),
        const SizedBox(height: 14),
        SizedBox(
          height: 92,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: _subjects.length,
            separatorBuilder: (_, _) => const SizedBox(width: 10),
            itemBuilder: (context, i) {
              final s = _subjects[i];
              return GameSubjectTab(
                accent: s.accent,
                treeEmoji: s.treeEmoji,
                displayName: s.displayName,
                metaText: s.empty ? 'Coming soon' : '${s.totalCards} cards',
                active: s.subjectKey == _activeSubjectKey,
                onTap: () => setState(() {
                  _activeSubjectKey = s.subjectKey;
                  _error = null;
                }),
              );
            },
          ),
        ),
        const SizedBox(height: 16),
        if (_error != null) GameInlineNote(message: _error!),
        if (active != null && active.chapters.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 34, horizontal: 20),
            child: Column(
              children: [
                Text(active.treeEmoji, style: const TextStyle(fontSize: 46)),
                const SizedBox(height: 10),
                Text('No ${active.displayName} chapters yet', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Color(0xFF2A2652))),
                const SizedBox(height: 6),
                Text(
                  'Memory Maze appears automatically once flashcards exist for ${active.displayName}.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 12.5, color: Color(0xFF6D739C), height: 1.5),
                ),
              ],
            ),
          )
        else if (active != null) ...[
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('${active.treeEmoji} ${active.displayName} chapters', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: Color(0xFF2A2652))),
              Text('${active.chapters.length} uploaded', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: active.accent)),
            ],
          ),
          const SizedBox(height: 8),
          GameChapterRow(
            accent: active.accent,
            title: '🎲 All chapters',
            sub: 'Random mix from ${active.displayName}',
            badges: [GameBadge(text: '${active.totalCards} cards')],
            highlight: true,
            onTap: () => _startGame(active, null),
          ),
          const SizedBox(height: 8),
          for (final ch in active.chapters) ...[
            GameChapterRow(
              accent: active.accent,
              title: ch.title,
              chapterNumber: ch.chapterNumber > 0 ? ch.chapterNumber : null,
              badges: [GameBadge(text: '${ch.cardCount} cards')],
              onTap: () => _startGame(active, ch),
            ),
            const SizedBox(height: 8),
          ],
        ],
      ],
    );
  }

  Widget _buildPlaying() {
    return ListView(
      children: [
        GamePlayHeader(
          treeEmoji: _sessionTreeEmoji,
          subjectName: _sessionSubjectName ?? '',
          chapterTitle: _sessionChapterTitle,
          onExit: () {
            _mismatchTimer?.cancel();
            setState(() => _phase = _MmPhase.picker);
          },
        ),
        const SizedBox(height: 12),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('${_matchedPairIds.length} / $_totalPairs pairs', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFF8B90B3))),
            Text('$_moves flips', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFF8B90B3))),
          ],
        ),
        const SizedBox(height: 14),
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: _tiles.length,
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 3, crossAxisSpacing: 10, mainAxisSpacing: 10, childAspectRatio: 1),
          itemBuilder: (context, i) {
            final tile = _tiles[i];
            final isFlipped = _flippedIds.contains(tile.id);
            final isMatched = _matchedPairIds.contains(tile.pairId);
            return _MazeTileView(
              tile: tile,
              accent: _sessionAccent,
              revealed: isFlipped || isMatched,
              matched: isMatched,
              onTap: () => _flipTile(tile),
            );
          },
        ),
      ],
    );
  }

  Widget _buildSummary() {
    final pct = _totalPairs > 0 ? ((_cleanPairIds.length / _totalPairs) * 100).round() : 0;
    return ListView(
      children: [
        const SizedBox(height: 8),
        Center(child: GameSummaryEmoji(pct: pct)),
        const SizedBox(height: 8),
        const Center(child: Text('Maze cleared!', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Color(0xFF2A2652)))),
        const SizedBox(height: 4),
        if (_sessionSubjectName != null)
          Center(child: Text('$_sessionSubjectName · $_sessionChapterTitle', style: const TextStyle(fontSize: 12, color: Color(0xFF7B81A6)))),
        const SizedBox(height: 16),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            GameStatBlock(value: '$_totalPairs', label: 'pairs matched'),
            const SizedBox(width: 22),
            GameStatBlock(value: '$pct%', label: 'clean matches'),
            const SizedBox(width: 22),
            GameStatBlock(value: '$_moves', label: 'total flips'),
          ],
        ),
        const SizedBox(height: 16),
        Center(
          child: Text(
            _saving ? 'Saving your progress…' : '✅ Progress saved to your Orchard tree.',
            style: const TextStyle(fontSize: 12, color: Color(0xFF6A7099)),
          ),
        ),
        const SizedBox(height: 16),
        Wrap(
          alignment: WrapAlignment.center,
          spacing: 10,
          runSpacing: 10,
          children: [
            GameGhostButton(label: '🔁 Play again', onTap: _playAgain),
            GamePrimaryButton(label: 'Pick another chapter', onTap: _loadOverview),
          ],
        ),
      ],
    );
  }
}

class _MazeTileView extends StatelessWidget {
  final _MazeTile tile;
  final Color accent;
  final bool revealed;
  final bool matched;
  final VoidCallback onTap;

  const _MazeTileView({required this.tile, required this.accent, required this.revealed, required this.matched, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final isQuestionSide = tile.side == 'q';
    return Opacity(
      opacity: matched ? 0.55 : 1,
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: matched ? null : onTap,
          child: Container(
            padding: const EdgeInsets.all(6),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: revealed ? Color.alphaBlend(accent.withValues(alpha: 0.3), Colors.white) : const Color(0xFFE8E9F5)),
              gradient: revealed
                  ? LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: isQuestionSide
                          ? [Color.alphaBlend(accent.withValues(alpha: 0.12), Colors.white), Colors.white]
                          : [Colors.white, const Color(0xFFF7F6FF)],
                    )
                  : LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [accent, Color.alphaBlend(accent.withValues(alpha: 0.6), const Color(0xFF3B2FB0))],
                    ),
              boxShadow: revealed ? null : [BoxShadow(color: accent.withValues(alpha: 0.14), blurRadius: 14, offset: const Offset(0, 6))],
            ),
            child: revealed
                ? Text(
                    tile.text,
                    textAlign: TextAlign.center,
                    maxLines: 5,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF2A2652), height: 1.3),
                  )
                : const Text('🌀', style: TextStyle(fontSize: 24)),
          ),
        ),
      ),
    );
  }
}
