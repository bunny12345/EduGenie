package com.example.mobile

import android.app.ActivityManager
import android.content.Context
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

/// Backs the "Focus Mode" parental lock — pins the app to the foreground via
/// Android's screen-pinning (Lock Task) API so the student can't switch to
/// another app. No Device Owner/MDM provisioning involved, so a determined
/// user can still reach the OS's own unpin prompt via the Back+Recents
/// hardware gesture (that asks for the device's own screen-lock credential,
/// not AcademiX's parent PIN) — this is the real ceiling for a normal,
/// self-installed app. The in-app PIN only gates our own exit flow.
class MainActivity : FlutterActivity() {
    private val channelName = "academix/focus_lock"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, channelName).setMethodCallHandler { call, result ->
            when (call.method) {
                "startLockTask" -> {
                    try {
                        startLockTask()
                        result.success(true)
                    } catch (e: Exception) {
                        result.success(false)
                    }
                }
                "stopLockTask" -> {
                    try {
                        stopLockTask()
                        result.success(true)
                    } catch (e: Exception) {
                        result.success(false)
                    }
                }
                "isLockTaskActive" -> {
                    val am = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
                    result.success(am.lockTaskModeState != ActivityManager.LOCK_TASK_MODE_NONE)
                }
                else -> result.notImplemented()
            }
        }
    }
}
