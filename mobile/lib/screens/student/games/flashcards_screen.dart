import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../models/flashcard_models.dart';
import '../../../state/session_provider.dart';
import '../../../state/student_providers.dart';

enum _FcPhase { loading, picker, playing, summary, empty }

/// AI Flashcards — mirrors `web/src/components/games/Flashcards.jsx` +
/// the `.eg-fc-*` rules in `web/src/components/StudentGames.css` exactly
/// (picker grid, flip card, rate buttons, summary screen, colors).
class FlashcardsScreen extends ConsumerStatefulWidget {
  const FlashcardsScreen({super.key});

  @override
  ConsumerState<FlashcardsScreen> createState() => _FlashcardsScreenState();
}

class _FlashcardsScreenState extends ConsumerState<FlashcardsScreen> {
  _FcPhase _phase = _FcPhase.loading;
  List<FlashcardSubject> _subjects = [];
  String? _activeSubjectKey;
  String _mode = 'review'; // review | all
  String? _error;

  String? _sessionSubjectKey;
  String? _sessionSubjectName;
  Color _sessionAccent = const Color(0xFF6D5EFC);
  String _sessionTreeEmoji = '🌳';
  String _sessionScope = 'all';
  String? _sessionDeckId;
  String? _sessionChapterId;
  String _sessionChapterTitle = 'All chapters';

  List<FlashcardCard> _queue = [];
  FlashcardCard? _current;
  bool _flipped = false;
  int _attempts = 0;
  int _correct = 0;
  int _done = 0;
  int _totalToStudy = 0;
  FlashcardSchedule? _lastSchedule;
  int _startedAtMs = 0;
  bool _saving = false;
  Map<String, dynamic>? _coinAward;

  @override
  void initState() {
    super.initState();
    _loadOverview();
  }

  String get _studentId => ref.read(sessionProvider).value?.userId ?? '';

  Future<void> _loadOverview() async {
    setState(() {
      _phase = _FcPhase.loading;
      _error = null;
    });
    try {
      final subs = await ref.read(studentApiServiceProvider).getFlashcardOverview(_studentId);
      setState(() {
        _subjects = subs;
        _activeSubjectKey = subs.isNotEmpty ? subs.first.subjectKey : null;
        _phase = subs.isNotEmpty ? _FcPhase.picker : _FcPhase.empty;
      });
    } catch (_) {
      setState(() {
        _error = 'Could not load your flashcards.';
        _phase = _FcPhase.empty;
      });
    }
  }

  Future<void> _startSession(FlashcardSubject subject, FlashcardChapter? chapter, {String? modeOverride}) async {
    final useMode = modeOverride ?? _mode;
    setState(() => _phase = _FcPhase.loading);
    try {
      final cards = await ref.read(studentApiServiceProvider).getFlashcardCards(
            _studentId,
            subject: subject.subjectKey,
            deckId: chapter?.deckId,
            scope: chapter != null ? 'deck' : 'all',
            mode: useMode,
            limit: 20,
          );
      if (cards.isEmpty) {
        setState(() {
          _error = useMode == 'review' ? 'Nothing due right now — try Practice all!' : 'No cards here yet.';
          _phase = _FcPhase.picker;
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
        _queue = cards;
        _current = cards.first;
        _totalToStudy = cards.length;
        _attempts = 0;
        _correct = 0;
        _done = 0;
        _flipped = false;
        _lastSchedule = null;
        _coinAward = null;
        _startedAtMs = DateTime.now().millisecondsSinceEpoch;
        _error = null;
        _phase = _FcPhase.playing;
      });
    } catch (_) {
      setState(() {
        _error = 'Could not start the session.';
        _phase = _FcPhase.picker;
      });
    }
  }

  Future<void> _finishSession() async {
    setState(() {
      _phase = _FcPhase.summary;
      _saving = true;
    });
    try {
      await ref.read(studentApiServiceProvider).logGameSession({
        'gameKey': 'flashcards',
        'subjectKey': _sessionSubjectKey,
        if (_sessionChapterId != null) 'chapterId': _sessionChapterId,
        'chapterScope': _sessionScope == 'deck' ? _sessionChapterTitle : 'all',
        'score': _correct,
        'total': _attempts,
        'durationMs': DateTime.now().millisecondsSinceEpoch - _startedAtMs,
        'meta': {'cards': _done},
      });
      if (_sessionScope == 'deck' && _sessionDeckId != null) {
        final res = await ref.read(studentApiServiceProvider).completeFlashcardChapter(
              _studentId,
              _sessionDeckId!,
              subjectKey: _sessionSubjectKey,
              chapterTitle: _sessionChapterTitle,
            );
        if (mounted) {
          setState(() {
            _coinAward = {
              'awarded': (res['awarded'] as num?)?.toInt() ?? 0,
              'coins': (res['coins'] as num?)?.toInt() ?? 0,
              'alreadyEarned': res['alreadyEarned'] == true,
            };
          });
        }
      }
    } catch (_) {
      // non-fatal — session already advanced locally
    }
    if (mounted) setState(() => _saving = false);
  }

  Future<void> _rate(String rating) async {
    final card = _current;
    if (card == null) return;
    final gotIt = rating != 'again';

    FlashcardSchedule? schedule;
    try {
      final res = await ref.read(studentApiServiceProvider).submitFlashcardReview(card.flashcardId, rating);
      schedule = res;
    } catch (_) {
      // keep the session flowing even if the write hiccups
    }

    final nextAttempts = _attempts + 1;
    final nextCorrect = _correct + (gotIt ? 1 : 0);
    final nextDone = _done + (gotIt ? 1 : 0);

    final rest = _queue.sublist(1);
    final nextQueue = gotIt ? rest : [...rest, card];

    if (!mounted) return;
    setState(() {
      _attempts = nextAttempts;
      _correct = nextCorrect;
      _done = nextDone;
      _queue = nextQueue;
      _lastSchedule = gotIt ? schedule : null;
    });

    if (nextQueue.isEmpty) {
      setState(() => _current = null);
      _finishSession();
    } else {
      setState(() {
        _current = nextQueue.first;
        _flipped = false;
      });
    }
  }

  void _repeatChapter() {
    final subj = _subjects.where((s) => s.subjectKey == _sessionSubjectKey).firstOrNull;
    if (subj == null) {
      _loadOverview();
      return;
    }
    final chapter = _sessionDeckId == null
        ? null
        : subj.chapters.where((c) => c.deckId == _sessionDeckId).firstOrNull;
    _startSession(subj, chapter, modeOverride: 'all');
  }

  void _askTutorStub() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Opening this in AI Tutor is coming soon.')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF7F7FC),
      appBar: AppBar(title: const Text('AI Flashcards')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: _buildPhase(),
        ),
      ),
    );
  }

  Widget _buildPhase() {
    switch (_phase) {
      case _FcPhase.loading:
        return const SizedBox.shrink();
      case _FcPhase.empty:
        return _EmptyView(message: _error, onRefresh: _loadOverview);
      case _FcPhase.picker:
        return _PickerView(
          subjects: _subjects,
          activeSubjectKey: _activeSubjectKey,
          mode: _mode,
          error: _error,
          onSubjectTap: (key) => setState(() {
            _activeSubjectKey = key;
            _error = null;
          }),
          onModeChange: (m) => setState(() => _mode = m),
          onStartAll: (subject) => _startSession(subject, null),
          onStartChapter: (subject, chapter) => _startSession(subject, chapter),
        );
      case _FcPhase.playing:
        return _PlayingView(
          accent: _sessionAccent,
          treeEmoji: _sessionTreeEmoji,
          subjectName: _sessionSubjectName ?? '',
          chapterTitle: _sessionChapterTitle,
          current: _current,
          flipped: _flipped,
          done: _done,
          totalToStudy: _totalToStudy,
          queueLength: _queue.length,
          lastSchedule: _lastSchedule,
          onExit: () => setState(() => _phase = _FcPhase.picker),
          onFlip: () => setState(() => _flipped = !_flipped),
          onReveal: () => setState(() => _flipped = true),
          onRate: _rate,
          onAskTutor: _askTutorStub,
        );
      case _FcPhase.summary:
        return _SummaryView(
          subjectName: _sessionSubjectName,
          chapterTitle: _sessionChapterTitle,
          scope: _sessionScope,
          done: _done,
          attempts: _attempts,
          correct: _correct,
          saving: _saving,
          coinAward: _coinAward,
          onRepeatChapter: _repeatChapter,
          onPickAnother: _loadOverview,
        );
    }
  }
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}

class _EmptyView extends StatelessWidget {
  final String? message;
  final VoidCallback onRefresh;

  const _EmptyView({required this.message, required this.onRefresh});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('🃏', style: TextStyle(fontSize: 52)),
            const SizedBox(height: 8),
            const Text('No flashcards yet', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Color(0xFF2A2652))),
            const SizedBox(height: 4),
            Text(
              message ?? "Flashcards appear automatically once your teacher uploads chapter content. Check back soon!",
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 13, color: Color(0xFF6D739C), height: 1.5),
            ),
            const SizedBox(height: 16),
            _GhostButton(label: 'Refresh', onTap: onRefresh),
          ],
        ),
      ),
    );
  }
}

class _PickerView extends StatelessWidget {
  final List<FlashcardSubject> subjects;
  final String? activeSubjectKey;
  final String mode;
  final String? error;
  final void Function(String) onSubjectTap;
  final void Function(String) onModeChange;
  final void Function(FlashcardSubject) onStartAll;
  final void Function(FlashcardSubject, FlashcardChapter) onStartChapter;

  const _PickerView({
    required this.subjects,
    required this.activeSubjectKey,
    required this.mode,
    required this.error,
    required this.onSubjectTap,
    required this.onModeChange,
    required this.onStartAll,
    required this.onStartChapter,
  });

  FlashcardSubject? get _activeSubject {
    for (final s in subjects) {
      if (s.subjectKey == activeSubjectKey) return s;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final active = _activeSubject;
    return ListView(
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Choose a subject', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Color(0xFF2A2652))),
                  SizedBox(height: 2),
                  Text("Cards are built from your teacher's uploaded chapters.", style: TextStyle(fontSize: 12, color: Color(0xFF7B81A6))),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        Container(
          padding: const EdgeInsets.all(3),
          decoration: BoxDecoration(color: const Color(0xFFF0F1FB), borderRadius: BorderRadius.circular(999)),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              _ModeOption(label: '⏰ Review due', active: mode == 'review', onTap: () => onModeChange('review')),
              _ModeOption(label: '🔀 Practice all', active: mode == 'all', onTap: () => onModeChange('all')),
            ],
          ),
        ),
        const SizedBox(height: 16),
        if (error != null)
          Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: const Color(0xFFFFF6E6),
              border: Border.all(color: const Color(0xFFFFE2B0)),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text(error!, style: const TextStyle(color: Color(0xFF9A6A12), fontSize: 12)),
          ),
        SizedBox(
          height: 92,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: subjects.length,
            separatorBuilder: (_, _) => const SizedBox(width: 10),
            itemBuilder: (context, i) {
              final s = subjects[i];
              final isActive = s.subjectKey == activeSubjectKey;
              return _SubjectTab(subject: s, active: isActive, onTap: () => onSubjectTap(s.subjectKey));
            },
          ),
        ),
        const SizedBox(height: 16),
        if (active != null && active.chapters.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 34, horizontal: 20),
            child: Column(
              children: [
                Text(active.treeEmoji, style: const TextStyle(fontSize: 46)),
                const SizedBox(height: 10),
                Text('No ${active.displayName} chapters yet', style: const TextStyle(fontSize: 16, color: Color(0xFF2A2652), fontWeight: FontWeight.w700)),
                const SizedBox(height: 6),
                Text(
                  "Flashcards are created automatically as soon as your teacher uploads ${active.displayName} chapter content — just like Mathematics.",
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
          _ChapterRow(
            accent: active.accent,
            title: '🎲 All chapters',
            sub: 'Random mix from ${active.displayName}',
            badges: [
              _Badge(text: '${active.totalCards} cards'),
              if (active.dueCount > 0) _Badge(text: '${active.dueCount} due', kind: _BadgeKind.due),
            ],
            highlight: true,
            onTap: () => onStartAll(active),
          ),
          const SizedBox(height: 8),
          for (final ch in active.chapters) ...[
            _ChapterRow(
              accent: active.accent,
              title: ch.title,
              chapterNumber: ch.chapterNumber > 0 ? ch.chapterNumber : null,
              badges: [
                _Badge(text: '${ch.cardCount} cards'),
                if (ch.dueCount > 0) _Badge(text: '${ch.dueCount} due', kind: _BadgeKind.due),
                if (ch.newCount > 0) _Badge(text: '${ch.newCount} new', kind: _BadgeKind.newCard),
              ],
              onTap: () => onStartChapter(active, ch),
            ),
            const SizedBox(height: 8),
          ],
        ],
      ],
    );
  }
}

class _ModeOption extends StatelessWidget {
  final String label;
  final bool active;
  final VoidCallback onTap;

  const _ModeOption({required this.label, required this.active, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: active ? Colors.white : Colors.transparent,
      borderRadius: BorderRadius.circular(999),
      elevation: active ? 2 : 0,
      shadowColor: const Color(0x24463C96),
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          child: Text(
            label,
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: active ? const Color(0xFF4B3FD6) : const Color(0xFF6D739C)),
          ),
        ),
      ),
    );
  }
}

class _SubjectTab extends StatelessWidget {
  final FlashcardSubject subject;
  final bool active;
  final VoidCallback onTap;

  const _SubjectTab({required this.subject, required this.active, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final accent = subject.accent;
    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: onTap,
      child: Container(
        width: 168,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: active ? accent : const Color(0xFFE8E9F5), width: active ? 2 : 1),
          color: active ? Color.alphaBlend(accent.withValues(alpha: 0.12), Colors.white) : Colors.white,
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(subject.treeEmoji, style: const TextStyle(fontSize: 26)),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(subject.displayName, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: Color(0xFF2A2652))),
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          subject.empty ? 'Coming soon' : '${subject.totalCards} cards',
                          style: const TextStyle(fontSize: 11, color: Color(0xFF7B81A6)),
                        ),
                      ),
                      if (subject.dueCount > 0) ...[
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
                          decoration: BoxDecoration(color: const Color(0xFFFFE9E7), borderRadius: BorderRadius.circular(999)),
                          child: Text('${subject.dueCount} due', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: Color(0xFFD9534F))),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

enum _BadgeKind { normal, due, newCard }

class _Badge {
  final String text;
  final _BadgeKind kind;

  _Badge({required this.text, this.kind = _BadgeKind.normal});
}

class _ChapterRow extends StatelessWidget {
  final Color accent;
  final String title;
  final String? sub;
  final int? chapterNumber;
  final List<_Badge> badges;
  final bool highlight;
  final VoidCallback onTap;

  const _ChapterRow({
    required this.accent,
    required this.title,
    this.sub,
    this.chapterNumber,
    required this.badges,
    this.highlight = false,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: highlight ? Color.alphaBlend(accent.withValues(alpha: 0.08), Colors.white) : Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 13),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: highlight ? Color.alphaBlend(accent.withValues(alpha: 0.3), Colors.white) : const Color(0xFFE8E9F5)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  if (chapterNumber != null) ...[
                    Container(
                      width: 20,
                      height: 20,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(color: Color.alphaBlend(accent.withValues(alpha: 0.14), Colors.white), borderRadius: BorderRadius.circular(6)),
                      child: Text('$chapterNumber', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: accent)),
                    ),
                    const SizedBox(width: 8),
                  ],
                  Expanded(
                    child: Text(title, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: Color(0xFF2A2652))),
                  ),
                ],
              ),
              if (sub != null) ...[
                const SizedBox(height: 4),
                Text(sub!, style: const TextStyle(fontSize: 11, color: Color(0xFF7B81A6))),
              ],
              const SizedBox(height: 6),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final b in badges)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: b.kind == _BadgeKind.due
                            ? const Color(0xFFFFE9E7)
                            : b.kind == _BadgeKind.newCard
                                ? const Color(0xFFE7F6EC)
                                : const Color(0xFFF1F2F8),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        b.text,
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: b.kind == _BadgeKind.due
                              ? const Color(0xFFD9534F)
                              : b.kind == _BadgeKind.newCard
                                  ? const Color(0xFF22A05A)
                                  : const Color(0xFF6A7099),
                        ),
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PlayingView extends StatelessWidget {
  final Color accent;
  final String treeEmoji;
  final String subjectName;
  final String chapterTitle;
  final FlashcardCard? current;
  final bool flipped;
  final int done;
  final int totalToStudy;
  final int queueLength;
  final FlashcardSchedule? lastSchedule;
  final VoidCallback onExit;
  final VoidCallback onFlip;
  final VoidCallback onReveal;
  final void Function(String) onRate;
  final VoidCallback onAskTutor;

  const _PlayingView({
    required this.accent,
    required this.treeEmoji,
    required this.subjectName,
    required this.chapterTitle,
    required this.current,
    required this.flipped,
    required this.done,
    required this.totalToStudy,
    required this.queueLength,
    required this.lastSchedule,
    required this.onExit,
    required this.onFlip,
    required this.onReveal,
    required this.onRate,
    required this.onAskTutor,
  });

  @override
  Widget build(BuildContext context) {
    final progressPct = totalToStudy > 0 ? (done / totalToStudy).clamp(0.0, 1.0) : 0.0;
    return ListView(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              children: [
                Text(treeEmoji, style: const TextStyle(fontSize: 24)),
                const SizedBox(width: 10),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(subjectName, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Color(0xFF2A2652))),
                    Text(chapterTitle, style: const TextStyle(fontSize: 11, color: Color(0xFF7B81A6))),
                  ],
                ),
              ],
            ),
            _GhostButton(label: 'Exit', small: true, onTap: onExit),
          ],
        ),
        const SizedBox(height: 12),
        ClipRRect(
          borderRadius: BorderRadius.circular(999),
          child: Container(
            height: 8,
            color: const Color(0xFFECEEF7),
            child: FractionallySizedBox(
              alignment: Alignment.centerLeft,
              widthFactor: progressPct,
              child: Container(
                decoration: BoxDecoration(gradient: LinearGradient(colors: [accent, Color.alphaBlend(accent.withValues(alpha: 0.55), Colors.white)])),
              ),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.only(top: 6, bottom: 14),
          child: Text('$done / $totalToStudy mastered · $queueLength left', textAlign: TextAlign.right, style: const TextStyle(fontSize: 11, color: Color(0xFF8B90B3))),
        ),
        if (current != null) _FlipCard(accent: accent, card: current!, flipped: flipped, onTap: onFlip, onAskTutor: onAskTutor),
        const SizedBox(height: 18),
        if (!flipped)
          Center(
            child: Material(
              color: Colors.transparent,
              child: InkWell(
                borderRadius: BorderRadius.circular(999),
                onTap: onReveal,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 30, vertical: 12),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(999),
                    gradient: LinearGradient(colors: [accent, Color.alphaBlend(accent.withValues(alpha: 0.6), const Color(0xFF3B2FB0))]),
                    boxShadow: [BoxShadow(color: accent.withValues(alpha: 0.28), blurRadius: 20, offset: const Offset(0, 8))],
                  ),
                  child: const Text('Show answer', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 14)),
                ),
              ),
            ),
          )
        else
          Row(
            children: [
              Expanded(child: _RateButton(icon: '🔁', label: 'Again', color: const Color(0xFFD9534F), onTap: () => onRate('again'))),
              const SizedBox(width: 10),
              Expanded(child: _RateButton(icon: '✅', label: 'Got it', color: const Color(0xFF2A9D5C), onTap: () => onRate('good'))),
              const SizedBox(width: 10),
              Expanded(child: _RateButton(icon: '⚡', label: 'Easy', color: const Color(0xFFD98A10), onTap: () => onRate('easy'))),
            ],
          ),
        if (lastSchedule != null)
          Center(
            child: Container(
              margin: const EdgeInsets.only(top: 14),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              decoration: BoxDecoration(color: const Color(0xFFEFECFF), borderRadius: BorderRadius.circular(999)),
              child: Text('🗓️ Next review ${lastSchedule!.label}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFF4B3FD6))),
            ),
          ),
      ],
    );
  }
}

class _FlipCard extends StatefulWidget {
  final Color accent;
  final FlashcardCard card;
  final bool flipped;
  final VoidCallback onTap;
  final VoidCallback onAskTutor;

  const _FlipCard({required this.accent, required this.card, required this.flipped, required this.onTap, required this.onAskTutor});

  @override
  State<_FlipCard> createState() => _FlipCardState();
}

class _FlipCardState extends State<_FlipCard> with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 450));

  @override
  void initState() {
    super.initState();
    if (widget.flipped) _ctrl.value = 1;
  }

  @override
  void didUpdateWidget(covariant _FlipCard old) {
    super.didUpdateWidget(old);
    if (widget.flipped != old.flipped) {
      if (widget.flipped) {
        _ctrl.forward();
      } else {
        _ctrl.reverse();
      }
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: widget.onTap,
      child: SizedBox(
        height: 300,
        child: AnimatedBuilder(
          animation: _ctrl,
          builder: (context, _) {
            final angle = _ctrl.value * math.pi;
            final isBack = angle > math.pi / 2;
            final child = isBack
                ? Transform(alignment: Alignment.center, transform: Matrix4.identity()..rotateY(math.pi), child: _back())
                : _front();
            return Transform(
              alignment: Alignment.center,
              transform: Matrix4.identity()
                ..setEntry(3, 2, 0.001)
                ..rotateY(angle),
              child: child,
            );
          },
        ),
      ),
    );
  }

  Widget _front() {
    final card = widget.card;
    final diffColors = {
      'easy': (const Color(0xFF22A05A), const Color(0xFFE7F6EC)),
      'medium': (const Color(0xFFD98A10), const Color(0xFFFFF3DC)),
      'hard': (const Color(0xFFD9534F), const Color(0xFFFFE9E7)),
    };
    final diff = diffColors[card.difficulty];
    return Container(
      width: double.infinity,
      height: double.infinity,
      padding: const EdgeInsets.all(26),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFFE8E9F5)),
        gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Colors.white, Color(0xFFF7F6FF)]),
        boxShadow: const [BoxShadow(color: Color(0x1E3C3282), blurRadius: 36, offset: Offset(0, 16))],
      ),
      child: Stack(
        children: [
          if (diff != null)
            Positioned(
              top: 0,
              right: 0,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                decoration: BoxDecoration(color: diff.$2, borderRadius: BorderRadius.circular(999)),
                child: Text(card.difficulty.toUpperCase(), style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w800, letterSpacing: 0.5, color: diff.$1)),
              ),
            ),
          Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  decoration: BoxDecoration(color: const Color(0xFFF1F2F8), borderRadius: BorderRadius.circular(999)),
                  child: const Text('QUESTION', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: 1, color: Color(0xFF9096B6))),
                ),
                const SizedBox(height: 14),
                Text(card.front, textAlign: TextAlign.center, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w700, color: Color(0xFF26224F), height: 1.4)),
                if (card.hint != null && card.hint!.isNotEmpty) ...[
                  const SizedBox(height: 14),
                  Text('💡 ${card.hint}', textAlign: TextAlign.center, style: const TextStyle(fontSize: 12, color: Color(0xFF8A70C0))),
                ],
              ],
            ),
          ),
          const Positioned(
            bottom: 4,
            left: 0,
            right: 0,
            child: Center(child: Text('Tap to reveal', style: TextStyle(fontSize: 10.5, color: Color(0xFFB3B7D0)))),
          ),
        ],
      ),
    );
  }

  Widget _back() {
    final card = widget.card;
    final accent = widget.accent;
    return Container(
      width: double.infinity,
      height: double.infinity,
      padding: const EdgeInsets.all(26),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Color.alphaBlend(accent.withValues(alpha: 0.3), Colors.white)),
        gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color.alphaBlend(accent.withValues(alpha: 0.12), Colors.white), Colors.white]),
        boxShadow: const [BoxShadow(color: Color(0x1E3C3282), blurRadius: 36, offset: Offset(0, 16))],
      ),
      child: Stack(
        children: [
          Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  decoration: BoxDecoration(color: Color.alphaBlend(accent.withValues(alpha: 0.14), Colors.white), borderRadius: BorderRadius.circular(999)),
                  child: Text('ANSWER', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: 1, color: accent)),
                ),
                const SizedBox(height: 14),
                Text(card.back, textAlign: TextAlign.center, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w700, color: Color(0xFF26224F), height: 1.4)),
              ],
            ),
          ),
          Positioned(
            bottom: 4,
            left: 0,
            right: 0,
            child: Center(
              child: Material(
                color: Colors.white,
                borderRadius: BorderRadius.circular(999),
                child: InkWell(
                  borderRadius: BorderRadius.circular(999),
                  onTap: widget.onAskTutor,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(color: Color.alphaBlend(accent.withValues(alpha: 0.35), Colors.white)),
                    ),
                    child: Text('🤖 Ask AI to explain', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: accent)),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _RateButton extends StatelessWidget {
  final String icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  const _RateButton({required this.icon, required this.label, required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(14), border: Border.all(color: const Color(0xFFE8E9F5))),
          child: Column(
            children: [
              Text(icon, style: const TextStyle(fontSize: 20)),
              const SizedBox(height: 3),
              Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: color)),
            ],
          ),
        ),
      ),
    );
  }
}

class _SummaryView extends StatelessWidget {
  final String? subjectName;
  final String chapterTitle;
  final String scope;
  final int done;
  final int attempts;
  final int correct;
  final bool saving;
  final Map<String, dynamic>? coinAward;
  final VoidCallback onRepeatChapter;
  final VoidCallback onPickAnother;

  const _SummaryView({
    required this.subjectName,
    required this.chapterTitle,
    required this.scope,
    required this.done,
    required this.attempts,
    required this.correct,
    required this.saving,
    required this.coinAward,
    required this.onRepeatChapter,
    required this.onPickAnother,
  });

  @override
  Widget build(BuildContext context) {
    final pct = attempts > 0 ? ((correct / attempts) * 100).round() : 0;
    final emoji = pct >= 80 ? '🏆' : (pct >= 50 ? '🌟' : '💪');
    final awarded = (coinAward?['awarded'] as int?) ?? 0;
    final alreadyEarned = coinAward?['alreadyEarned'] == true;
    return ListView(
      children: [
        const SizedBox(height: 8),
        Center(child: Text(emoji, style: const TextStyle(fontSize: 52))),
        const SizedBox(height: 8),
        const Center(child: Text('Session complete!', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Color(0xFF2A2652)))),
        const SizedBox(height: 4),
        if (subjectName != null)
          Center(child: Text('$subjectName · $chapterTitle', style: const TextStyle(fontSize: 12, color: Color(0xFF7B81A6)))),
        const SizedBox(height: 16),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            _StatBlock(value: '$done', label: 'cards mastered'),
            const SizedBox(width: 22),
            _StatBlock(value: '$pct%', label: 'accuracy'),
            const SizedBox(width: 22),
            _StatBlock(value: '$attempts', label: 'total flips'),
          ],
        ),
        const SizedBox(height: 16),
        if (awarded > 0)
          Center(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
              margin: const EdgeInsets.only(bottom: 14),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: const Color(0xFFF4D780)),
                gradient: const LinearGradient(colors: [Color(0xFFFFF5D6), Color(0xFFFFE9A8)]),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text('🪙', style: TextStyle(fontSize: 34)),
                  const SizedBox(width: 12),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('+$awarded coins!', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: Color(0xFFA06A00))),
                      Text('Chapter complete — balance ${coinAward?['coins'] ?? 0}', style: const TextStyle(fontSize: 11.5, color: Color(0xFFB07F1A))),
                    ],
                  ),
                ],
              ),
            ),
          )
        else if (awarded == 0 && alreadyEarned)
          const Center(
            child: Padding(
              padding: EdgeInsets.only(bottom: 14),
              child: Text('🪙 Chapter bonus already collected — nice revision!', style: TextStyle(fontSize: 12, color: Color(0xFFA07F2A))),
            ),
          ),
        Center(
          child: Text(
            saving ? 'Saving your progress…' : '✅ Progress saved — cards will return on their own schedule.',
            style: const TextStyle(fontSize: 12, color: Color(0xFF6A7099)),
          ),
        ),
        const SizedBox(height: 16),
        Wrap(
          alignment: WrapAlignment.center,
          spacing: 10,
          runSpacing: 10,
          children: [
            if (scope == 'deck') _GhostButton(label: '🔁 Repeat chapter', onTap: onRepeatChapter),
            _PrimaryButton(label: 'Pick another deck', onTap: onPickAnother),
          ],
        ),
      ],
    );
  }
}

class _StatBlock extends StatelessWidget {
  final String value;
  final String label;

  const _StatBlock({required this.value, required this.label});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(value, style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: Color(0xFF4B3FD6))),
        Text(label, style: const TextStyle(fontSize: 11, color: Color(0xFF8B90B3))),
      ],
    );
  }
}

class _PrimaryButton extends StatelessWidget {
  final String label;
  final VoidCallback onTap;

  const _PrimaryButton({required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            gradient: const LinearGradient(colors: [Color(0xFF6D5EFC), Color(0xFF4B3FB8)]),
            boxShadow: const [BoxShadow(color: Color(0x3D5A46C8), blurRadius: 18, offset: Offset(0, 8))],
          ),
          child: Text(label, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 13)),
        ),
      ),
    );
  }
}

class _GhostButton extends StatelessWidget {
  final String label;
  final bool small;
  final VoidCallback onTap;

  const _GhostButton({required this.label, this.small = false, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: onTap,
        child: Container(
          padding: EdgeInsets.symmetric(horizontal: small ? 14 : 22, vertical: small ? 6 : 10),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(999), border: Border.all(color: const Color(0xFFE4E5F3))),
          child: Text(label, style: TextStyle(color: const Color(0xFF4A4F7A), fontWeight: FontWeight.w700, fontSize: small ? 12 : 13)),
        ),
      ),
    );
  }
}
