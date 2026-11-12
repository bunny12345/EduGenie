import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/game_catalog_entry.dart';
import '../../state/student_providers.dart';
import '../../widgets/coming_soon_view.dart';
import '../../widgets/section_card.dart';
import '../../theme/app_colors.dart';
import 'games/game_widgets.dart';
import 'games/flashcards_screen.dart';
import 'games/memory_maze_screen.dart';
import 'games/quiz_rush_screen.dart';

/// Learning Arcade hub — mirrors `StudentGames.jsx` + `StudentGames.css`
/// exactly (hero card + game grid). Individual games (Flashcards, Quiz Rush,
/// Memory Maze) are built one at a time; tapping a live game currently opens
/// a stub until each is ported.
class StudentGamesScreen extends ConsumerWidget {
  const StudentGamesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final gamesAsync = ref.watch(gamesCatalogProvider);
    final greetingName = ref.watch(dashboardProvider).value?.greetingName;

    return Scaffold(
      backgroundColor: GameColors.of(context).background(const Color(0xFFF7F7FC)),
      appBar: AppBar(title: const Text('Games')),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(gamesCatalogProvider),
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _ArcadeHero(greetingName: greetingName),
            const SizedBox(height: 4),
            gamesAsync.when(
              loading: () => const SkeletonBox(height: 220),
              error: (e, _) => ErrorInline(message: 'Unable to load games: $e'),
              data: (games) => _GamesGrid(games: games),
            ),
          ],
        ),
      ),
    );
  }
}

class _ArcadeHero extends StatelessWidget {
  final String? greetingName;

  const _ArcadeHero({required this.greetingName});

  @override
  Widget build(BuildContext context) {
    return Container(
      clipBehavior: Clip.antiAlias,
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: GameColors.of(context).line(Color(0xFFE7E3FF))),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [GameColors.of(context).surface(Color(0xFFEFEAFF)), GameColors.of(context).surface(Color(0xFFF7F2FF)), GameColors.of(context).surface(Color(0xFFEAF4FF))],
          stops: [0.0, 0.5, 1.0],
        ),
      ),
      child: Stack(
        children: [
          Positioned(
            top: -60,
            right: -40,
            child: Container(
              width: 200,
              height: 200,
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [Color(0x477C5CFF), Colors.transparent],
                ),
              ),
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Learning Arcade 🎮',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: GameColors.of(context).text(Color(0xFF2A2360)),
                ),
              ),
              const SizedBox(height: 4),
              Text(
                greetingName != null && greetingName!.isNotEmpty
                    ? '$greetingName, pick a game and turn study time into play time.'
                    : 'Pick a game and turn study time into play time.',
                style: TextStyle(fontSize: 13, color: GameColors.of(context).muted(Color(0xFF6A6A9A))),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _GamesGrid extends StatelessWidget {
  final List<GameCatalogEntry> games;

  const _GamesGrid({required this.games});

  @override
  Widget build(BuildContext context) {
    if (games.isEmpty) {
      return Text(
        'No games available yet.',
        style: TextStyle(color: GameColors.of(context).muted(Color(0xFF9096B6)), fontSize: 13),
      );
    }
    return Column(
      children: [
        for (var i = 0; i < games.length; i += 2) ...[
          if (i > 0) const SizedBox(height: 14),
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(child: _GameCard(game: games[i])),
                const SizedBox(width: 14),
                Expanded(
                  child: i + 1 < games.length
                      ? _GameCard(game: games[i + 1])
                      : const SizedBox.shrink(),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _GameCard extends StatelessWidget {
  final GameCatalogEntry game;

  const _GameCard({required this.game});

  @override
  Widget build(BuildContext context) {
    final accent = game.accent;
    final iconBg = Color.alphaBlend(
      accent.withValues(alpha: 0.14),
      AppColors.of(context).card,
    );
    final statusBg = game.isLive
        ? Color.alphaBlend(accent.withValues(alpha: 0.16), AppColors.of(context).card)
        : GameColors.of(context).surface(Color(0xFFF1F2F8));
    final statusText = game.isLive
        ? GameColors.of(context).accent(accent)
        : GameColors.of(context).muted(const Color(0xFF9096B6));

    return Opacity(
      opacity: game.isLive ? 1 : 0.6,
      child: Material(
        color: AppColors.of(context).card,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: game.isLive
              ? () => Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => switch (game.gameKey) {
                      'flashcards' => const FlashcardsScreen(),
                      'quiz_rush' => const QuizRushScreen(),
                      'memory_maze' => const MemoryMazeScreen(),
                      _ => Scaffold(
                        appBar: AppBar(title: Text(game.title)),
                        body: ComingSoonView(
                          icon: Icons.videogame_asset_rounded,
                          title: game.title,
                          subtitle: 'This game is coming to the app soon.',
                        ),
                      ),
                    },
                  ),
                )
              : null,
          child: Container(
            clipBehavior: Clip.antiAlias,
            padding: const EdgeInsets.fromLTRB(16, 18, 16, 14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: GameColors.of(context).line(Color(0xFFE8E9F5))),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  height: 4,
                  decoration: BoxDecoration(
                    color: accent.withValues(alpha: 0.9),
                  ),
                ),
                const SizedBox(height: 10),
                Container(
                  width: 54,
                  height: 54,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: iconBg,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Text(game.icon, style: const TextStyle(fontSize: 34)),
                ),
                const SizedBox(height: 6),
                Text(
                  game.title,
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: GameColors.of(context).text(Color(0xFF26224F)),
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  game.tagline,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 11.5,
                    color: GameColors.of(context).muted(Color(0xFF6D739C)),
                    height: 1.35,
                  ),
                ),
                const SizedBox(height: 12),
                Container(
                  margin: const EdgeInsets.only(top: 4),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: statusBg,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    game.isLive ? '▶ Play' : '🔒 Coming soon',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      color: statusText,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
