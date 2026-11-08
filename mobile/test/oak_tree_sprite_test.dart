import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/models/orchard_data.dart';
import 'package:mobile/widgets/orchard/tree_sprite.dart';

Future<void> loadArtwork(WidgetTester tester) async {
  await tester.runAsync(() async {
    for (final image in tester.widgetList<Image>(find.byType(Image))) {
      await precacheImage(
        image.image,
        tester.element(find.byType(TreeSprite).first),
      );
    }
  });
}

Finder asset(String path) => find.byWidgetPredicate(
  (widget) =>
      widget is Image &&
      widget.image is AssetImage &&
      (widget.image as AssetImage).assetName == 'assets/orchard/$path.png',
);

void main() {
  test('mastery is parsed without inferring it from ordinary completion', () {
    expect(
      OrchardTree.fromJson({'completedChapters': 10}).masteredChapters,
      isNull,
    );
    expect(
      OrchardTreeInfo.fromJson({'completedChapters': 10}).masteredChapters,
      isNull,
    );
    expect(
      OrchardTree.fromJson({
        'completedChapters': 12,
        'masteredChapters': 3,
      }).masteredChapters,
      3,
    );
    expect(
      OrchardTreeInfo.fromJson({'masteredChapters': 17}).masteredChapters,
      17,
    );
  });

  for (final count in [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 17, 40, 100]) {
    testWidgets('oak renders exactly $count mastery acorns', (tester) async {
      final semantics = tester.ensureSemantics();
      await tester.pumpWidget(
        MaterialApp(
          home: Center(
            child: TreeSprite(
              treeType: 'oak',
              stage: 'fruit',
              masteredChapters: count,
              size: 220,
            ),
          ),
        ),
      );
      await loadArtwork(tester);
      await tester.pumpAndSettle();
      final artwork = count == 0
          ? 'fully_grown'
          : 'acorns_${count > 9 ? 9 : count}';
      expect(asset('oak/$artwork'), findsOneWidget);
      final extra = count > 9 ? count - 9 : 0;
      expect(asset('oak/acorn'), findsNWidgets(extra));
      expect(
        find.bySemanticsLabel(
          'Oak tree with $count acorns for $count mastered lessons',
        ),
        findsOneWidget,
      );
      final spriteRect = tester.getRect(find.byType(TreeSprite));
      for (final fruit in asset('oak/acorn').evaluate()) {
        final rect = tester.getRect(find.byWidget(fruit.widget));
        expect(rect.left, greaterThanOrEqualTo(spriteRect.left));
        expect(rect.right, lessThanOrEqualTo(spriteRect.right));
        expect(rect.top, greaterThanOrEqualTo(spriteRect.top));
        expect(rect.bottom, lessThanOrEqualTo(spriteRect.bottom));
      }
      expect(tester.takeException(), isNull);
      semantics.dispose();
    });
  }

  testWidgets(
    'early oak stages and old oak backends keep artwork while natural trees use mastery fruit',
    (tester) async {
      for (final stage in [
        'seed',
        'sprout',
        'young_plant',
        'growing_tree',
        'mature_tree',
      ]) {
        await tester.pumpWidget(
          MaterialApp(
            home: TreeSprite(
              treeType: 'oak',
              stage: stage,
              masteredChapters: 0,
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(asset('oak/$stage'), findsOneWidget);
      }
      await tester.pumpWidget(
        const MaterialApp(
          home: TreeSprite(treeType: 'oak', stage: 'golden_fruit'),
        ),
      );
      await tester.pumpAndSettle();
      expect(asset('oak/golden_fruit'), findsOneWidget);
      await tester.pumpWidget(
        const MaterialApp(
          home: TreeSprite(
            treeType: 'crystal',
            stage: 'golden_fruit',
            masteredChapters: 17,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(asset('crystal/fully_grown'), findsOneWidget);
      expect(asset('crystal/mastery_fruit'), findsNWidgets(17));
      expect(asset('oak/acorn'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'health desaturation applies to base artwork and extra fruits together',
    (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: TreeSprite(
            treeType: 'oak',
            stage: 'golden_fruit',
            masteredChapters: 10,
            health: 'wilting',
          ),
        ),
      );
      await tester.pumpAndSettle();
      final filter = find.byType(ColorFiltered);
      expect(filter, findsOneWidget);
      expect(
        find.descendant(of: filter, matching: asset('oak/acorns_9')),
        findsOneWidget,
      );
      expect(
        find.descendant(of: filter, matching: asset('oak/acorn')),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    },
  );
}
