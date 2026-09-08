import 'package:flutter/material.dart';

/// Exact color palette for the AI Tutor screen, ported 1:1 from the web
/// app's dark `.eg-ai-panel` theme in `web/src/App.css`. The rest of the
/// mobile app stays on the light theme (matches web — only the AI Tutor
/// panel itself is dark there too) — these colors are scoped to this
/// screen only, do not reuse them elsewhere.
class AiTutorColors {
  AiTutorColors._();

  static const panelGradient = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [Color(0xFF0B154E), Color(0xFF0A1345), Color(0xFF0B164E)],
    stops: [0, 0.58, 1],
  );

  static const text = Color(0xFFF7F9FF);
  static const headText = Color(0xFFF5F8FF);
  static const mutedText = Color(0xB4D4E1FF); // rgba(212,225,255,0.7)
  static const border = Color(0x47C5D6FF); // rgba(197,214,255,0.28)

  static const selectBg = Color(0x9E0E1D60); // rgba(14,29,96,0.62)
  static const selectText = Color(0xFFF2F6FF);

  static const lessonChipBg = Color(0x24788FFF); // rgba(120,145,255,0.14)
  static const lessonChipBorder = Color(0x42B4C8FF); // rgba(180,200,255,0.26)
  static const lessonChipText = Color(0xFFE8EFFF);

  static const chatBgTop = Color(0xD70A1448); // rgba(10,20,72,0.84)
  static const chatBgBottom = Color(0xE108103E); // rgba(8,16,62,0.88)
  static const chatBorder = Color(0x2EDCE6FF); // rgba(220,230,255,0.18)

  static const botBubble = Color(0x1EF0F6FF); // rgba(240,246,255,0.12)
  static const botBubbleBorder = Color(0x3DC6D6FF); // rgba(198,214,255,0.24)
  static const botText = Color(0xFFE6EEFF);

  static const userBubbleStart = Color(0xFF6C72FF);
  static const userBubbleEnd = Color(0xFF4C56EF);

  static const inputBg = Color(0x850E1638); // rgba(6,14,56,0.52) approx
  static const inputBorder = Color(0x57CBDBFF); // rgba(203,219,255,0.34)

  static const sendGradientStart = Color(0xFF7A7DFF);
  static const sendGradientEnd = Color(0xFF4C56EF);
  static const stopGradientStart = Color(0xFFF97316);
  static const stopGradientEnd = Color(0xFFDC2626);

  static const attachBtnBg = Color(0x38ACC2FF); // rgba(172,194,255,0.22)
  static const attachBtnBorder = Color(0x73BCCDFF); // rgba(188,205,255,0.45)

  static const followupBg = Color(0xFFE3EBFF);
  static const followupText = Color(0xFF283472);
  static const followupBorder = Color(0xFFC4D3FF);

  static const actionsToggleBg = Color(0x266366F1);
  static const actionsToggleText = Color(0xFFE0E4FF);

  static const quizAction = Color(0xFF6366F1);
  static const explainAction = Color(0xFF06B6D4);
  static const rushAction = Color(0xFFF59E0B);
  static const storyAction = Color(0xFF22C55E);

  static const nudgeBg = Color(0x1FF59E0B);
  static const nudgeBorder = Color(0x4DF59E0B);
  static const nudgeText = Color(0xFFFBBF24);

  static const checkCardBg = Color(0x146366F1);
  static const checkCardBorder = Color(0x406366F1);
  static const checkCorrectBg = Color(0x1422C55E);
  static const checkCorrectBorder = Color(0x4D22C55E);
  static const checkWrongBg = Color(0x14EF4444);
  static const checkWrongBorder = Color(0x4DEF4444);

  static const explainPanelBg = Color(0x1406B6D4);
  static const explainPanelBorder = Color(0x4006B6D4);

  static const storyPanelBg = Color(0x1422C55E);
  static const storyPanelBorder = Color(0x4022C55E);

  static const rushPanelBg = Color(0x14F59E0B);
  static const rushPanelBorder = Color(0x40F59E0B);

  static const panelText = Color(0xFFE2E8F0);
  static const panelSubText = Color(0xFF94A3B8);
}
