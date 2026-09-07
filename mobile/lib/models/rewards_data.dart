/// Mirrors `GET /rewards` in `backend/src/controllers/rewards.controller.ts`.
class RewardsData {
  final int coins;
  final List<String> badges;

  const RewardsData({this.coins = 0, this.badges = const []});

  factory RewardsData.fromJson(Map<String, dynamic> json) => RewardsData(
        coins: (json['coins'] as num?)?.toInt() ?? 0,
        badges: (json['badges'] as List? ?? []).map((b) => b.toString()).toList(),
      );
}
