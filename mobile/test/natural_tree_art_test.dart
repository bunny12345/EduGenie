import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/models/dashboard.dart';
import 'package:mobile/models/orchard_data.dart';
import 'package:mobile/screens/student/student_orchard_screen.dart';
import 'package:mobile/state/student_providers.dart';
import 'package:mobile/widgets/orchard/tree_art.dart';
import 'package:mobile/widgets/orchard/tree_sprite.dart';
import 'package:mobile/widgets/pressable_scale.dart';

void main() {
  testWidgets('natural mastery labels fit narrow student Orchard cards', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(600, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          dashboardProvider.overrideWith(
            (ref) async => DashboardData.fromJson({}),
          ),
          orchardProvider.overrideWith(
            (ref) async => const OrchardData(
              trees: [
                OrchardTree(
                  subjectKey: 'english',
                  subject: 'English',
                  treeType: 'cherry_blossom',
                  stage: 'golden_fruit',
                  stageLabel: 'Golden Fruit',
                  masteredChapters: 17,
                  totalChapters: 20,
                  completedChapters: 18,
                ),
                OrchardTree(
                  subjectKey: 'science',
                  subject: 'Science',
                  treeType: 'crystal',
                  stage: 'fruit',
                  masteredChapters: 9,
                  totalChapters: 20,
                  completedChapters: 12,
                ),
              ],
            ),
          ),
        ],
        child: const MaterialApp(home: StudentOrchardScreen()),
      ),
    );
    await tester.pump();
    expect(find.text('17 cherry rewards'), findsOneWidget);
    expect(
      find.text('17 cherry rewards earned · One per fully mastered lesson'),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
    final card = tester.widget<PressableScale>(
      find.ancestor(
        of: find.text('17 cherry rewards'),
        matching: find.byType(PressableScale),
      ),
    );
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: SizedBox(width: 173, child: card)),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('17 cherry rewards'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  test(
    'natural theme mappings preserve catalog identifiers and dynamic palettes',
    () {
      expect(treeArt('crystal')!.fruitName, 'apple');
      expect(treeArt('cherry_blossom')!.fruitEmoji, '🍒');
      expect(treeArt('banyan')!.fruitName, 'orange');
      expect(treeArt('digital')!.fruitName, 'pear');
      expect(treeArt('mango')!.fruitName, 'mango');
      expect(treeArt('oak')!.fruitName, 'acorn');
      for (final type in ['lemon', 'peach', 'plum', 'coconut']) {
        expect(treeArt(type)!.assetType, type);
        expect(treeArt(type)!.fruitName, type);
      }
      expect(treeArt('pine'), treeArt('crystal'));
      expect(treeArt('palm'), treeArt('mango'));
      expect(treeArt('unknown'), isNull);
    },
  );

  test(
    'fruit positions match oak and remain inside the canvas above nine chapters',
    () {
      final first = masteryFruitRects(1, 2048).single;
      expect(first.center, const Offset(0.253, 0.590) * 2048);
      for (final count in [0, 1, 9, 10, 17, 100, 1200]) {
        final fruits = masteryFruitRects(count, 220);
        expect(fruits.length, count);
        expect(
          masteryFruitRects(count, 220, bakedOak: true).length,
          count > 9 ? count - 9 : 0,
        );
        for (final fruit in fruits) {
          expect(fruit.left, greaterThanOrEqualTo(0));
          expect(fruit.right, lessThanOrEqualTo(220));
          expect(fruit.bottom, lessThanOrEqualTo(220));
        }
      }
    },
  );

  for (final type in [
    'crystal',
    'cherry_blossom',
    'banyan',
    'digital',
    'mango',
    'lemon',
    'peach',
    'plum',
    'coconut',
  ]) {
    testWidgets(
      '$type uses exact shared size and one natural reward per mastered lesson',
      (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Center(
              child: TreeSprite(
                treeType: type,
                stage: 'golden_fruit',
                masteredChapters: 17,
                size: 220,
              ),
            ),
          ),
        );
        await tester.runAsync(() async {
          for (final image in tester.widgetList<Image>(find.byType(Image))) {
            await precacheImage(
              image.image,
              tester.element(find.byType(TreeSprite)),
            );
          }
        });
        await tester.pumpAndSettle();
        final images = tester.widgetList<Image>(find.byType(Image)).toList();
        expect(
          images
              .where(
                (image) => (image.image as AssetImage).assetName.endsWith(
                  'mastery_fruit.png',
                ),
              )
              .length,
          17,
        );
        expect(
          (images.first.image as AssetImage).assetName,
          'assets/orchard/$type/fully_grown.png',
        );
        expect(images.first.width, 220);
        expect(tester.takeException(), isNull);
      },
    );
  }

  test(
    'both clients have byte-identical PNGs and 2048-pixel lifecycle canvases',
    () {
      for (final type in [
        'oak',
        'crystal',
        'cherry_blossom',
        'banyan',
        'digital',
        'mango',
        'lemon',
        'peach',
        'plum',
        'coconut',
      ]) {
        for (final stage in [
          'seed',
          'sprout',
          'young_plant',
          'growing_tree',
          'mature_tree',
          'fully_grown',
        ]) {
          final path = '$type/$stage.png';
          final bytes = File('assets/orchard/$path').readAsBytesSync();
          expect(
            bytes,
            File('../web/public/assets/orchard/$path').readAsBytesSync(),
            reason: path,
          );
          final data = bytes.buffer.asByteData();
          expect(data.getUint32(16), 2048, reason: path);
          expect(data.getUint32(20), 2048, reason: path);
        }
        if (type != 'oak') {
          expect(
            File('assets/orchard/$type/mastery_fruit.png').readAsBytesSync(),
            File(
              '../web/public/assets/orchard/$type/mastery_fruit.png',
            ).readAsBytesSync(),
          );
        }
      }
    },
  );

  test('web and mobile use identical measured fruit coordinates', () {
    final webSource = File(
      '../web/src/components/orchard/treeArt.js',
    ).readAsStringSync();
    final positions = RegExp(
      r'const OAK_FRUIT_CENTERS = (\[[\s\S]*?\]);',
    ).firstMatch(webSource)!.group(1)!;
    final webCenters =
        jsonDecode(positions.replaceAll(RegExp(r',\s*]'), ']')) as List;
    final mobile = masteryFruitRects(9, 1);
    for (var i = 0; i < mobile.length; i++) {
      expect(
        mobile[i].center.dx,
        closeTo((webCenters[i] as List)[0] as num, 0.000001),
      );
      expect(
        mobile[i].center.dy,
        closeTo((webCenters[i] as List)[1] as num, 0.000001),
      );
    }
  });
}
