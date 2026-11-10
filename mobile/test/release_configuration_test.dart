import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';

void main() {
  const applicationId = 'now.academix.app';

  test(
    'Android release identity and permissions do not depend on debug config',
    () {
      final gradle = File('android/app/build.gradle.kts').readAsStringSync();
      expect(gradle, contains('namespace = "$applicationId"'));
      expect(gradle, contains('applicationId = "$applicationId"'));
      expect(gradle, isNot(contains('signingConfigs.getByName("debug")')));
      expect(gradle, contains('dependsOn(validateReleaseSigning)'));
      expect(gradle, contains('signingConfigs.getByName("release")'));
      final manifest = File(
        'android/app/src/main/AndroidManifest.xml',
      ).readAsStringSync();
      expect(manifest, contains('android:label="AcademiX"'));
      for (final permission in ['INTERNET', 'RECORD_AUDIO', 'CAMERA']) {
        expect(manifest, contains('android.permission.$permission'));
      }
      expect(
        File(
          'android/app/src/main/kotlin/now/academix/app/MainActivity.kt',
        ).readAsStringSync(),
        startsWith('package $applicationId'),
      );
      expect(
        File('.gitignore').readAsStringSync(),
        contains('**/key.properties'),
      );
    },
  );

  test('all iOS configurations use AcademiX identity and purpose strings', () {
    final project = File(
      'ios/Runner.xcodeproj/project.pbxproj',
    ).readAsStringSync();
    final identifiers = RegExp(
      r'PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);',
    ).allMatches(project).map((match) => match[1]).toList();
    expect(identifiers.where((id) => id == applicationId).length, 3);
    expect(
      identifiers.where((id) => id == '$applicationId.RunnerTests').length,
      3,
    );
    final plist = File('ios/Runner/Info.plist').readAsStringSync();
    expect(
      RegExp(
        r'<key>CFBundleDisplayName</key>\s*<string>AcademiX</string>',
      ).hasMatch(plist),
      isTrue,
    );
    for (final permission in [
      'NSMicrophoneUsageDescription',
      'NSCameraUsageDescription',
      'NSPhotoLibraryUsageDescription',
      'NSPhotoLibraryAddUsageDescription',
    ]) {
      expect(
        RegExp(
          '<key>$permission</key>\\s*<string>[^<]+</string>',
        ).hasMatch(plist),
        isTrue,
      );
    }
  });

  void verifyPng(String path, int size) {
    final bytes = File(path).readAsBytesSync();
    expect(bytes.take(8), [137, 80, 78, 71, 13, 10, 26, 10], reason: path);
    final header = ByteData.sublistView(bytes);
    expect(header.getUint32(16), size, reason: path);
    expect(header.getUint32(20), size, reason: path);
    // Opaque RGB: iOS marketing icons must not have an alpha channel.
    expect(bytes[25], 2, reason: path);
  }

  test(
    'every native launcher icon has the required size and opaque RGB format',
    () {
      for (final entry in {
        'mdpi': 48,
        'hdpi': 72,
        'xhdpi': 96,
        'xxhdpi': 144,
        'xxxhdpi': 192,
      }.entries) {
        verifyPng(
          'android/app/src/main/res/mipmap-${entry.key}/ic_launcher.png',
          entry.value,
        );
      }
      const directory = 'ios/Runner/Assets.xcassets/AppIcon.appiconset';
      final catalog =
          jsonDecode(File('$directory/Contents.json').readAsStringSync())
              as Map<String, dynamic>;
      for (final image in catalog['images'] as List<dynamic>) {
        final item = Map<String, dynamic>.from(image as Map);
        final points = double.parse((item['size'] as String).split('x').first);
        final scale = double.parse(
          (item['scale'] as String).replaceAll('x', ''),
        );
        verifyPng('$directory/${item['filename']}', (points * scale).round());
      }
      verifyPng('assets/branding/store_icon.png', 512);
    },
  );

  test(
    'web and mobile share the transparent logo and correctly sized icons',
    () {
      final master = File('assets/branding/logo.png').readAsBytesSync();
      expect(
        master[25],
        6,
        reason: 'The full logo must retain RGBA transparency',
      );
      expect(File('../web/public/logo.png').readAsBytesSync(), master);

      final manifest =
          jsonDecode(File('../web/public/manifest.json').readAsStringSync())
              as Map<String, dynamic>;
      for (final entry in manifest['icons'] as List<dynamic>) {
        final icon = Map<String, dynamic>.from(entry as Map);
        final size = int.parse((icon['sizes'] as String).split('x').first);
        verifyPng('../web/public/${icon['src']}', size);
      }
      verifyPng('../web/public/favicon.png', 32);
      verifyPng('../web/public/apple-touch-icon.png', 180);
      final html = File('../web/public/index.html').readAsStringSync();
      expect(html, contains('href="%PUBLIC_URL%/favicon.png"'));
      expect(html, contains('href="%PUBLIC_URL%/apple-touch-icon.png"'));

      final ico = File('../web/public/favicon.ico').readAsBytesSync();
      final header = ByteData.sublistView(ico);
      expect(header.getUint16(2, Endian.little), 1);
      expect(header.getUint16(4, Endian.little), 4);
      for (var index = 0; index < 4; index++) {
        final entry = 6 + index * 16;
        final length = header.getUint32(entry + 8, Endian.little);
        final offset = header.getUint32(entry + 12, Endian.little);
        expect(offset + length, lessThanOrEqualTo(ico.length));
        expect(ico.sublist(offset, offset + 8), [
          137,
          80,
          78,
          71,
          13,
          10,
          26,
          10,
        ]);
      }
      verifyPng('web/favicon.png', 32);
      for (final size in [192, 512]) {
        verifyPng('web/icons/Icon-$size.png', size);
        verifyPng('web/icons/Icon-maskable-$size.png', size);
      }
    },
  );
}
