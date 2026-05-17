package dev.justfeli.pojlibexpo;

import android.os.Bundle;
import android.util.Log;
import android.view.WindowManager;

import pojlib.API;
import pojlib.PojlibRuntimeActivity;
import pojlib.account.MinecraftAccount;
import pojlib.util.Constants;
import pojlib.util.Logger;
import pojlib.util.json.MinecraftInstances;

public class PojlibVrActivity extends PojlibRuntimeActivity {
  public static final String EXTRA_INSTANCE_NAME = "dev.justfeli.pojlibexpo.INSTANCE_NAME";
  public static final String EXTRA_ACCOUNT_UUID = "dev.justfeli.pojlibexpo.ACCOUNT_UUID";

  private volatile boolean launchStarted = false;
  private volatile boolean resumed = false;
  private volatile boolean hasWindowFocus = false;
  private Thread.UncaughtExceptionHandler previousUncaughtExceptionHandler;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    installCrashLogger();
    Logger.getInstance().appendToLog("PojlibVrActivity: Created VR activity.");
  }

  @Override
  protected void onResume() {
    super.onResume();
    resumed = true;
    Logger.getInstance().appendToLog("PojlibVrActivity: Resumed.");
    maybeStartLaunch();
  }

  @Override
  protected void onStart() {
    super.onStart();
    Logger.getInstance().appendToLog("PojlibVrActivity: Started.");
  }

  @Override
  protected void onPause() {
    resumed = false;
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
    if (launchStarted && !API.gameReady && isFinishing()) {
      Logger.getInstance().appendToLog("PojlibVrActivity: Finishing before game became ready, archiving current log.");
      Logger.getInstance().archiveCurrentLogToLastSession();
    }
    restoreCrashLogger();
    Logger.getInstance().appendToLog("PojlibVrActivity: Destroyed.");
    super.onDestroy();
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    hasWindowFocus = hasFocus;
    Logger.getInstance().appendToLog(
      "PojlibVrActivity: Window focus changed. hasFocus=" + hasFocus +
        ", launchStarted=" + launchStarted +
        ", resumed=" + resumed
    );
    if (hasFocus) {
      maybeStartLaunch();
    }
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

  private void maybeStartLaunch() {
    if (launchStarted || !resumed || !hasWindowFocus) {
      return;
    }

    launchStarted = true;
    Logger.getInstance().appendToLog("PojlibVrActivity: Window focused, starting launch shortly.");
    getWindow().getDecorView().postDelayed(this::startLaunchFromIntent, 250L);
  }

  private void startLaunchFromIntent() {
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
