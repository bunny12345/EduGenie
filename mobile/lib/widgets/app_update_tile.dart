import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/app_update_service.dart';
import '../state/app_update_provider.dart';
import '../theme/app_colors.dart';

class AppUpdateTile extends ConsumerStatefulWidget {
  const AppUpdateTile({super.key, this.compact = false});

  final bool compact;

  @override
  ConsumerState<AppUpdateTile> createState() => _AppUpdateTileState();
}

class _AppUpdateTileState extends ConsumerState<AppUpdateTile>
    with WidgetsBindingObserver {
  bool _updating = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && !_updating) {
      ref.invalidate(availableUpdateProvider);
      ref.invalidate(installedVersionProvider);
    }
  }

  Future<void> _update() async {
    setState(() => _updating = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      final result = await ref.read(appUpdateServiceProvider).update();
      if (result == UpdateActionResult.noLongerAvailable && messenger.mounted) {
        messenger.showSnackBar(
          const SnackBar(
            content: Text('No update is currently available on Google Play.'),
          ),
        );
      }
    } catch (error, stack) {
      debugPrint('App update failed: $error\n$stack');
      if (messenger.mounted) {
        messenger.showSnackBar(
          const SnackBar(
            content: Text(
              'Could not start the update. Please try again or update from Google Play.',
            ),
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _updating = false);
        ref.invalidate(availableUpdateProvider);
        ref.invalidate(installedVersionProvider);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final version = ref.watch(installedVersionProvider);
    final update = ref.watch(availableUpdateProvider);
    final info = update.value;
    final available =
        !update.hasError &&
        info != null &&
        (info.availability == UpdateAvailability.available ||
            info.availability == UpdateAvailability.inProgress);
    final palette = AppColors.of(context);
    final versionText = version.when(
      data: (value) => 'Current: ${value.version} (build ${value.buildNumber})',
      error: (error, stack) => 'Current version unavailable',
      loading: () => 'App version',
    );
    final checkFailed =
        update.hasError || info?.availability == UpdateAvailability.unknown;
    final statusText = available
        ? info.availableVersionCode == null
              ? 'New build available'
              : 'New build: ${info.availableVersionCode}'
        : checkFailed
        ? 'Could not check Google Play'
        : null;
    final retry = version.hasError || checkFailed;
    final action = available
        ? TextButton(
            onPressed: _updating ? null : _update,
            child: Text(_updating ? 'Opening...' : 'Update'),
          )
        : retry
        ? TextButton(
            onPressed: () {
              ref.invalidate(installedVersionProvider);
              ref.invalidate(availableUpdateProvider);
            },
            child: const Text('Retry'),
          )
        : null;

    if (widget.compact) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Icon(
                  Icons.system_update_alt_rounded,
                  color: palette.accent,
                  size: 20,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'App version',
                    style: TextStyle(
                      color: palette.text,
                      fontWeight: FontWeight.w700,
                      fontSize: 14,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              versionText,
              style: TextStyle(color: palette.muted, fontSize: 11),
            ),
            if (statusText != null || action != null)
              Row(
                children: [
                  Expanded(
                    child: Text(
                      statusText ?? '',
                      style: TextStyle(color: palette.muted, fontSize: 11),
                    ),
                  ),
                  ?action,
                ],
              ),
          ],
        ),
      );
    }

    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 12),
      leading: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: AppColors.brand.withValues(alpha: 0.14),
          borderRadius: BorderRadius.circular(12),
        ),
        child: const Icon(
          Icons.system_update_alt_rounded,
          color: AppColors.brand,
          size: 22,
        ),
      ),
      title: Text(
        'App version',
        style: TextStyle(color: palette.text, fontWeight: FontWeight.w700),
      ),
      subtitle: Text(
        [versionText, ?statusText].join('\n'),
        style: TextStyle(color: palette.muted, fontSize: 12),
      ),
      trailing: action,
    );
  }
}
