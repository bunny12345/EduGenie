import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'tree_art.dart';

/// Stage → emoji fallback, mirrors `STAGE_EMOJI` in
/// `web/src/components/orchard/treeAssets.js`.
const Map<String, String> kStageEmoji = {
  'seed': '🌰',
  'sprout': '🌱',
  'young_plant': '🌿',
  'growing_tree': '🌳',
  'mature_tree': '🌲',
  'blossom': '🌸',
  'fruit': '🍎',
  'golden_fruit': '✨',
};

const Map<String, String> kTreeTypeEmoji = {
  'oak': '🌳',
  'crystal': '🌲',
  'cherry_blossom': '🌸',
  'banyan': '🌳',
  'digital': '🌲',
  'mango': '🌴',
};

/// Renders shared natural-tree artwork and chapter-mastery fruit — mirrors
/// `TreeSprite.jsx` and `treeArt.js`. Tries the real bundled PNG at
/// `assets/orchard/<treeType>/<stage>.png` first (same asset pipeline as
/// web's `web/public/assets/orchard/`); if that stage/tree combo has no art
/// yet it falls back to a styled emoji placeholder, exactly like web.
class TreeSprite extends StatelessWidget {
  final String treeType;
  final String stage;
  final double size;
  final Color accentColor;
  final String health; // healthy | thirsty | wilting
  final int? masteredChapters;

  const TreeSprite({
    super.key,
    required this.treeType,
    required this.stage,
    this.size = 140,
    this.accentColor = const Color(0xFF22C55E),
    this.health = 'healthy',
    this.masteredChapters,
  });

  @override
  Widget build(BuildContext context) {
    final wilt = health == 'wilting'
        ? 0.55
        : health == 'thirsty'
        ? 0.8
        : 1.0;
    final count = math.max(0, masteredChapters ?? 0);
    final art = treeArt(treeType);
    final grownTree =
        art != null &&
        masteredChapters != null &&
        (count > 0 || ['blossom', 'fruit', 'golden_fruit'].contains(stage));
    final bakedOak = art?.assetType == 'oak';
    final artwork = grownTree
        ? (bakedOak && count > 0
              ? 'acorns_${math.min(count, 9)}'
              : 'fully_grown')
        : (art != null &&
                  !bakedOak &&
                  ['blossom', 'fruit', 'golden_fruit'].contains(stage)
              ? 'fully_grown'
              : stage);
    final assetType = art?.assetType ?? treeType;
    final assetPath = 'assets/orchard/$assetType/$artwork.png';
    final fruits = grownTree
        ? masteryFruitRects(count, size, bakedOak: bakedOak)
        : <Rect>[];

    return Semantics(
      label: grownTree
          ? '${bakedOak ? 'Oak' : art.fruitName} tree with $count ${art.fruitPlural} for $count mastered lessons'
          : '$treeType tree, $stage',
      image: true,
      child: SizedBox(
        width: size,
        height: size,
        child: _Desaturate(
          amount: 1 - wilt,
          child: Stack(
            children: [
              Image.asset(
                assetPath,
                width: size,
                height: size,
                fit: BoxFit.contain,
                excludeFromSemantics: true,
                errorBuilder: (context, error, stack) => _Placeholder(
                  stage: stage,
                  treeType: treeType,
                  size: size,
                  accentColor: accentColor,
                ),
              ),
              for (final fruit in fruits)
                Positioned(
                  left: fruit.left,
                  top: fruit.top,
                  width: fruit.width,
                  height: fruit.height,
                  child: Image.asset(
                    'assets/orchard/$assetType/${bakedOak ? 'acorn' : 'mastery_fruit'}.png',
                    fit: BoxFit.contain,
                    excludeFromSemantics: true,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Soft disc + stage emoji — shown only until real art is added for a given
/// tree type/stage, mirrors web's placeholder path in `TreeSprite.jsx`.
class _Placeholder extends StatelessWidget {
  final String stage;
  final String treeType;
  final double size;
  final Color accentColor;

  const _Placeholder({
    required this.stage,
    required this.treeType,
    required this.size,
    required this.accentColor,
  });

  @override
  Widget build(BuildContext context) {
    final emoji = kStageEmoji[stage] ?? kTreeTypeEmoji[treeType] ?? '🌱';
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: RadialGradient(
          center: const Alignment(0, -0.2),
          colors: [
            accentColor.withValues(alpha: 0.22),
            accentColor.withValues(alpha: 0.05),
            Colors.transparent,
          ],
          stops: const [0, 0.7, 1],
        ),
      ),
      child: Text(emoji, style: TextStyle(fontSize: size * 0.5, height: 1)),
    );
  }
}

/// Approximates CSS `filter: saturate(x)` by blending toward greyscale.
class _Desaturate extends StatelessWidget {
  final double amount; // 0 = no change, 1 = fully grey
  final Widget child;

  const _Desaturate({required this.amount, required this.child});

  @override
  Widget build(BuildContext context) {
    if (amount <= 0) return child;
    final m = amount.clamp(0.0, 1.0);
    final inv = 1 - m;
    // Standard luminance-preserving desaturation matrix, blended by `m`.
    final List<double> matrix = [
      0.2126 * m + inv,
      0.7152 * m,
      0.0722 * m,
      0,
      0,
      0.2126 * m,
      0.7152 * m + inv,
      0.0722 * m,
      0,
      0,
      0.2126 * m,
      0.7152 * m,
      0.0722 * m + inv,
      0,
      0,
      0,
      0,
      0,
      1,
      0,
    ];
    return ColorFiltered(colorFilter: ColorFilter.matrix(matrix), child: child);
  }
}
