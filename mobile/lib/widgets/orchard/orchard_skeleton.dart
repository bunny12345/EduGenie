import 'package:flutter/material.dart';

import '../shimmer_wave.dart';

/// Loading placeholder for [StudentOrchardScreen] — mirrors the real page's
/// shape (header, counters, banner, tree grid, detail panel, bottom panels),
/// with each panel shimmering independently (in sync) so there's no blank
/// flash before data arrives.
class OrchardSkeleton extends StatelessWidget {
  const OrchardSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return ShimmerGroup(
      child: ListView(
        padding: const EdgeInsets.all(16),
        physics: const NeverScrollableScrollPhysics(),
        children: [
          const SkeletonBlock(width: 200, height: 22),
          const SizedBox(height: 8),
          const SkeletonBlock(width: 260, height: 13),
          const SizedBox(height: 16),
          Row(
            children: List.generate(4, (i) {
              return Expanded(
                child: Padding(
                  padding: EdgeInsets.only(right: i == 3 ? 0 : 8),
                  child: SkeletonCard(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
                    child: const Column(
                      children: [
                        SkeletonBlock(width: 22, height: 22, radius: 11),
                        SizedBox(height: 6),
                        SkeletonBlock(width: 28, height: 10),
                        SizedBox(height: 4),
                        SkeletonBlock(width: 40, height: 8),
                      ],
                    ),
                  ),
                ),
              );
            }),
          ),
          const SizedBox(height: 16),
          SkeletonCard(
            padding: const EdgeInsets.all(18),
            child: Column(
              children: [
                Row(
                  children: const [
                    SkeletonBlock(width: 32, height: 32, radius: 16),
                    SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          SkeletonBlock(width: 140, height: 14),
                          SizedBox(height: 6),
                          SkeletonBlock(width: 200, height: 11),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: const [
                    SkeletonBlock(width: 90, height: 24, radius: 999),
                    SkeletonBlock(width: 60, height: 60, radius: 30),
                    SkeletonBlock(width: 70, height: 22),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(maxCrossAxisExtent: 190, mainAxisExtent: 240, mainAxisSpacing: 12, crossAxisSpacing: 12),
            itemCount: 4,
            itemBuilder: (context, i) => SkeletonCard(
              child: const Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      SkeletonBlock(width: 80, height: 13),
                      SkeletonBlock(width: 36, height: 36, radius: 18),
                    ],
                  ),
                  SizedBox(height: 14),
                  Expanded(child: SkeletonBlock(width: 92, height: 92, radius: 46)),
                  SizedBox(height: 14),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      SkeletonBlock(width: 50, height: 11),
                      SkeletonBlock(width: 70, height: 11),
                    ],
                  ),
                  SizedBox(height: 6),
                  SkeletonBlock(height: 6, radius: 6),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          SkeletonCard(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: const [
                    SkeletonBlock(width: 140, height: 15),
                    SkeletonBlock(width: 30, height: 30, radius: 10),
                  ],
                ),
                const SizedBox(height: 14),
                const Center(child: SkeletonBlock(width: 150, height: 150, radius: 75)),
                const SizedBox(height: 14),
                const SkeletonBlock(height: 42, radius: 12),
                const SizedBox(height: 14),
                const SkeletonBlock(width: 90, height: 13),
                const SizedBox(height: 10),
                for (var i = 0; i < 3; i++) ...[
                  const SkeletonBlock(height: 10),
                  const SizedBox(height: 8),
                ],
              ],
            ),
          ),
          const SizedBox(height: 16),
          for (final lines in [3, 4, 2])
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: SkeletonCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SkeletonBlock(width: 120, height: 14),
                    const SizedBox(height: 12),
                    for (var i = 0; i < lines; i++) ...[
                      SkeletonBlock(height: 34, radius: 10),
                      if (i != lines - 1) const SizedBox(height: 8),
                    ],
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Loading placeholder for [OrchardTreeDetailScreen] — hero card + a grid of
/// chapter "seed" tiles, mirroring the real layout.
class OrchardTreeDetailSkeleton extends StatelessWidget {
  const OrchardTreeDetailSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return ShimmerGroup(
      child: ListView(
        padding: const EdgeInsets.all(16),
        physics: const NeverScrollableScrollPhysics(),
        children: [
          SkeletonCard(
            padding: const EdgeInsets.all(18),
            child: Column(
              children: [
                const Center(child: SkeletonBlock(width: 150, height: 150, radius: 75)),
                const SizedBox(height: 14),
                const SkeletonBlock(width: 200, height: 18),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: const [
                    SkeletonBlock(width: 70, height: 22, radius: 999),
                    SkeletonBlock(width: 90, height: 22, radius: 999),
                    SkeletonBlock(width: 80, height: 22, radius: 999),
                    SkeletonBlock(width: 70, height: 22, radius: 999),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          SkeletonCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SkeletonBlock(width: 220, height: 16),
                const SizedBox(height: 4),
                const SkeletonBlock(width: 260, height: 11),
                const SizedBox(height: 14),
                GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(maxCrossAxisExtent: 140, mainAxisExtent: 152, mainAxisSpacing: 12, crossAxisSpacing: 12),
                  itemCount: 6,
                  itemBuilder: (context, i) => const SkeletonBlock(height: 152, radius: 16),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
