/// Mirrors the "Learning Score" shape returned by
/// `GET /progress/learning-score` (`backend/src/progress/learning-score.service.ts`).
library;

import 'package:flutter/material.dart';

Color _parseHex(String? hex, Color fallback) {
  if (hex == null || hex.isEmpty) return fallback;
  var value = hex.replaceFirst('#', '');
  if (value.length == 6) value = 'FF$value';
  final parsed = int.tryParse(value, radix: 16);
  return parsed == null ? fallback : Color(parsed);
}

class ScoreDimension {
  final String key;
  final String label;
  final int value;

  ScoreDimension({required this.key, required this.label, required this.value});

  factory ScoreDimension.fromJson(Map<String, dynamic> json) {
    return ScoreDimension(
      key: json['key']?.toString() ?? '',
      label: json['label']?.toString() ?? '',
      value: (json['value'] as num?)?.toInt() ?? 0,
    );
  }
}

/// One point on a growth line — `value` is null for a future (not-yet-happened)
/// bucket, drawn as the "road ahead" on web.
class ChartPoint {
  final String label;
  final String? weekday;
  final double? value;
  final bool future;

  ChartPoint({required this.label, this.weekday, this.value, this.future = false});

  factory ChartPoint.overall(Map<String, dynamic> json) {
    return ChartPoint(
      label: json['label']?.toString() ?? '',
      weekday: json['weekday']?.toString(),
      value: (json['score'] as num?)?.toDouble(),
      future: json['future'] == true,
    );
  }

  factory ChartPoint.subject(Map<String, dynamic> json) {
    return ChartPoint(
      label: json['label']?.toString() ?? '',
      weekday: json['weekday']?.toString(),
      value: (json['value'] as num?)?.toDouble(),
      future: json['future'] == true,
    );
  }
}

class SkillMetric {
  final String key;
  final String emoji;
  final String label;
  final int value;
  final String desc;

  SkillMetric({required this.key, required this.emoji, required this.label, required this.value, required this.desc});

  factory SkillMetric.fromJson(Map<String, dynamic> json) {
    return SkillMetric(
      key: json['key']?.toString() ?? '',
      emoji: json['emoji']?.toString() ?? '⭐',
      label: json['label']?.toString() ?? '',
      value: (json['value'] as num?)?.toInt() ?? 0,
      desc: json['desc']?.toString() ?? '',
    );
  }
}

class StatItem {
  final String emoji;
  final String label;
  final int value;

  StatItem({required this.emoji, required this.label, required this.value});

  factory StatItem.fromJson(Map<String, dynamic> json) {
    return StatItem(
      emoji: json['emoji']?.toString() ?? '⭐',
      label: json['label']?.toString() ?? '',
      value: (json['value'] as num?)?.toInt() ?? 0,
    );
  }
}

class TagItem {
  final String emoji;
  final String label;
  final int value;

  TagItem({required this.emoji, required this.label, required this.value});

  factory TagItem.fromJson(Map<String, dynamic> json) {
    return TagItem(
      emoji: json['emoji']?.toString() ?? '⭐',
      label: json['label']?.toString() ?? '',
      value: (json['value'] as num?)?.toInt() ?? 0,
    );
  }
}

class SubjectProgress {
  final String subjectKey;
  final String name;
  final Color accent;
  final String emoji;
  final int score;
  final int score1000;
  final int trend;
  final String status; // strong | on-track | needs-focus | not-started
  final String statusLabel;
  final String tip;
  final List<ChartPoint> monthly;
  final List<ChartPoint> daily;
  final List<SkillMetric> metrics;
  final List<StatItem> stats;
  final int bestTest;
  final TagItem? strength;
  final TagItem? focus;

  SubjectProgress({
    required this.subjectKey,
    required this.name,
    required this.accent,
    required this.emoji,
    required this.score,
    required this.score1000,
    required this.trend,
    required this.status,
    required this.statusLabel,
    required this.tip,
    required this.monthly,
    required this.daily,
    required this.metrics,
    required this.stats,
    required this.bestTest,
    this.strength,
    this.focus,
  });

  factory SubjectProgress.fromJson(Map<String, dynamic> json) {
    final monthlyJson = json['monthly'] as List? ?? [];
    final dailyJson = json['daily'] as List? ?? [];
    final metricsJson = json['metrics'] as List? ?? [];
    final statsJson = json['stats'] as List? ?? [];
    return SubjectProgress(
      subjectKey: json['subjectKey']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      accent: _parseHex(json['accent']?.toString(), const Color(0xFF6D5EFC)),
      emoji: json['emoji']?.toString() ?? '🌱',
      score: (json['score'] as num?)?.toInt() ?? 0,
      score1000: (json['score1000'] as num?)?.toInt() ?? 0,
      trend: (json['trend'] as num?)?.toInt() ?? 0,
      status: json['status']?.toString() ?? 'not-started',
      statusLabel: json['statusLabel']?.toString() ?? 'Not started',
      tip: json['tip']?.toString() ?? '',
      monthly: monthlyJson.map((p) => ChartPoint.subject(Map<String, dynamic>.from(p as Map))).toList(),
      daily: dailyJson.map((p) => ChartPoint.subject(Map<String, dynamic>.from(p as Map))).toList(),
      metrics: metricsJson.map((m) => SkillMetric.fromJson(Map<String, dynamic>.from(m as Map))).toList(),
      stats: statsJson.map((s) => StatItem.fromJson(Map<String, dynamic>.from(s as Map))).toList(),
      bestTest: (json['bestTest'] as num?)?.toInt() ?? 0,
      strength: json['strength'] is Map ? TagItem.fromJson(Map<String, dynamic>.from(json['strength'])) : null,
      focus: json['focus'] is Map ? TagItem.fromJson(Map<String, dynamic>.from(json['focus'])) : null,
    );
  }
}

class DroppedDimension {
  final String key;
  final String label;
  final int delta;

  DroppedDimension({required this.key, required this.label, required this.delta});

  factory DroppedDimension.fromJson(Map<String, dynamic> json) {
    return DroppedDimension(
      key: json['key']?.toString() ?? '',
      label: json['label']?.toString() ?? '',
      delta: (json['delta'] as num?)?.toInt() ?? 0,
    );
  }
}

class ScoreAlert {
  final String level; // alert | warn | good | info
  final String title;
  final String message;
  final List<DroppedDimension> dropped;

  ScoreAlert({required this.level, required this.title, required this.message, required this.dropped});

  factory ScoreAlert.fromJson(Map<String, dynamic> json) {
    final droppedJson = json['dropped'] as List? ?? [];
    return ScoreAlert(
      level: json['level']?.toString() ?? 'info',
      title: json['title']?.toString() ?? '',
      message: json['message']?.toString() ?? '',
      dropped: droppedJson.map((d) => DroppedDimension.fromJson(Map<String, dynamic>.from(d as Map))).toList(),
    );
  }
}

class LearningScoreData {
  final bool hasData;
  final int score;
  final int maxScore;
  final Color color;
  final int momentumDelta;
  final List<ScoreDimension> dimensions;
  final List<ChartPoint> trend;
  final List<ChartPoint> dailyTrend;
  final List<SubjectProgress> subjects;
  final List<ScoreDimension> strengths;
  final List<ScoreDimension> focusAreas;
  final List<String> improvements;
  final ScoreAlert? alert;
  final String? trackingSince;
  final String? academicEndLabel;

  LearningScoreData({
    required this.hasData,
    required this.score,
    required this.maxScore,
    required this.color,
    required this.momentumDelta,
    required this.dimensions,
    required this.trend,
    required this.dailyTrend,
    required this.subjects,
    required this.strengths,
    required this.focusAreas,
    required this.improvements,
    this.alert,
    this.trackingSince,
    this.academicEndLabel,
  });

  factory LearningScoreData.fromJson(Map<String, dynamic> json) {
    final dimsJson = json['dimensions'] as List? ?? [];
    final trendJson = json['trend'] as List? ?? [];
    final dailyJson = json['dailyTrend'] as List? ?? [];
    final subjectsJson = json['subjects'] as List? ?? [];
    final strengthsJson = json['strengths'] as List? ?? [];
    final focusJson = json['focusAreas'] as List? ?? [];
    final improvementsJson = json['improvements'] as List? ?? [];
    return LearningScoreData(
      hasData: json['hasData'] == true,
      score: (json['score'] as num?)?.toInt() ?? 0,
      maxScore: (json['maxScore'] as num?)?.toInt() ?? 1000,
      color: _parseHex(json['color']?.toString(), const Color(0xFF6D5EFC)),
      momentumDelta: (json['momentumDelta'] as num?)?.toInt() ?? 0,
      dimensions: dimsJson.map((d) => ScoreDimension.fromJson(Map<String, dynamic>.from(d as Map))).toList(),
      trend: trendJson.map((p) => ChartPoint.overall(Map<String, dynamic>.from(p as Map))).toList(),
      dailyTrend: dailyJson.map((p) => ChartPoint.overall(Map<String, dynamic>.from(p as Map))).toList(),
      subjects: subjectsJson.map((s) => SubjectProgress.fromJson(Map<String, dynamic>.from(s as Map))).toList(),
      strengths: strengthsJson.map((d) => ScoreDimension.fromJson(Map<String, dynamic>.from(d as Map))).toList(),
      focusAreas: focusJson.map((d) => ScoreDimension.fromJson(Map<String, dynamic>.from(d as Map))).toList(),
      improvements: improvementsJson.map((s) => s.toString()).toList(),
      alert: json['alert'] is Map ? ScoreAlert.fromJson(Map<String, dynamic>.from(json['alert'])) : null,
      trackingSince: json['trackingSince']?.toString(),
      academicEndLabel: json['academicEndLabel']?.toString(),
    );
  }
}
