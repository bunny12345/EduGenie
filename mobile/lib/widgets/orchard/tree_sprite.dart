import 'package:flutter/material.dart';

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

/// Renders the artwork for a subject tree at a given growth stage — mirrors
/// `TreeSprite.jsx`. Tries the real bundled PNG at
/// `assets/orchard/<treeType>/<stage>.png` first (same asset pipeline as
/// web's `web/public/assets/orchard/`); if that stage/tree combo has no art
/// yet it falls back to a styled emoji placeholder, exactly like web.
class TreeSprite extends StatelessWidget {
  final String treeType;
  final String stage;
  final double size;
  final Color accentColor;
  final String health; // healthy | thirsty | wilting

  const TreeSprite({
    super.key,
    required this.treeType,
    required this.stage,
    this.size = 140,
    this.accentColor = const Color(0xFF22C55E),
    this.health = 'healthy',
  });

  @override
  Widget build(BuildContext context) {
    final wilt = health == 'wilting' ? 0.55 : health == 'thirsty' ? 0.8 : 1.0;
    final assetPath = 'assets/orchard/$treeType/$stage.png';

    return SizedBox(
      width: size,
      height: size,
      child: _Desaturate(
        amount: 1 - wilt,
        child: Image.asset(
          assetPath,
          width: size,
          height: size,
          fit: BoxFit.contain,
          errorBuilder: (context, error, stack) => _Placeholder(stage: stage, treeType: treeType, size: size, accentColor: accentColor),
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

  const _Placeholder({required this.stage, required this.treeType, required this.size, required this.accentColor});

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
          colors: [accentColor.withValues(alpha: 0.22), accentColor.withValues(alpha: 0.05), Colors.transparent],
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
      0.2126 * m + inv, 0.7152 * m, 0.0722 * m, 0, 0,
      0.2126 * m, 0.7152 * m + inv, 0.0722 * m, 0, 0,
      0.2126 * m, 0.7152 * m, 0.0722 * m + inv, 0, 0,
      0, 0, 0, 1, 0,
    ];
    return ColorFiltered(colorFilter: ColorFilter.matrix(matrix), child: child);
  }
}
