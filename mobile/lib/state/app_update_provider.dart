import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../services/app_update_service.dart';

final appUpdateServiceProvider = Provider<AppUpdateService>(
  (ref) => AppUpdateService(),
);

final installedVersionProvider = FutureProvider.autoDispose<PackageInfo>(
  (ref) => ref.read(appUpdateServiceProvider).installedVersion(),
);

final availableUpdateProvider = FutureProvider.autoDispose<AppUpdateInfo?>(
  (ref) => ref.read(appUpdateServiceProvider).checkForUpdate(),
);
