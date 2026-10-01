import 'package:flutter/material.dart';

/// Provides one shared, looping animation to every [SkeletonBlock] beneath
/// it, so each placeholder card/panel shimmers independently but perfectly
/// in sync — the classic "wave passing through each panel" skeleton look
/// used by apps like Teams/YouTube, rather than one giant sweep stretched
/// across the whole scrollable page.
class ShimmerGroup extends StatefulWidget {
  final Widget child;

  const ShimmerGroup({super.key, required this.child});

  @override
  State<ShimmerGroup> createState() => _ShimmerGroupState();
}

class _ShimmerGroupState extends State<ShimmerGroup> with SingleTickerProviderStateMixin {
  late final AnimationController _c;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1300))..repeat();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => _ShimmerScope(controller: _c, child: widget.child);
}

class _ShimmerScope extends InheritedNotifier<AnimationController> {
  const _ShimmerScope({required AnimationController controller, required super.child}) : super(notifier: controller);

  static AnimationController of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<_ShimmerScope>();
    assert(scope != null, 'SkeletonBlock must be used inside a ShimmerGroup');
    return scope!.notifier!;
  }
}

/// A single skeleton placeholder block — a flat tinted rounded rect with a
/// light gradient sweeping across it on a loop (driven by the nearest
/// ancestor [ShimmerGroup], so every block on the page shimmers in sync).
class SkeletonBlock extends StatelessWidget {
  final double? width;
  final double height;
  final double radius;

  const SkeletonBlock({super.key, this.width, this.height = 16, this.radius = 8});

  @override
  Widget build(BuildContext context) {
    final controller = _ShimmerScope.of(context);
    return AnimatedBuilder(
      animation: controller,
      builder: (context, child) {
        return ShaderMask(
          blendMode: BlendMode.srcATop,
          shaderCallback: (bounds) {
            final sweep = -0.6 + controller.value * 2.2;
            return LinearGradient(
              begin: Alignment(-1, sweep - 0.5),
              end: Alignment(1, sweep + 0.5),
              colors: const [Color(0xFFE2E2EE), Color(0xFFF8F8FC), Color(0xFFE2E2EE)],
              stops: const [0.35, 0.5, 0.65],
            ).createShader(bounds);
          },
          child: child,
        );
      },
      child: Container(
        width: width,
        height: height,
        decoration: BoxDecoration(color: const Color(0xFFE2E2EE), borderRadius: BorderRadius.circular(radius)),
      ),
    );
  }
}

/// White card shell matching the app's real panels' look (rounded + soft
/// shadow), so skeleton content reads as "cards loading" rather than bare
/// grey blocks — the Teams/YouTube-style per-panel skeleton look. Reused
/// across every page's loading skeleton.
class SkeletonCard extends StatelessWidget {
  final Widget child;
  final EdgeInsets padding;

  const SkeletonCard({super.key, required this.child, this.padding = const EdgeInsets.all(14)});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: padding,
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(18), boxShadow: const [
        BoxShadow(color: Color(0x0F1F2340), blurRadius: 14, offset: Offset(0, 4)),
      ]),
      child: child,
    );
  }
}

/// Loading placeholder shared by Flashcards/Quiz Rush/Memory Maze's
/// subject+chapter picker screen — a tab row + a hero card + chapter rows.
class GamePickerSkeleton extends StatelessWidget {
  const GamePickerSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return ShimmerGroup(
      child: ListView(
        physics: const NeverScrollableScrollPhysics(),
        children: [
          Row(
            children: [
              for (var i = 0; i < 3; i++)
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: SkeletonBlock(width: 70 + i * 10, height: 30, radius: 999),
                ),
            ],
          ),
          const SizedBox(height: 14),
          const SkeletonCard(child: SkeletonBlock(height: 70, radius: 14)),
          const SizedBox(height: 14),
          for (var i = 0; i < 4; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: SkeletonCard(
                child: Row(
                  children: const [
                    SkeletonBlock(width: 44, height: 44, radius: 12),
                    SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          SkeletonBlock(width: 140, height: 13),
                          SizedBox(height: 8),
                          SkeletonBlock(width: 90, height: 10),
                        ],
                      ),
                    ),
                    SkeletonBlock(width: 44, height: 20, radius: 999),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}
