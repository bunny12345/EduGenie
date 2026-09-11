/// Dashboard models — shapes exactly mirror `GET /dashboard` in
/// `backend/src/controllers/dashboard.controller.ts`. Keep field names/types
/// in sync with the backend response, not with a redesigned mobile shape.
class Milestone {
  final int days;
  final String label;
  final String icon;
  final bool earned;

  const Milestone({required this.days, required this.label, required this.icon, required this.earned});

  factory Milestone.fromJson(Map<String, dynamic> json) => Milestone(
        days: (json['days'] as num?)?.toInt() ?? 0,
        label: json['label'] as String? ?? '',
        icon: json['icon'] as String? ?? '🏅',
        earned: json['earned'] as bool? ?? false,
      );
}

class StreakInfo {
  final int days;
  final int longest;
  final bool activeToday;
  final bool atRisk;
  final bool freezeUsed;
  final int freezesAvailable;
  final List<Milestone> milestones;
  final int? nextMilestone;
  final int? daysToNextMilestone;

  const StreakInfo({
    this.days = 0,
    this.longest = 0,
    this.activeToday = false,
    this.atRisk = false,
    this.freezeUsed = false,
    this.freezesAvailable = 0,
    this.milestones = const [],
    this.nextMilestone,
    this.daysToNextMilestone,
  });

  factory StreakInfo.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const StreakInfo();
    return StreakInfo(
      days: (json['days'] as num?)?.toInt() ?? 0,
      longest: (json['longest'] as num?)?.toInt() ?? 0,
      activeToday: json['activeToday'] as bool? ?? false,
      atRisk: json['atRisk'] as bool? ?? false,
      freezeUsed: json['freezeUsed'] as bool? ?? false,
      freezesAvailable: (json['freezesAvailable'] as num?)?.toInt() ?? 0,
      milestones: (json['milestones'] as List? ?? [])
          .map((m) => Milestone.fromJson(Map<String, dynamic>.from(m as Map)))
          .toList(),
      nextMilestone: (json['nextMilestone'] as num?)?.toInt(),
      daysToNextMilestone: (json['daysToNextMilestone'] as num?)?.toInt(),
    );
  }
}

class ClassTeacher {
  final String id;
  final String name;
  final String subject;

  const ClassTeacher({required this.id, required this.name, required this.subject});

  factory ClassTeacher.fromJson(Map<String, dynamic> json) => ClassTeacher(
        id: json['id']?.toString() ?? '',
        name: json['name'] as String? ?? '',
        subject: json['subject'] as String? ?? 'General',
      );
}

class AnnouncementItem {
  final String id;
  final String title;
  final String message;
  final String? createdAt;

  const AnnouncementItem({required this.id, required this.title, required this.message, this.createdAt});

  factory AnnouncementItem.fromJson(Map<String, dynamic> json) => AnnouncementItem(
        id: json['id']?.toString() ?? '',
        title: json['title'] as String? ?? 'Announcement',
        message: json['message'] as String? ?? '',
        createdAt: json['createdAt'] as String?,
      );
}

class DashboardData {
  final String? greetingName;
  final String? className;
  final String? schoolName;
  final String? gender;
  final String? loginId;
  final List<ClassTeacher> classTeachers;
  final StreakInfo streak;
  final List<AnnouncementItem> announcements;

  const DashboardData({
    this.greetingName,
    this.className,
    this.schoolName,
    this.gender,
    this.loginId,
    this.classTeachers = const [],
    this.streak = const StreakInfo(),
    this.announcements = const [],
  });

  factory DashboardData.fromJson(Map<String, dynamic> json) => DashboardData(
        greetingName: json['greetingName'] as String?,
        className: json['className'] as String?,
        schoolName: json['schoolName'] as String?,
        gender: json['gender'] as String?,
        loginId: json['loginId'] as String?,
        classTeachers: (json['classTeachers'] as List? ?? [])
            .map((t) => ClassTeacher.fromJson(Map<String, dynamic>.from(t as Map)))
            .toList(),
        streak: StreakInfo.fromJson(json['streak'] as Map<String, dynamic>?),
        announcements: (json['announcements'] as List? ?? [])
            .map((a) => AnnouncementItem.fromJson(Map<String, dynamic>.from(a as Map)))
            .toList(),
      );
}
