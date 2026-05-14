package pojlib;

import static android.os.Build.VERSION.SDK_INT;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Process;
import android.util.DisplayMetrics;
import android.view.WindowManager;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

import pojlib.input.AWTInputBridge;
import pojlib.util.Constants;
import pojlib.util.FileUtil;
import pojlib.util.Logger;
import org.lwjgl.glfw.CallbackBridge;

public final class PojlibRuntimeHost {
    public static volatile ClipboardManager GLOBAL_CLIPBOARD;
    public static volatile DisplayMetrics currentDisplayMetrics;
    private static volatile Activity currentActivity;

    private PojlibRuntimeHost() {}

    public static void attachActivity(Activity activity) {
        currentActivity = activity;
        if (GLOBAL_CLIPBOARD == null) {
            GLOBAL_CLIPBOARD = (ClipboardManager) activity.getSystemService(Activity.CLIPBOARD_SERVICE);
        }
        updateWindowSize(activity);
    }

    public static Activity getCurrentActivity() {
        return currentActivity;
    }

    public static String installLWJGL(Activity activity) throws IOException {
        Logger.getInstance().appendToLog("Checking LWJGL");
        File lwjgl = new File(Constants.USER_HOME + "/lwjgl3/lwjgl-glfw-classes.jar");
        byte[] lwjglAsset = FileUtil.loadFromAssetToByte(activity, "lwjgl/lwjgl-glfw-classes.jar");

        if (!lwjgl.exists()) {
            Objects.requireNonNull(lwjgl.getParentFile()).mkdirs();
            FileUtil.write(lwjgl.getAbsolutePath(), lwjglAsset);
        } else if (!FileUtil.matchingAssetFile(lwjgl, lwjglAsset)) {
            lwjgl.delete();
            Objects.requireNonNull(lwjgl.getParentFile()).mkdirs();
            FileUtil.write(lwjgl.getAbsolutePath(), lwjglAsset);
        }

        Logger.getInstance().appendToLog("LWJGL installed");
        return lwjgl.getAbsolutePath();
    }

    public static File installNativeLibraries(Activity activity) throws IOException {
        File sourceDir = new File(activity.getApplicationInfo().nativeLibraryDir);
        File targetDir = Constants.getInternalHomeFile("native-libs");
        FileUtil.ensureDirectory(targetDir);

        File[] sourceFiles = sourceDir.listFiles((dir, name) -> name.endsWith(".so"));
        if (sourceFiles == null || sourceFiles.length == 0) {
            throw new IOException("No native libraries were found in " + sourceDir.getAbsolutePath());
        }

        List<String> copiedLibraries = new ArrayList<>();
        for (File sourceFile : sourceFiles) {
            File targetFile = new File(targetDir, sourceFile.getName());
            if (!targetFile.exists() || targetFile.length() != sourceFile.length()) {
                Files.copy(sourceFile.toPath(), targetFile.toPath(), StandardCopyOption.REPLACE_EXISTING);
            }
            copiedLibraries.add(sourceFile.getName());
        }

        Logger.getInstance().appendToLog(
            "Installed " + copiedLibraries.size() + " native libraries to " + targetDir.getAbsolutePath()
        );
        return targetDir;
    }

    public static void restartRuntime(Activity activity) {
        activity.runOnUiThread(() -> {
            Intent start = activity.getPackageManager().getLaunchIntentForPackage(activity.getApplicationInfo().packageName);
            if (start == null) {
                Logger.getInstance().appendToLog("Unable to restart runtime: launch intent missing.");
                return;
            }
            start.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
            activity.startActivity(start);
            activity.finish();
            Process.killProcess(Process.myPid());
        });
    }

    public static DisplayMetrics getDisplayMetrics(Activity activity) {
        DisplayMetrics displayMetrics = new DisplayMetrics();

        if (activity.isInMultiWindowMode() || activity.isInPictureInPictureMode()) {
            displayMetrics = activity.getResources().getDisplayMetrics();
        } else {
            if (SDK_INT >= Build.VERSION_CODES.R) {
                activity.getDisplay().getRealMetrics(displayMetrics);
            } else {
                activity.getWindowManager().getDefaultDisplay().getRealMetrics(displayMetrics);
            }
        }
        currentDisplayMetrics = displayMetrics;
        return displayMetrics;
    }

    public static void updateWindowSize(Activity activity) {
        currentDisplayMetrics = getDisplayMetrics(activity);
        CallbackBridge.physicalWidth = currentDisplayMetrics.widthPixels;
        CallbackBridge.physicalHeight = currentDisplayMetrics.heightPixels;
    }

    public static float dpToPx(float dp) {
        return currentDisplayMetrics == null ? dp : dp * currentDisplayMetrics.density;
    }

    public static float pxToDp(float px) {
        return currentDisplayMetrics == null ? px : px / currentDisplayMetrics.density;
    }

    public static void querySystemClipboard() {
        if (GLOBAL_CLIPBOARD == null) {
            AWTInputBridge.nativeClipboardReceived(null, null);
            return;
        }

        ClipData clipData = GLOBAL_CLIPBOARD.getPrimaryClip();
        if (clipData == null) {
            AWTInputBridge.nativeClipboardReceived(null, null);
            return;
        }
        ClipData.Item firstClipItem = clipData.getItemAt(0);
        CharSequence clipItemText = firstClipItem.getText();
        if (clipItemText == null) {
            AWTInputBridge.nativeClipboardReceived(null, null);
            return;
        }
        AWTInputBridge.nativeClipboardReceived(clipItemText.toString(), "plain");
    }

    public static void putClipboardData(String data, String mimeType) {
        if (GLOBAL_CLIPBOARD == null) {
            return;
        }

        ClipData clipData = null;
        switch (mimeType) {
            case "text/plain":
                clipData = ClipData.newPlainText("AWT Paste", data);
                break;
            case "text/html":
                clipData = ClipData.newHtmlText("AWT Paste", data, data);
                break;
        }
        if (clipData != null) {
            GLOBAL_CLIPBOARD.setPrimaryClip(clipData);
        }
    }

    public static void openLink(String uri) {
        Activity activity = currentActivity;
        if (activity == null) {
            return;
        }

        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(uri));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(intent);
        } catch (ActivityNotFoundException exception) {
            Logger.getInstance().appendToLog("Unable to open link: " + uri + " | " + exception);
        }
    }

    public static void openPath(String path) {
        Activity activity = currentActivity;
        if (activity == null) {
            return;
        }

        try {
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            intent.setData(Uri.fromFile(new File(path)));
            activity.startActivity(intent);
        } catch (ActivityNotFoundException exception) {
            Logger.getInstance().appendToLog("Unable to open path: " + path + " | " + exception);
        }
    }
}
