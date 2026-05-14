package dev.justfeli.pojlibexpo;

import android.os.Bundle;
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

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
  }

  @Override
  protected void onResume() {
    super.onResume();
    resumed = true;
    maybeStartLaunch();
  }

  @Override
  protected void onPause() {
    resumed = false;
    super.onPause();
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    hasWindowFocus = hasFocus;
    if (hasFocus) {
      maybeStartLaunch();
    }
  }

  private void maybeStartLaunch() {
    if (launchStarted || !resumed || !hasWindowFocus) {
      return;
    }

    launchStarted = true;
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
        Logger.getInstance().appendToLog("PojlibVrActivity: Failed to launch instance.\n" + throwable);
        runOnUiThread(this::finish);
      }
    }, "PojlibVrLaunch").start();
  }
}
