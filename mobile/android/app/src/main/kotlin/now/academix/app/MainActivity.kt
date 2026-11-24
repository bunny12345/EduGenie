package now.academix.app

import android.app.Activity
import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.content.IntentSender
import com.google.android.play.core.appupdate.AppUpdateInfo
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.model.ActivityResult
import com.google.android.play.core.install.model.AppUpdateType
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
    private val updateRequestCode = 1276
    private val channelName = "academix/focus_lock"
    private val updateManager by lazy { AppUpdateManagerFactory.create(this) }
    private var updateInfo: AppUpdateInfo? = null
    private var updateResult: MethodChannel.Result? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "academix/app_update").setMethodCallHandler { call, result ->
            when (call.method) {
                "checkForUpdate" -> {
                    updateManager.appUpdateInfo
                        .addOnSuccessListener { info ->
                            updateInfo = info
                            result.success(mapOf(
                                "availability" to info.updateAvailability(),
                                "availableVersionCode" to info.availableVersionCode(),
                                "immediateAllowed" to info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE),
                                "packageName" to info.packageName()
                            ))
                        }
                        .addOnFailureListener { error -> result.error("CHECK_FAILED", error.message, null) }
                }
                "performImmediateUpdate" -> {
                    val info = updateInfo
                    when {
                        info == null -> result.error("CHECK_REQUIRED", "Check for updates first.", null)
                        updateResult != null -> result.error("UPDATE_IN_PROGRESS", "An update is already in progress.", null)
                        else -> {
                            updateInfo = null
                            updateResult = result
                            try {
                                val started = updateManager.startUpdateFlowForResult(
                                    info, this, AppUpdateOptions.defaultOptions(AppUpdateType.IMMEDIATE), updateRequestCode
                                )
                                if (!started) {
                                    updateResult = null
                                    result.error("UPDATE_FAILED", "Google Play could not start the update.", null)
                                }
                            } catch (error: IntentSender.SendIntentException) {
                                updateResult = null
                                result.error("UPDATE_FAILED", error.message, null)
                            } catch (error: IllegalStateException) {
                                updateResult = null
                                result.error("UPDATE_FAILED", error.message, null)
                            }
                        }
                    }
                }
                else -> result.notImplemented()
            }
        }
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

    @Deprecated("Deprecated in Android")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != updateRequestCode) return
        val result = updateResult ?: return
        updateResult = null
        when (resultCode) {
            Activity.RESULT_OK -> result.success("started")
            Activity.RESULT_CANCELED -> result.success("cancelled")
            ActivityResult.RESULT_IN_APP_UPDATE_FAILED -> result.error("UPDATE_FAILED", "Google Play could not complete the update.", null)
            else -> result.error("UPDATE_FAILED", "Unexpected update result: $resultCode", null)
        }
    }
}
