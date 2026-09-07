import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/session_provider.dart';
import '../../state/student_providers.dart';
import '../../theme/app_colors.dart';
import '../../widgets/section_card.dart';

class StudentRewardsScreen extends ConsumerStatefulWidget {
  const StudentRewardsScreen({super.key});

  @override
  ConsumerState<StudentRewardsScreen> createState() => _StudentRewardsScreenState();
}

class _StudentRewardsScreenState extends ConsumerState<StudentRewardsScreen> {
  bool _checkingIn = false;
  String? _note;

  Future<void> _checkIn() async {
    final studentId = ref.read(sessionProvider).value?.userId ?? '';
    if (studentId.isEmpty) return;
    setState(() {
      _checkingIn = true;
      _note = null;
    });
    try {
      final res = await ref.read(studentApiServiceProvider).checkInReward(studentId);
      if (res['alreadyCheckedIn'] == true) {
        setState(() => _note = "You've already checked in today.");
      } else {
        ref.invalidate(rewardsProvider);
        setState(() => _note = '+10 coins! Total: ${res['newBalance'] ?? '-'}');
      }
    } catch (e) {
      setState(() => _note = 'Check-in failed: $e');
    } finally {
      if (mounted) setState(() => _checkingIn = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final rewardsAsync = ref.watch(rewardsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Rewards')),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(rewardsProvider),
        child: rewardsAsync.when(
          loading: () => ListView(padding: const EdgeInsets.all(16), children: const [SkeletonBox(height: 200)]),
          error: (e, _) => ListView(padding: const EdgeInsets.all(16), children: [ErrorInline(message: 'Unable to load rewards: $e')]),
          data: (rewards) => ListView(
            padding: const EdgeInsets.all(16),
            children: [
              SectionCard(
                child: Column(
                  children: [
                    const Text('⭐', style: TextStyle(fontSize: 36)),
                    Text('${rewards.coins} Coins', style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
                    Text('${rewards.badges.length} badges earned', style: const TextStyle(color: AppColors.muted, fontSize: 13)),
                    const SizedBox(height: 14),
                    ElevatedButton(
                      onPressed: _checkingIn ? null : _checkIn,
                      child: _checkingIn
                          ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : const Text('Check-in (+10 coins)'),
                    ),
                    if (_note != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_note!, style: const TextStyle(fontSize: 12))),
                  ],
                ),
              ),
              if (rewards.badges.isNotEmpty)
                SectionCard(
                  title: '🏅 Badges',
                  child: Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: rewards.badges
                        .map((b) => Chip(label: Text(b), backgroundColor: AppColors.brandSoft))
                        .toList(),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
