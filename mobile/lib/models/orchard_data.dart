/// Mirrors `GET /orchard` in `backend/src/orchard/orchard.service.ts`
/// (`getOrchard()`). Only the fields the mobile screen actually surfaces are
/// modeled — chapter-level detail (`GET /orchard/:subjectKey`) is out of
/// scope for this pass.
class OrchardProfile {
  final int waterDrops;
  final int sunshine;
  final int gems;
  final int harvest;
  final int companionLevel;
  final int dayStreak;

  const OrchardProfile({
    this.waterDrops = 0,
    this.sunshine = 0,
    this.gems = 0,
    this.harvest = 0,
    this.companionLevel = 1,
    this.dayStreak = 0,
  });

  factory OrchardProfile.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const OrchardProfile();
    return OrchardProfile(
      waterDrops: (json['waterDrops'] as num?)?.toInt() ?? 0,
      sunshine: (json['sunshine'] as num?)?.toInt() ?? 0,
      gems: (json['gems'] as num?)?.toInt() ?? 0,
      harvest: (json['harvest'] as num?)?.toInt() ?? 0,
      companionLevel: (json['companionLevel'] as num?)?.toInt() ?? 1,
      dayStreak: (json['dayStreak'] as num?)?.toInt() ?? 0,
    );
  }
}

class OrchardTree {
  final String subjectKey;
  final String subject;
  final String treeEmoji;
  final String fruitEmoji;
  final String stageLabel;
  final int level;
  final int maxLevel;
  final int progressPct;
  final String health; // e.g. 'thriving' | 'healthy' | 'wilting'
  final int dueReviewCount;

  const OrchardTree({
    required this.subjectKey,
    required this.subject,
    this.treeEmoji = '🌳',
    this.fruitEmoji = '🍎',
    this.stageLabel = 'Seed',
    this.level = 1,
    this.maxLevel = 7,
    this.progressPct = 0,
    this.health = 'healthy',
    this.dueReviewCount = 0,
  });

  factory OrchardTree.fromJson(Map<String, dynamic> json) => OrchardTree(
        subjectKey: json['subjectKey']?.toString() ?? '',
        subject: json['subject'] as String? ?? 'Subject',
        treeEmoji: json['treeEmoji'] as String? ?? '🌳',
        fruitEmoji: json['fruitEmoji'] as String? ?? '🍎',
        stageLabel: json['stageLabel'] as String? ?? 'Seed',
        level: (json['level'] as num?)?.toInt() ?? 1,
        maxLevel: (json['maxLevel'] as num?)?.toInt() ?? 7,
        progressPct: (json['progressPct'] as num?)?.toInt() ?? 0,
        health: json['health'] as String? ?? 'healthy',
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
