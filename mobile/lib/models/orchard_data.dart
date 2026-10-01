import 'package:flutter/material.dart';

/// Mirrors `GET /orchard` / `GET /orchard/:subjectKey` in
/// `backend/src/orchard/orchard.service.ts` (`getOrchard()` / `getTree()`)
/// field-for-field — this is an exact mirror of web's Knowledge Orchard,
/// not a simplified subset.
class OrchardProfile {
  final int waterDrops;
  final int sunshine;
  final int gems;
  final int harvest;
  final int companionLevel;
  final int companionXp;
  final int companionXpMax;
  final int dayStreak;
  final List<String> activeDates;

  const OrchardProfile({
    this.waterDrops = 0,
    this.sunshine = 0,
    this.gems = 0,
    this.harvest = 0,
    this.companionLevel = 1,
    this.companionXp = 0,
    this.companionXpMax = 100,
    this.dayStreak = 0,
    this.activeDates = const [],
  });

  factory OrchardProfile.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const OrchardProfile();
    return OrchardProfile(
      waterDrops: (json['waterDrops'] as num?)?.toInt() ?? 0,
      sunshine: (json['sunshine'] as num?)?.toInt() ?? 0,
      gems: (json['gems'] as num?)?.toInt() ?? 0,
      harvest: (json['harvest'] as num?)?.toInt() ?? 0,
      companionLevel: (json['companionLevel'] as num?)?.toInt() ?? 1,
      companionXp: (json['companionXp'] as num?)?.toInt() ?? 0,
      companionXpMax: (json['companionXpMax'] as num?)?.toInt() ?? 100,
      dayStreak: (json['dayStreak'] as num?)?.toInt() ?? 0,
      activeDates: (json['activeDates'] as List? ?? []).map((d) => d.toString()).toList(),
    );
  }
}

Color colorFromHex(String? hex, {Color fallback = const Color(0xFF7C3AED)}) {
  if (hex == null || hex.isEmpty) return fallback;
  var h = hex.replaceAll('#', '');
  if (h.length == 3) h = h.split('').map((c) => '$c$c').join();
  if (h.length != 6) return fallback;
  final v = int.tryParse('FF$h', radix: 16);
  return v == null ? fallback : Color(v);
}

class OrchardTree {
  final String subjectKey;
  final String subject;
  final String treeType;
  final String fruitType;
  final String fruitEmoji;
  final String treeEmoji;
  final Color accentColor;
  final String stage;
  final String stageLabel;
  final int level;
  final int maxLevel;
  final int totalChapters;
  final int completedChapters;
  final int progressPct;
  final int rootsPct;
  final int waterPct;
  final int sunlightPct;
  final int fertilizerPct;
  final String health; // healthy | thirsty | wilting
  final String mood; // happy | sad | sleepy | excited
  final int daysSinceLast;
  final String season; // spring | summer | autumn | winter
  final int dueReviewCount;

  const OrchardTree({
    required this.subjectKey,
    required this.subject,
    this.treeType = 'oak',
    this.fruitType = '',
    this.treeEmoji = '🌳',
    this.fruitEmoji = '🍎',
    this.accentColor = const Color(0xFF7C3AED),
    this.stage = 'seed',
    this.stageLabel = 'Seed',
    this.level = 1,
    this.maxLevel = 7,
    this.totalChapters = 0,
    this.completedChapters = 0,
    this.progressPct = 0,
    this.rootsPct = 0,
    this.waterPct = 0,
    this.sunlightPct = 0,
    this.fertilizerPct = 0,
    this.health = 'healthy',
    this.mood = 'happy',
    this.daysSinceLast = 0,
    this.season = 'spring',
    this.dueReviewCount = 0,
  });

  factory OrchardTree.fromJson(Map<String, dynamic> json) => OrchardTree(
        subjectKey: json['subjectKey']?.toString() ?? '',
        subject: json['subject'] as String? ?? 'Subject',
        treeType: json['treeType'] as String? ?? 'oak',
        fruitType: json['fruitType'] as String? ?? '',
        treeEmoji: json['treeEmoji'] as String? ?? '🌳',
        fruitEmoji: json['fruitEmoji'] as String? ?? '🍎',
        accentColor: colorFromHex(json['accentColor'] as String?),
        stage: json['stage'] as String? ?? 'seed',
        stageLabel: json['stageLabel'] as String? ?? 'Seed',
        level: (json['level'] as num?)?.toInt() ?? 1,
        maxLevel: (json['maxLevel'] as num?)?.toInt() ?? 7,
        totalChapters: (json['totalChapters'] as num?)?.toInt() ?? 0,
        completedChapters: (json['completedChapters'] as num?)?.toInt() ?? 0,
        progressPct: (json['progressPct'] as num?)?.toInt() ?? 0,
        rootsPct: (json['rootsPct'] as num?)?.toInt() ?? 0,
        waterPct: (json['waterPct'] as num?)?.toInt() ?? 0,
        sunlightPct: (json['sunlightPct'] as num?)?.toInt() ?? 0,
        fertilizerPct: (json['fertilizerPct'] as num?)?.toInt() ?? 0,
        health: json['health'] as String? ?? 'healthy',
        mood: json['mood'] as String? ?? 'happy',
        daysSinceLast: (json['daysSinceLast'] as num?)?.toInt() ?? 0,
        season: json['season'] as String? ?? 'spring',
        dueReviewCount: (json['dueReviewCount'] as num?)?.toInt() ?? 0,
      );
}

class OrchardData {
  final OrchardProfile profile;
  final int overallProgress;
  final List<OrchardTree> trees;

  const OrchardData({this.profile = const OrchardProfile(), this.overallProgress = 0, this.trees = const []});

  factory OrchardData.fromJson(Map<String, dynamic> json) => OrchardData(
        profile: OrchardProfile.fromJson(json['profile'] as Map<String, dynamic>?),
        overallProgress: (json['overallProgress'] as num?)?.toInt() ?? 0,
        trees: (json['trees'] as List? ?? []).map((t) => OrchardTree.fromJson(Map<String, dynamic>.from(t as Map))).toList(),
      );
}

/// A single uploaded lesson's growth state within a subject tree — mirrors
/// each entry of `chapters` in `getTree()`.
class OrchardChapter {
  final String chapterId;
  final String? lessonId;
  final int chapterNumber;
  final String title;
  final String stage;
  final String stageLabel;
  final int stageIndex;
  final int rootsPct;
  final bool isGolden;
  final bool fruitCollected;
  final Map<String, bool> milestones;
  final String? dueReview; // 'week' | 'month' | null

  const OrchardChapter({
    required this.chapterId,
    this.lessonId,
    this.chapterNumber = 1,
    this.title = '',
    this.stage = 'seed',
    this.stageLabel = 'Seed',
    this.stageIndex = 0,
    this.rootsPct = 0,
    this.isGolden = false,
    this.fruitCollected = false,
    this.milestones = const {},
    this.dueReview,
  });

  factory OrchardChapter.fromJson(Map<String, dynamic> json) => OrchardChapter(
        chapterId: json['chapterId']?.toString() ?? '',
        lessonId: json['lessonId']?.toString(),
        chapterNumber: (json['chapterNumber'] as num?)?.toInt() ?? 1,
        title: json['title'] as String? ?? '',
        stage: json['stage'] as String? ?? 'seed',
        stageLabel: json['stageLabel'] as String? ?? 'Seed',
        stageIndex: (json['stageIndex'] as num?)?.toInt() ?? 0,
        rootsPct: (json['rootsPct'] as num?)?.toInt() ?? 0,
        isGolden: json['isGolden'] as bool? ?? false,
        fruitCollected: json['fruitCollected'] as bool? ?? false,
        milestones: (json['milestones'] as Map? ?? {}).map((k, v) => MapEntry(k.toString(), v == true)),
        dueReview: json['dueReview'] as String?,
      );
}

/// Per-tree live state inside the detail response (`tree` field of `getTree()`).
class OrchardTreeInfo {
  final String stage;
  final String stageLabel;
  final int level;
  final int maxLevel;
  final int totalChapters;
  final int completedChapters;
  final int progressPct;
  final int rootsPct;
  final int waterPct;
  final int sunlightPct;
  final int fertilizerPct;
  final String health;
  final String mood;
  final int daysSinceLast;
  final String season;

  const OrchardTreeInfo({
    this.stage = 'seed',
    this.stageLabel = 'Seed',
    this.level = 1,
    this.maxLevel = 7,
    this.totalChapters = 0,
    this.completedChapters = 0,
    this.progressPct = 0,
    this.rootsPct = 0,
    this.waterPct = 0,
    this.sunlightPct = 0,
    this.fertilizerPct = 0,
    this.health = 'healthy',
    this.mood = 'happy',
    this.daysSinceLast = 0,
    this.season = 'spring',
  });

  factory OrchardTreeInfo.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const OrchardTreeInfo();
    return OrchardTreeInfo(
      stage: json['stage'] as String? ?? 'seed',
      stageLabel: json['stageLabel'] as String? ?? 'Seed',
      level: (json['level'] as num?)?.toInt() ?? 1,
      maxLevel: (json['maxLevel'] as num?)?.toInt() ?? 7,
      totalChapters: (json['totalChapters'] as num?)?.toInt() ?? 0,
      completedChapters: (json['completedChapters'] as num?)?.toInt() ?? 0,
      progressPct: (json['progressPct'] as num?)?.toInt() ?? 0,
      rootsPct: (json['rootsPct'] as num?)?.toInt() ?? 0,
      waterPct: (json['waterPct'] as num?)?.toInt() ?? 0,
      sunlightPct: (json['sunlightPct'] as num?)?.toInt() ?? 0,
      fertilizerPct: (json['fertilizerPct'] as num?)?.toInt() ?? 0,
      health: json['health'] as String? ?? 'healthy',
      mood: json['mood'] as String? ?? 'happy',
      daysSinceLast: (json['daysSinceLast'] as num?)?.toInt() ?? 0,
      season: json['season'] as String? ?? 'spring',
    );
  }
}

/// Full single-tree detail — mirrors `GET /orchard/:subjectKey`.
class OrchardTreeDetailData {
  final String subjectKey;
  final String subject;
  final String treeType;
  final String fruitType;
  final String fruitEmoji;
  final String treeEmoji;
  final Color accentColor;
  final OrchardTreeInfo tree;
  final OrchardChapter? nextChapter;
  final List<OrchardChapter> chapters;

  const OrchardTreeDetailData({
    required this.subjectKey,
    required this.subject,
    this.treeType = 'oak',
    this.fruitType = '',
    this.fruitEmoji = '🍎',
    this.treeEmoji = '🌳',
    this.accentColor = const Color(0xFF7C3AED),
    this.tree = const OrchardTreeInfo(),
    this.nextChapter,
    this.chapters = const [],
  });

  factory OrchardTreeDetailData.fromJson(Map<String, dynamic> json) => OrchardTreeDetailData(
        subjectKey: json['subjectKey']?.toString() ?? '',
        subject: json['subject'] as String? ?? 'Subject',
        treeType: json['treeType'] as String? ?? 'oak',
        fruitType: json['fruitType'] as String? ?? '',
        fruitEmoji: json['fruitEmoji'] as String? ?? '🍎',
        treeEmoji: json['treeEmoji'] as String? ?? '🌳',
        accentColor: colorFromHex(json['accentColor'] as String?),
        tree: OrchardTreeInfo.fromJson(json['tree'] as Map<String, dynamic>?),
        nextChapter: json['nextChapter'] == null ? null : OrchardChapter.fromJson(Map<String, dynamic>.from(json['nextChapter'] as Map)),
        chapters: (json['chapters'] as List? ?? []).map((c) => OrchardChapter.fromJson(Map<String, dynamic>.from(c as Map))).toList(),
      );
}
