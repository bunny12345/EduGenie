import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../models/quiz_rush_models.dart';
import '../../../state/session_provider.dart';
import '../../../state/student_providers.dart';
import 'game_widgets.dart';

enum _QrPhase { loading, picker, playing, summary, empty }

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}

/// Quiz Rush — mirrors `web/src/components/games/QuizRush.jsx` +
/// the `.eg-qr-*`/`.eg-fc-*` rules in `StudentGames.css` exactly (timed MCQ,
/// countdown bar, reveal colors, summary screen).
class QuizRushScreen extends ConsumerStatefulWidget {
  const QuizRushScreen({super.key});

  @override
  ConsumerState<QuizRushScreen> createState() => _QuizRushScreenState();
}

class _QuizRushScreenState extends ConsumerState<QuizRushScreen> {
  static const _questionCount = 10;
  static const _minQuestions = 3;
  static const _timePerQuestion = 15;
  static const _revealDelay = Duration(milliseconds: 1100);

  _QrPhase _phase = _QrPhase.loading;
  List<QuizRushSubject> _subjects = [];
  String? _activeSubjectKey;
  String? _error;

  String? _sessionSubjectKey;
  String? _sessionSubjectName;
  Color _sessionAccent = const Color(0xFFF59E0B);
  String _sessionTreeEmoji = '🌳';
  String _sessionScope = 'all';
  String? _sessionDeckId;
  String? _sessionChapterId;
  String _sessionChapterTitle = 'All chapters';

  List<QuizRushQuestion> _questions = [];
  int _currentIndex = 0;
  int? _selectedIndex;
  bool _revealed = false;
  int _score = 0;
  int _timeLeft = _timePerQuestion;
  int _startedAtMs = 0;
  bool _saving = false;

  Timer? _ticker;
  Timer? _advanceTimer;

  @override
  void initState() {
    super.initState();
    _loadOverview();
  }

  @override
  void dispose() {
    _ticker?.cancel();
    _advanceTimer?.cancel();
    super.dispose();
  }

  String get _studentId => ref.read(sessionProvider).value?.userId ?? '';

  Future<void> _loadOverview() async {
    _ticker?.cancel();
    _advanceTimer?.cancel();
    setState(() {
      _phase = _QrPhase.loading;
      _error = null;
    });
    try {
      final subs = await ref.read(studentApiServiceProvider).getQuizRushOverview(_studentId);
      setState(() {
        _subjects = subs;
        _activeSubjectKey = subs.isNotEmpty ? subs.first.subjectKey : null;
        _phase = subs.isNotEmpty ? _QrPhase.picker : _QrPhase.empty;
      });
    } catch (_) {
      setState(() {
        _error = 'Could not load Quiz Rush chapters.';
        _phase = _QrPhase.empty;
      });
    }
  }

  Future<void> _startGame(QuizRushSubject subject, QuizRushChapter? chapter) async {
    setState(() => _phase = _QrPhase.loading);
    try {
      final qs = await ref.read(studentApiServiceProvider).getQuizRushQuestions(
            _studentId,
            subject: subject.subjectKey,
            deckId: chapter?.deckId,
            scope: chapter != null ? 'deck' : 'all',
            limit: _questionCount,
          );
      if (qs.length < _minQuestions) {
        setState(() {
          _error = 'Not enough questions here yet — try another chapter.';
          _phase = _QrPhase.picker;
        });
        return;
      }
      setState(() {
        _sessionSubjectKey = subject.subjectKey;
        _sessionSubjectName = subject.displayName;
        _sessionAccent = subject.accent;
        _sessionTreeEmoji = subject.treeEmoji;
        _sessionScope = chapter != null ? 'deck' : 'all';
        _sessionDeckId = chapter?.deckId;
        _sessionChapterId = chapter?.chapterId;
        _sessionChapterTitle = chapter?.title ?? 'All chapters';
        _questions = qs;
        _currentIndex = 0;
        _selectedIndex = null;
        _revealed = false;
        _score = 0;
        _timeLeft = _timePerQuestion;
        _startedAtMs = DateTime.now().millisecondsSinceEpoch;
        _error = null;
        _phase = _QrPhase.playing;
      });
      _startTicker();
    } catch (_) {
      setState(() {
        _error = 'Could not start Quiz Rush.';
        _phase = _QrPhase.picker;
      });
    }
  }

  void _startTicker() {
    _ticker?.cancel();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted || _revealed) return;
      final next = (_timeLeft - 1).clamp(0, _timePerQuestion);
      setState(() => _timeLeft = next);
      if (next == 0) {
        _ticker?.cancel();
        _onReveal(null);
      }
    });
  }

  void _selectAnswer(int idx) {
    if (_revealed || _phase != _QrPhase.playing) return;
    _onReveal(idx);
  }

  void _onReveal(int? idx) {
    final current = _questions[_currentIndex];
    final isCorrect = idx != null && idx == current.correctIndex;
    _ticker?.cancel();
    setState(() {
      _selectedIndex = idx;
      _revealed = true;
      if (isCorrect) _score += 1;
    });
    _advanceTimer?.cancel();
    _advanceTimer = Timer(_revealDelay, _advance);
  }

  void _advance() {
    if (!mounted) return;
    final isLast = _currentIndex + 1 >= _questions.length;
    if (isLast) {
      _finishGame();
    } else {
      setState(() {
        _currentIndex += 1;
        _selectedIndex = null;
        _revealed = false;
        _timeLeft = _timePerQuestion;
      });
      _startTicker();
    }
  }

  Future<void> _finishGame() async {
    setState(() {
      _phase = _QrPhase.summary;
      _saving = true;
    });
    try {
      await ref.read(studentApiServiceProvider).logGameSession({
        'gameKey': 'quiz_rush',
        'subjectKey': _sessionSubjectKey,
        if (_sessionChapterId != null) 'chapterId': _sessionChapterId,
        'chapterScope': _sessionScope == 'deck' ? _sessionChapterTitle : 'all',
        'score': _score,
        'total': _questions.length,
        'durationMs': DateTime.now().millisecondsSinceEpoch - _startedAtMs,
        'meta': {'questions': _questions.length},
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
        : QuizRushChapter(deckId: _sessionDeckId!, chapterId: _sessionChapterId, title: _sessionChapterTitle, chapterNumber: 0, questionCount: 0);
    _startGame(subj, chapter);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF7F7FC),
      appBar: AppBar(title: const Text('Quiz Rush')),
      body: SafeArea(
        child: Padding(padding: const EdgeInsets.all(16), child: _buildPhase()),
      ),
    );
  }

  Widget _buildPhase() {
    switch (_phase) {
      case _QrPhase.loading:
        return const SizedBox.shrink();
      case _QrPhase.empty:
        return GameEmptyView(
          emoji: '⚡',
          title: 'No chapters ready yet',
          message: _error ?? "Quiz Rush appears automatically once a chapter's questions are generated — check back soon!",
          onRefresh: _loadOverview,
        );
      case _QrPhase.picker:
        return _buildPicker();
      case _QrPhase.playing:
        return _buildPlaying();
      case _QrPhase.summary:
        return _buildSummary();
    }
  }

  QuizRushSubject? get _activeSubject {
    for (final s in _subjects) {
      if (s.subjectKey == _activeSubjectKey) return s;
    }
    return null;
  }

  Widget _buildPicker() {
    final active = _activeSubject;
    return ListView(
      children: [
        const GamePickerHeader(title: 'Choose a subject', subtitle: 'Beat the clock with rapid-fire questions from your chapters.'),
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
                metaText: s.empty ? 'Coming soon' : '${s.totalQuestions} questions',
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
                  'Quiz Rush appears automatically once questions are generated for ${active.displayName}.',
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
            badges: [GameBadge(text: '${active.totalQuestions} questions')],
            highlight: true,
            onTap: () => _startGame(active, null),
          ),
          const SizedBox(height: 8),
          for (final ch in active.chapters) ...[
            GameChapterRow(
              accent: active.accent,
              title: ch.title,
              chapterNumber: ch.chapterNumber > 0 ? ch.chapterNumber : null,
              badges: [GameBadge(text: '${ch.questionCount} questions')],
              onTap: () => _startGame(active, ch),
            ),
            const SizedBox(height: 8),
          ],
        ],
      ],
    );
  }

  Widget _buildPlaying() {
    final current = _questions[_currentIndex];
    final timerPct = (_timeLeft / _timePerQuestion).clamp(0.0, 1.0);
    final diffColors = {
      'easy': (const Color(0xFF22A05A), const Color(0xFFE7F6EC)),
      'medium': (const Color(0xFFD98A10), const Color(0xFFFFF3DC)),
      'hard': (const Color(0xFFD9534F), const Color(0xFFFFE9E7)),
    };
    final diff = diffColors[current.difficulty];
    return ListView(
      children: [
        GamePlayHeader(
          treeEmoji: _sessionTreeEmoji,
          subjectName: _sessionSubjectName ?? '',
          chapterTitle: _sessionChapterTitle,
          onExit: () {
            _ticker?.cancel();
            _advanceTimer?.cancel();
            setState(() => _phase = _QrPhase.picker);
          },
        ),
        const SizedBox(height: 12),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('Question ${_currentIndex + 1} of ${_questions.length}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFF8B90B3))),
            Text('$_score correct', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFF8B90B3))),
          ],
        ),
        const SizedBox(height: 8),
        ClipRRect(
          borderRadius: BorderRadius.circular(999),
          child: Container(
            height: 6,
            color: const Color(0xFFF1F2F8),
            child: FractionallySizedBox(
              alignment: Alignment.centerLeft,
              widthFactor: timerPct,
              child: Container(color: _timeLeft <= 5 ? const Color(0xFFD9534F) : _sessionAccent),
            ),
          ),
        ),
        const SizedBox(height: 18),
        Container(
          padding: const EdgeInsets.fromLTRB(22, 26, 22, 22),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: const Color(0xFFE8E9F5)),
            gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Colors.white, Color(0xFFF7F6FF)]),
            boxShadow: const [BoxShadow(color: Color(0x1E3C3282), blurRadius: 36, offset: Offset(0, 16))],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (diff != null)
                Align(
                  alignment: Alignment.centerRight,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                    decoration: BoxDecoration(color: diff.$2, borderRadius: BorderRadius.circular(999)),
                    child: Text(current.difficulty.toUpperCase(), style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w800, letterSpacing: 0.5, color: diff.$1)),
                  ),
                ),
              const SizedBox(height: 8),
              Text(current.question, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: Color(0xFF26224F), height: 1.4)),
              const SizedBox(height: 20),
              for (var i = 0; i < current.options.length; i++) ...[
                _QuizOption(
                  text: current.options[i],
                  state: !_revealed
                      ? _QrOptionState.idle
                      : (i == current.correctIndex ? _QrOptionState.correct : (i == _selectedIndex ? _QrOptionState.wrong : _QrOptionState.dim)),
                  accent: _sessionAccent,
                  onTap: () => _selectAnswer(i),
                  disabled: _revealed,
                ),
                if (i != current.options.length - 1) const SizedBox(height: 10),
              ],
              if (_revealed && current.explanation.isNotEmpty) ...[
                const SizedBox(height: 16),
                Text('💡 ${current.explanation}', style: const TextStyle(fontSize: 12.5, color: Color(0xFF6D739C), height: 1.5)),
              ],
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildSummary() {
    final total = _questions.length;
    final pct = total > 0 ? ((_score / total) * 100).round() : 0;
    return ListView(
      children: [
        const SizedBox(height: 8),
        Center(child: GameSummaryEmoji(pct: pct)),
        const SizedBox(height: 8),
        const Center(child: Text('Rush complete!', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Color(0xFF2A2652)))),
        const SizedBox(height: 4),
        if (_sessionSubjectName != null)
          Center(child: Text('$_sessionSubjectName · $_sessionChapterTitle', style: const TextStyle(fontSize: 12, color: Color(0xFF7B81A6)))),
        const SizedBox(height: 16),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            GameStatBlock(value: '$_score', label: 'correct'),
            const SizedBox(width: 22),
            GameStatBlock(value: '$pct%', label: 'accuracy'),
            const SizedBox(width: 22),
            GameStatBlock(value: '$total', label: 'questions'),
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

enum _QrOptionState { idle, correct, wrong, dim }

class _QuizOption extends StatelessWidget {
  final String text;
  final _QrOptionState state;
  final Color accent;
  final VoidCallback onTap;
  final bool disabled;

  const _QuizOption({required this.text, required this.state, required this.accent, required this.onTap, required this.disabled});

  @override
  Widget build(BuildContext context) {
    Color border = const Color(0xFFE8E9F5);
    Color bg = Colors.white;
    Color textColor = const Color(0xFF2A2652);
    double opacity = 1;
    switch (state) {
      case _QrOptionState.idle:
        break;
      case _QrOptionState.correct:
        border = const Color(0xFF2A9D5C);
        bg = const Color(0xFFEEFAF1);
        textColor = const Color(0xFF1F7A45);
        break;
      case _QrOptionState.wrong:
        border = const Color(0xFFD9534F);
        bg = const Color(0xFFFFF0EF);
        textColor = const Color(0xFFB33A32);
        break;
      case _QrOptionState.dim:
        opacity = 0.55;
        break;
    }
    return Opacity(
      opacity: opacity,
      child: Material(
        color: bg,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: disabled ? null : onTap,
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
            decoration: BoxDecoration(borderRadius: BorderRadius.circular(14), border: Border.all(color: border, width: 1.5)),
            alignment: Alignment.centerLeft,
            child: Text(text, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: textColor)),
          ),
        ),
      ),
    );
  }
}
