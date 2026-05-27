package dev.justfeli.pojlibexpo;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.os.Build;
import android.util.Log;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import androidx.core.content.ContextCompat;

import pojlib.API;
import pojlib.PojlibRuntimeActivity;
import pojlib.account.MinecraftAccount;
import pojlib.util.Constants;
import pojlib.util.Logger;
import pojlib.util.json.MinecraftInstances;

public class PojlibVrActivity extends PojlibRuntimeActivity {
  public static final String EXTRA_INSTANCE_NAME = "dev.justfeli.pojlibexpo.INSTANCE_NAME";
  public static final String EXTRA_ACCOUNT_UUID = "dev.justfeli.pojlibexpo.ACCOUNT_UUID";
  private static final int REQUEST_RECORD_AUDIO_PERMISSION = 1001;
  private static volatile boolean vrProcessActive = false;

  private volatile boolean launchStarted = false;
  private boolean terminateProcessOnDestroy = true;
  private Thread.UncaughtExceptionHandler previousUncaughtExceptionHandler;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    if (vrProcessActive) {
      terminateProcessOnDestroy = false;
      Logger.getInstance().appendToLog("PojlibVrActivity: Duplicate VR activity detected, finishing the new instance.");
      finish();
      return;
    }
    vrProcessActive = true;
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    applyVrWindowMode();
    installCrashLogger();
    Logger.getInstance().appendToLog("PojlibVrActivity: Created VR activity.");
    getWindow().getDecorView().post(this::startLaunchWhenReady);
  }

  @Override
  protected void onResume() {
    super.onResume();
    applyVrWindowMode();
    Logger.getInstance().appendToLog("PojlibVrActivity: Resumed.");
  }

  @Override
  protected void onStart() {
    super.onStart();
    Logger.getInstance().appendToLog("PojlibVrActivity: Started.");
  }

  @Override
  protected void onPause() {
    Logger.getInstance().appendToLog(
      "PojlibVrActivity: Paused. finishing=" + isFinishing() +
        ", changingConfigurations=" + isChangingConfigurations()
    );
    super.onPause();
  }

  @Override
  protected void onStop() {
    Logger.getInstance().appendToLog(
      "PojlibVrActivity: Stopped. finishing=" + isFinishing() +
        ", changingConfigurations=" + isChangingConfigurations()
    );
    super.onStop();
  }

  @Override
  protected void onDestroy() {
    vrProcessActive = false;
    if (launchStarted && !API.gameReady && isFinishing()) {
      Logger.getInstance().appendToLog("PojlibVrActivity: Finishing before game became ready, archiving current log.");
      Logger.getInstance().archiveCurrentLogToLastSession();
    }
    restoreCrashLogger();
    Logger.getInstance().appendToLog("PojlibVrActivity: Destroyed.");
    super.onDestroy();
    if (terminateProcessOnDestroy && isFinishing() && !isChangingConfigurations()) {
      android.os.Process.killProcess(android.os.Process.myPid());
      System.exit(0);
    }
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    if (hasFocus) {
      applyVrWindowMode();
    }
    Logger.getInstance().appendToLog(
      "PojlibVrActivity: Window focus changed. hasFocus=" + hasFocus +
        ", launchStarted=" + launchStarted
    );
  }

  @Override
  protected void onUserLeaveHint() {
    Logger.getInstance().appendToLog("PojlibVrActivity: onUserLeaveHint.");
    super.onUserLeaveHint();
  }

  @Override
  public void finish() {
    Logger.getInstance().appendToLog(
      "PojlibVrActivity: finish() requested. finishing=" + isFinishing() +
        ", launchStarted=" + launchStarted +
        ", gameReady=" + API.gameReady
    );
    Logger.getInstance().appendToLog(Log.getStackTraceString(new Throwable("PojlibVrActivity.finish trace")));
    super.finish();
  }

  @Override
  public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    if (requestCode != REQUEST_RECORD_AUDIO_PERMISSION) {
      return;
    }

    if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
      Logger.getInstance().appendToLog("PojlibVrActivity: Microphone permission granted.");
      startLaunchFromIntent();
      return;
    }

    Logger.getInstance().appendToLog("PojlibVrActivity: Microphone permission denied, finishing VR activity.");
    finish();
  }

  private void applyVrWindowMode() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      getWindow().setDecorFitsSystemWindows(false);
      WindowInsetsController controller = getWindow().getInsetsController();
      if (controller != null) {
        controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
        controller.setSystemBarsBehavior(
          WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        );
      }
      return;
    }

    View decorView = getWindow().getDecorView();
    decorView.setSystemUiVisibility(
      View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
        | View.SYSTEM_UI_FLAG_FULLSCREEN
        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
    );
  }

  private void startLaunchWhenReady() {
    if (hasRecordAudioPermission()) {
      startLaunchFromIntent();
      return;
    }

    Logger.getInstance().appendToLog("PojlibVrActivity: Requesting microphone permission for voice chat.");
    requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQUEST_RECORD_AUDIO_PERMISSION);
  }

  private boolean hasRecordAudioPermission() {
    return ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
      == PackageManager.PERMISSION_GRANTED;
  }

  private void startLaunchFromIntent() {
    if (launchStarted) {
      return;
    }
    launchStarted = true;
    final String instanceName = getIntent().getStringExtra(EXTRA_INSTANCE_NAME);
    final String accountUuid = getIntent().getStringExtra(EXTRA_ACCOUNT_UUID);

    if (instanceName == null || accountUuid == null) {
      Logger.getInstance().appendToLog("PojlibVrActivity: Missing launch extras, closing VR activity.");
      finish();
      return;
    }

    Logger.getInstance().appendToLog("PojlibVrActivity: Launch requested for instance '" + instanceName + "'.");

    new Thread(() -> {
      try {
        Constants.initConstants(this);

        MinecraftAccount account = MinecraftAccount.load(Constants.getAccountsDir().getAbsolutePath(), accountUuid);
        if (account == null) {
          throw new IllegalStateException("Account '" + accountUuid + "' was not found for VR launch.");
        }

        MinecraftInstances instances = API.loadAll();
        MinecraftInstances.Instance instance = API.load(instances, instanceName);
        if (instance == null) {
          throw new IllegalStateException("Instance '" + instanceName + "' was not found for VR launch.");
        }

        API.currentAcc = account;
        API.profileImage = MinecraftAccount.getSkinFaceUrl(account);
        API.profileName = account.username;
        API.profileUUID = account.uuid;
        API.isDemoMode = account.isDemoMode;

        API.launchInstance(this, account, instance);
      } catch (Throwable throwable) {
        Logger.getInstance().appendThrowable("PojlibVrActivity: Failed to launch instance.", throwable);
        Logger.getInstance().archiveCurrentLogToLastSession();
        runOnUiThread(this::finish);
      }
    }, "PojlibVrLaunch").start();
  }

  private void installCrashLogger() {
    previousUncaughtExceptionHandler = Thread.getDefaultUncaughtExceptionHandler();
    Thread.setDefaultUncaughtExceptionHandler((thread, throwable) -> {
      try {
        Constants.initConstants(this);
        Logger.getInstance().appendThrowable(
          "PojlibVrActivity: Uncaught exception on thread '" + thread.getName() + "'.",
          throwable
        );
        Logger.getInstance().archiveCurrentLogToLastSession();
      } catch (Throwable ignored) {
        // Nothing else to do here.
      }

      if (previousUncaughtExceptionHandler != null) {
        previousUncaughtExceptionHandler.uncaughtException(thread, throwable);
      }
    });
  }

  private void restoreCrashLogger() {
    if (Thread.getDefaultUncaughtExceptionHandler() != null
      && Thread.getDefaultUncaughtExceptionHandler() != previousUncaughtExceptionHandler) {
      Thread.setDefaultUncaughtExceptionHandler(previousUncaughtExceptionHandler);
    }
  }
}
