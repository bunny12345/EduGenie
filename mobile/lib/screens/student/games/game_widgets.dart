import 'package:flutter/material.dart';

/// Shared, reusable UI pieces ported from `.eg-fc-*` rules in
/// `web/src/components/StudentGames.css` — used across Quiz Rush and Memory
/// Maze (Flashcards keeps its own private copies since it shipped first).

class GameSubjectTab extends StatelessWidget {
  final Color accent;
  final String treeEmoji;
  final String displayName;
  final String metaText;
  final bool active;
  final VoidCallback onTap;

  const GameSubjectTab({
    super.key,
    required this.accent,
    required this.treeEmoji,
    required this.displayName,
    required this.metaText,
    required this.active,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
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
            Text(treeEmoji, style: const TextStyle(fontSize: 26)),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(displayName, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: Color(0xFF2A2652))),
                  const SizedBox(height: 2),
                  Text(metaText, style: const TextStyle(fontSize: 11, color: Color(0xFF7B81A6))),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

enum GameBadgeKind { normal, due, newItem }

class GameBadge {
  final String text;
  final GameBadgeKind kind;

  GameBadge({required this.text, this.kind = GameBadgeKind.normal});
}

class GameChapterRow extends StatelessWidget {
  final Color accent;
  final String title;
  final String? sub;
  final int? chapterNumber;
  final List<GameBadge> badges;
  final bool highlight;
  final VoidCallback onTap;

  const GameChapterRow({
    super.key,
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
                        color: b.kind == GameBadgeKind.due
                            ? const Color(0xFFFFE9E7)
                            : b.kind == GameBadgeKind.newItem
                                ? const Color(0xFFE7F6EC)
                                : const Color(0xFFF1F2F8),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        b.text,
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: b.kind == GameBadgeKind.due
                              ? const Color(0xFFD9534F)
                              : b.kind == GameBadgeKind.newItem
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

class GameInlineNote extends StatelessWidget {
  final String message;

  const GameInlineNote({super.key, required this.message});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF6E6),
        border: Border.all(color: const Color(0xFFFFE2B0)),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(message, style: const TextStyle(color: Color(0xFF9A6A12), fontSize: 12)),
    );
  }
}

class GameEmptyView extends StatelessWidget {
  final String emoji;
  final String title;
  final String message;
  final VoidCallback onRefresh;

  const GameEmptyView({super.key, required this.emoji, required this.title, required this.message, required this.onRefresh});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(emoji, style: const TextStyle(fontSize: 52)),
            const SizedBox(height: 8),
            Text(title, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Color(0xFF2A2652))),
            const SizedBox(height: 4),
            Text(message, textAlign: TextAlign.center, style: const TextStyle(fontSize: 13, color: Color(0xFF6D739C), height: 1.5)),
            const SizedBox(height: 16),
            GameGhostButton(label: 'Refresh', onTap: onRefresh),
          ],
        ),
      ),
    );
  }
}

class GameStatBlock extends StatelessWidget {
  final String value;
  final String label;

  const GameStatBlock({super.key, required this.value, required this.label});

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

class GamePrimaryButton extends StatelessWidget {
  final String label;
  final VoidCallback onTap;

  const GamePrimaryButton({super.key, required this.label, required this.onTap});

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

class GameGhostButton extends StatelessWidget {
  final String label;
  final bool small;
  final VoidCallback onTap;

  const GameGhostButton({super.key, required this.label, this.small = false, required this.onTap});

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

class GamePickerHeader extends StatelessWidget {
  final String title;
  final String subtitle;

  const GamePickerHeader({super.key, required this.title, required this.subtitle});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Color(0xFF2A2652))),
        const SizedBox(height: 2),
        Text(subtitle, style: const TextStyle(fontSize: 12, color: Color(0xFF7B81A6))),
      ],
    );
  }
}

class GamePlayHeader extends StatelessWidget {
  final String treeEmoji;
  final String subjectName;
  final String chapterTitle;
  final VoidCallback onExit;

  const GamePlayHeader({super.key, required this.treeEmoji, required this.subjectName, required this.chapterTitle, required this.onExit});

  @override
  Widget build(BuildContext context) {
    return Row(
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
        GameGhostButton(label: 'Exit', small: true, onTap: onExit),
      ],
    );
  }
}

class GameSummaryEmoji extends StatelessWidget {
  final int pct;

  const GameSummaryEmoji({super.key, required this.pct});

  @override
  Widget build(BuildContext context) {
    final emoji = pct >= 80 ? '🏆' : (pct >= 50 ? '🌟' : '💪');
    return Text(emoji, style: const TextStyle(fontSize: 52));
  }
}
