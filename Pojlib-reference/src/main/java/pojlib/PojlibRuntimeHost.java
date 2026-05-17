package pojlib;

import static android.os.Build.VERSION.SDK_INT;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.pm.ApplicationInfo;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Process;
import android.util.DisplayMetrics;
import android.view.WindowManager;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

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
        clearSharedLibraries(targetDir);

        File[] sourceFiles = sourceDir.listFiles((dir, name) -> name.endsWith(".so"));
        List<String> copiedLibraries = new ArrayList<>();
        if (sourceFiles != null && sourceFiles.length > 0) {
            copySharedLibraries(sourceFiles, targetDir, copiedLibraries);
            Logger.getInstance().appendToLog(
                "Installed " + copiedLibraries.size() + " native libraries from " +
                    sourceDir.getAbsolutePath() + " to " + targetDir.getAbsolutePath()
            );
            return targetDir;
        }

        copiedLibraries = extractSharedLibrariesFromInstalledApks(activity, targetDir);
        if (!copiedLibraries.isEmpty()) {
            Logger.getInstance().appendToLog(
                "Installed " + copiedLibraries.size() + " native libraries from installed APKs to " +
                    targetDir.getAbsolutePath()
            );
            return targetDir;
        }

        ApplicationInfo applicationInfo = activity.getApplicationInfo();
        throw new IOException(
            "No native libraries were found in " + sourceDir.getAbsolutePath() +
                " or inside the installed APKs. sourceDir=" + applicationInfo.sourceDir +
                ", splitSourceDirs=" + joinPaths(applicationInfo.splitSourceDirs)
        );
    }

    private static void copySharedLibraries(File[] sourceFiles, File targetDir, List<String> copiedLibraries)
        throws IOException {
        for (File sourceFile : sourceFiles) {
            File targetFile = new File(targetDir, sourceFile.getName());
            if (!targetFile.exists() || targetFile.length() != sourceFile.length()) {
                Files.copy(sourceFile.toPath(), targetFile.toPath(), StandardCopyOption.REPLACE_EXISTING);
            }
            copiedLibraries.add(sourceFile.getName());
        }
    }

    private static List<String> extractSharedLibrariesFromInstalledApks(Activity activity, File targetDir)
        throws IOException {
        ApplicationInfo applicationInfo = activity.getApplicationInfo();
        List<String> apkPaths = new ArrayList<>();
        if (applicationInfo.sourceDir != null && !applicationInfo.sourceDir.isEmpty()) {
            apkPaths.add(applicationInfo.sourceDir);
        }
        if (applicationInfo.splitSourceDirs != null) {
            for (String splitSourceDir : applicationInfo.splitSourceDirs) {
                if (splitSourceDir != null && !splitSourceDir.isEmpty()) {
                    apkPaths.add(splitSourceDir);
                }
            }
        }

        Set<String> preferredAbiDirs = new LinkedHashSet<>();
        preferredAbiDirs.add("arm64-v8a");
        for (String abi : Build.SUPPORTED_64_BIT_ABIS) {
            preferredAbiDirs.add(abi);
        }
        for (String abi : Build.SUPPORTED_ABIS) {
            preferredAbiDirs.add(abi);
        }

        List<String> copiedLibraries = new ArrayList<>();
        Set<String> copiedNames = new LinkedHashSet<>();
        for (String apkPath : apkPaths) {
            File apkFile = new File(apkPath);
            if (!apkFile.isFile()) {
                continue;
            }

            try (ZipFile zipFile = new ZipFile(apkFile)) {
                for (String abi : preferredAbiDirs) {
                    extractLibrariesFromZipDirectory(zipFile, "lib/" + abi + "/", targetDir, copiedLibraries, copiedNames);
                    extractLibrariesFromZipDirectory(zipFile, "jni/" + abi + "/", targetDir, copiedLibraries, copiedNames);
                }
            }
        }
        return copiedLibraries;
    }

    private static void extractLibrariesFromZipDirectory(
        ZipFile zipFile,
        String directoryPrefix,
        File targetDir,
        List<String> copiedLibraries,
        Set<String> copiedNames
    ) throws IOException {
        List<? extends ZipEntry> entries = java.util.Collections.list(zipFile.entries());
        for (ZipEntry entry : entries) {
            if (entry.isDirectory() || !entry.getName().startsWith(directoryPrefix) || !entry.getName().endsWith(".so")) {
                continue;
            }

            String fileName = entry.getName().substring(entry.getName().lastIndexOf('/') + 1);
            if (!copiedNames.add(fileName)) {
                continue;
            }

            File targetFile = new File(targetDir, fileName);
            try (InputStream inputStream = zipFile.getInputStream(entry);
                 FileOutputStream outputStream = new FileOutputStream(targetFile, false)) {
                byte[] buffer = new byte[8192];
                int read;
                while ((read = inputStream.read(buffer)) != -1) {
                    outputStream.write(buffer, 0, read);
                }
            }
            copiedLibraries.add(fileName);
        }
    }

    private static void clearSharedLibraries(File targetDir) {
        File[] existingFiles = targetDir.listFiles((dir, name) -> name.endsWith(".so"));
        if (existingFiles == null) {
            return;
        }
        for (File existingFile : existingFiles) {
            if (!existingFile.delete()) {
                Logger.getInstance().appendToLog(
                    "Unable to remove stale native library before restaging: " + existingFile.getAbsolutePath()
                );
            }
        }
    }

    private static String joinPaths(String[] paths) {
        if (paths == null || paths.length == 0) {
            return "<none>";
        }
        StringBuilder builder = new StringBuilder();
        for (int i = 0; i < paths.length; i++) {
            if (i > 0) {
                builder.append(", ");
            }
            builder.append(paths[i]);
        }
        return builder.toString();
    }

    public static void restartRuntime(Activity activity) {
        Logger.getInstance().appendToLog(
            "PojlibRuntimeHost: restartRuntime requested. activity=" +
                (activity == null ? "<null>" : activity.getClass().getName()) +
                ", currentActivity=" +
                (currentActivity == null ? "<null>" : currentActivity.getClass().getName()) +
                ", thread=" + Thread.currentThread().getName()
        );
        Logger.getInstance().appendThrowable(
            "PojlibRuntimeHost: restartRuntime caller trace.",
            new Throwable("restartRuntime")
        );
        if (activity == null) {
            Logger.getInstance().appendToLog("PojlibRuntimeHost: restartRuntime aborted because activity is null.");
            return;
        }
        activity.runOnUiThread(() -> {
            Intent start = activity.getPackageManager().getLaunchIntentForPackage(activity.getApplicationInfo().packageName);
            if (start == null) {
                Logger.getInstance().appendToLog("Unable to restart runtime: launch intent missing.");
                return;
            }
            Logger.getInstance().appendToLog(
                "PojlibRuntimeHost: restartRuntime launching intent. component=" +
                    start.getComponent() +
                    ", package=" + start.getPackage() +
                    ", flags(before)=" + start.getFlags()
            );
            start.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
            Logger.getInstance().appendToLog(
                "PojlibRuntimeHost: restartRuntime startActivity with flags=" + start.getFlags()
            );
            activity.startActivity(start);
            Logger.getInstance().appendToLog("PojlibRuntimeHost: restartRuntime calling finish() on activity.");
            activity.finish();
            Logger.getInstance().appendToLog("PojlibRuntimeHost: restartRuntime killing process pid=" + Process.myPid());
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
