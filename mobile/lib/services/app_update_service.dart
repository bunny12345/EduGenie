import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';

enum UpdateActionResult { started, cancelled, noLongerAvailable }

enum UpdateAvailability { unknown, notAvailable, available, inProgress }

class AppUpdateInfo {
  const AppUpdateInfo({
    required this.availability,
    required this.immediateAllowed,
    required this.availableVersionCode,
    required this.packageName,
  });

  final UpdateAvailability availability;
  final bool immediateAllowed;
  final int? availableVersionCode;
  final String packageName;
}

class AppUpdateService {
  static const _channel = MethodChannel('academix/app_update');

  Future<PackageInfo> installedVersion() => PackageInfo.fromPlatform();

  Future<AppUpdateInfo?> checkForUpdate() async {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) {
      return null;
    }
    final result = await _channel.invokeMapMethod<String, dynamic>(
      'checkForUpdate',
    );
    if (result == null ||
        result['availability'] is! int ||
        result['immediateAllowed'] is! bool ||
        (result['availableVersionCode'] != null &&
            result['availableVersionCode'] is! int) ||
        result['packageName'] is! String) {
      throw const FormatException('Invalid Google Play update information.');
    }
    final availability = switch (result['availability']) {
      0 => UpdateAvailability.unknown,
      1 => UpdateAvailability.notAvailable,
      2 => UpdateAvailability.available,
      3 => UpdateAvailability.inProgress,
      _ => throw const FormatException(
        'Invalid Google Play update availability.',
      ),
    };
    return AppUpdateInfo(
      availability: availability,
      immediateAllowed: result['immediateAllowed'] as bool,
      availableVersionCode: result['availableVersionCode'] as int?,
      packageName: result['packageName'] as String,
    );
  }

  Future<UpdateActionResult> update() async {
    final info = await checkForUpdate();
    if (info?.availability == UpdateAvailability.unknown) {
      throw StateError('Google Play could not determine update availability.');
    }
    if (info == null ||
        (info.availability != UpdateAvailability.available &&
            info.availability != UpdateAvailability.inProgress)) {
      return UpdateActionResult.noLongerAvailable;
    }
    if (info.immediateAllowed ||
        info.availability == UpdateAvailability.inProgress) {
      final result = await _channel.invokeMethod<String>(
        'performImmediateUpdate',
      );
      return switch (result) {
        'started' => UpdateActionResult.started,
        'cancelled' => UpdateActionResult.cancelled,
        _ => throw StateError('Unexpected Google Play update result.'),
      };
    }

    final uri = Uri.https('play.google.com', '/store/apps/details', {
      'id': info.packageName,
    });
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
      throw StateError('Google Play could not be opened.');
    }
    return UpdateActionResult.started;
  }
}
