import 'package:flutter/material.dart';

import '../../../theme/app_colors.dart';

/// Report-only palette: preserve the web-inspired light colors, but pair
/// dark surfaces with readable text instead of reusing light-mode ink.
class ProgressColors {
  final AppPalette palette;
  ProgressColors.of(BuildContext context) : palette = AppColors.of(context);
  bool get isDark => palette.isDark;

  Color surface(Color light) => isDark ? palette.card : light;
  Color background(Color light) => isDark ? palette.background : light;
  Color line(Color light) => isDark ? palette.line : light;
  Color guide(Color light) =>
      isDark ? Color.lerp(palette.card, palette.muted, 0.65)! : light;
  Color text(Color light) => isDark ? palette.text : light;
  Color muted(Color light) => isDark ? palette.muted : light;
  Color tint(Color light) => isDark
      ? Color.alphaBlend(light.withValues(alpha: 0.12), palette.card)
      : light;

  /// Chart strokes keep their semantic colors; only their text is lifted.
  Color accent(Color light) {
    if (!isDark) return light;
    var color = light;
    final brightestPanel = Color.alphaBlend(
      Colors.white.withValues(alpha: 0.12),
      palette.card,
    );
    while ((color.computeLuminance() + 0.05) /
            (brightestPanel.computeLuminance() + 0.05) <
        4.5) {
      color = Color.lerp(color, Colors.white, 0.12)!;
    }
    return color;
  }
}

/// Small pure helpers ported from `StudentProgress.jsx` (`SKILL_META`,
/// `levelFace`, `levelWord`, `valueColor`) — shared by the report screen and
/// the subject detail screen.

class SkillMeta {
  final String emoji;
  final String name;
  final String desc;

  const SkillMeta(this.emoji, this.name, this.desc);
}

const Map<String, SkillMeta> kSkillMeta = {
  'understanding': SkillMeta('🧠', 'Understanding', 'How well you get the lessons'),
  'tests': SkillMeta(
    '📝', 'Tests & Quizzes',
    'Test completion rate multiplied by average marks',
  ),
  'homework': SkillMeta(
    '📒', 'Homework',
    'Submitted homework out of assigned homework',
  ),
  'consistency': SkillMeta('📅', 'Daily Habit', 'Studying a little every day'),
  'revision': SkillMeta('🔁', 'Revision', 'Going over things again to remember'),
  'focus': SkillMeta('🎯', 'Focus', 'Concentrating while you study'),
  'confidence': SkillMeta('💪', 'Confidence', 'Believing you can do it'),
  'curiosity': SkillMeta('🔍', 'Curiosity', 'Asking questions & exploring'),
  'speaking': SkillMeta('🗣️', 'Speaking', "Explaining in your own words"),
};

SkillMeta skillMetaFor(String key, [String? fallbackLabel]) => kSkillMeta[key] ?? SkillMeta('⭐', fallbackLabel ?? key, '');

class LevelFace {
  final String face;
  final String word;
  final String tone;

  const LevelFace(this.face, this.word, this.tone);
}

LevelFace levelFace(int score) {
  if (score >= 850) return const LevelFace('🤩', 'Superstar', 'excellent');
  if (score >= 750) return const LevelFace('😃', 'Doing great', 'strong');
  if (score >= 650) return const LevelFace('🙂', 'Good going', 'good');
  if (score >= 500) return const LevelFace('💪', 'Getting stronger', 'developing');
  if (score >= 300) return const LevelFace('🌱', 'Just starting', 'starting');
  if (score > 0) return const LevelFace('🐣', 'New learner', 'beginning');
  return const LevelFace('👋', "Let's begin", 'none');
}

const Map<String, Color> kToneColors = {
  'excellent': Color(0xFF22C55E),
  'strong': Color(0xFF2DD4BF),
  'good': Color(0xFF60A5FA),
  'developing': Color(0xFFFBBF24),
  'starting': Color(0xFFFB923C),
  'beginning': Color(0xFFF87171),
  'none': Color(0xFF94A3B8),
};

const Map<String, List<Color>> kToneGradients = {
  'excellent': [Color(0xFF22C55E), Color(0xFF16A34A)],
  'strong': [Color(0xFF2DD4BF), Color(0xFF0D9488)],
  'good': [Color(0xFF60A5FA), Color(0xFF2563EB)],
  'developing': [Color(0xFFFBBF24), Color(0xFFD97706)],
  'starting': [Color(0xFFFB923C), Color(0xFFEA580C)],
  'beginning': [Color(0xFFF87171), Color(0xFFDC2626)],
  'none': [Color(0xFF94A3B8), Color(0xFF94A3B8)],
};

class LevelWord {
  final String word;
  final String klass;

  const LevelWord(this.word, this.klass);
}

LevelWord levelWord(int v) {
  if (v >= 75) return const LevelWord('Great!', 'great');
  if (v >= 50) return const LevelWord('Good', 'good');
  if (v >= 25) return const LevelWord('Keep going', 'okay');
  if (v > 0) return const LevelWord('Needs work', 'low');
  return const LevelWord('Not yet', 'none');
}

const Map<String, Color> kSkillWordColors = {
  'great': Color(0xFF16A34A),
  'good': Color(0xFF0284C7),
  'okay': Color(0xFFD97706),
  'low': Color(0xFFEA580C),
  'none': Color(0xFF9AA0BD),
};

Color valueColor(int v) {
  if (v >= 75) return const Color(0xFF16A34A);
  if (v >= 50) return const Color(0xFF0EA5E9);
  if (v >= 25) return const Color(0xFFF59E0B);
  if (v > 0) return const Color(0xFFF97316);
  return const Color(0xFFCBD5E1);
}

const Map<String, Color> kStatusChipBg = {
  'strong': Color(0xFFDCFCE7),
  'on-track': Color(0xFFDBEAFE),
  'needs-focus': Color(0xFFFEE2E2),
  'not-started': Color(0xFFEEF0FA),
};

const Map<String, Color> kStatusChipText = {
  'strong': Color(0xFF15803D),
  'on-track': Color(0xFF1D4ED8),
  'needs-focus': Color(0xFFB91C1C),
  'not-started': Color(0xFF6B7194),
};
