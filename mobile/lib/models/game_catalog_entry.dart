import 'package:flutter/material.dart';

/// Mirrors `GameCatalogEntry` from `backend/src/games/games.constants.ts`.
class GameCatalogEntry {
  final String gameKey;
  final String title;
  final String tagline;
  final String icon;
  final Color accent;
  final String status; // 'live' | 'soon'

  GameCatalogEntry({
    required this.gameKey,
    required this.title,
    required this.tagline,
    required this.icon,
    required this.accent,
    required this.status,
  });

  bool get isLive => status == 'live';

  factory GameCatalogEntry.fromJson(Map<String, dynamic> json) {
    return GameCatalogEntry(
      gameKey: json['gameKey']?.toString() ?? '',
      title: json['title']?.toString() ?? '',
      tagline: json['tagline']?.toString() ?? '',
      icon: json['icon']?.toString() ?? '🎮',
      accent: _parseHexColor(json['accent']?.toString()) ?? const Color(0xFF6D5EFC),
      status: json['status']?.toString() ?? 'soon',
    );
  }

  static Color? _parseHexColor(String? hex) {
    if (hex == null || hex.isEmpty) return null;
    var value = hex.replaceFirst('#', '');
    if (value.length == 6) value = 'FF$value';
    final parsed = int.tryParse(value, radix: 16);
    return parsed == null ? null : Color(parsed);
  }
}
