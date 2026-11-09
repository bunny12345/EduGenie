import 'dart:math' as math;
import 'package:flutter/material.dart';

class TreeArt {
  final String assetType;
  final String fruitName;
  final String fruitPlural;
  final String fruitEmoji;

  const TreeArt(
    this.assetType,
    this.fruitName,
    this.fruitPlural,
    this.fruitEmoji,
  );
}

const _themes = {
  'oak': TreeArt('oak', 'acorn', 'acorns', '🌰'),
  'crystal': TreeArt('crystal', 'apple', 'apples', '🍎'),
  'cherry_blossom': TreeArt(
    'cherry_blossom',
    'cherry reward',
    'cherry rewards',
    '🍒',
  ),
  'banyan': TreeArt('banyan', 'orange', 'oranges', '🍊'),
  'digital': TreeArt('digital', 'pear', 'pears', '🍐'),
  'mango': TreeArt('mango', 'mango', 'mangoes', '🥭'),
  'lemon': TreeArt('lemon', 'lemon', 'lemons', '🍋'),
  'peach': TreeArt('peach', 'peach', 'peaches', '🍑'),
  'plum': TreeArt('plum', 'plum', 'plums', '🟣'),
  'strawberry': TreeArt('strawberry', 'strawberry', 'strawberries', '🍓'),
};

TreeArt? treeArt(String treeType) =>
    _themes[{
          'willow': 'cherry_blossom',
          'maple': 'cherry_blossom',
          'pine': 'crystal',
          'palm': 'mango',
          'olive': 'banyan',
          'redwood': 'digital',
          'coconut': 'strawberry',
        }[treeType] ??
        treeType];

String masteryStageLabel(
  String treeType,
  String stageLabel,
  int? masteredChapters,
) => treeArt(treeType) != null && (masteredChapters ?? 0) > 0
    ? 'Fully grown'
    : stageLabel;

const _oakFruitCenters = [
  Offset(0.253, 0.590),
  Offset(0.731, 0.625),
  Offset(0.319, 0.477),
  Offset(0.602, 0.343),
  Offset(0.407, 0.410),
  Offset(0.675, 0.460),
  Offset(0.246, 0.316),
  Offset(0.775, 0.519),
  Offset(0.172, 0.445),
];

List<Rect> masteryFruitRects(int count, double size, {bool bakedOak = false}) {
  final fruits = <Rect>[];
  if (!bakedOak) {
    for (final center in _oakFruitCenters.take(count)) {
      fruits.add(
        Rect.fromCenter(
          center: center * size,
          width: size * 0.07,
          height: size * 0.09,
        ),
      );
    }
  }
  final extra = math.max(0, count - 9);
  final columns = math.max(5, math.sqrt(extra * 2.5).ceil());
  final rows = math.max(1, (extra / columns).ceil());
  final width =
      size *
      math.min(0.055, math.min(0.36 / columns * 0.85, 0.13 / rows * 0.65));
  for (var i = 0; i < extra; i++) {
    fruits.add(
      Rect.fromLTWH(
        size * (0.32 + ((i % columns) + 0.5) / columns * 0.36) - width / 2,
        size * (0.09 + (i ~/ columns) / rows * 0.13),
        width,
        width * 167 / 122,
      ),
    );
  }
  return fruits;
}
