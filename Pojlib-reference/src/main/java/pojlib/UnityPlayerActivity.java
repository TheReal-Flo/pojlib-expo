package pojlib;

import android.app.Activity;
import android.content.ClipboardManager;
import android.util.DisplayMetrics;

import java.io.IOException;

@Deprecated
public class UnityPlayerActivity extends PojlibRuntimeActivity {
    public static volatile ClipboardManager GLOBAL_CLIPBOARD;
    public static volatile DisplayMetrics currentDisplayMetrics;

    public static String installLWJGL(Activity activity) throws IOException {
        return PojlibRuntimeHost.installLWJGL(activity);
    }

    public void reinitUnity() {
        reinitRuntime();
    }

    public static DisplayMetrics getDisplayMetrics(Activity activity) {
        DisplayMetrics metrics = PojlibRuntimeHost.getDisplayMetrics(activity);
        currentDisplayMetrics = metrics;
        return metrics;
    }

    public static void updateWindowSize(Activity activity) {
        PojlibRuntimeHost.updateWindowSize(activity);
        currentDisplayMetrics = PojlibRuntimeHost.currentDisplayMetrics;
        GLOBAL_CLIPBOARD = PojlibRuntimeHost.GLOBAL_CLIPBOARD;
    }

    public static float dpToPx(float dp) {
        return PojlibRuntimeHost.dpToPx(dp);
    }

    public static float pxToDp(float px) {
        return PojlibRuntimeHost.pxToDp(px);
    }

    public static void querySystemClipboard() {
        PojlibRuntimeHost.querySystemClipboard();
        GLOBAL_CLIPBOARD = PojlibRuntimeHost.GLOBAL_CLIPBOARD;
    }

    public static void putClipboardData(String data, String mimeType) {
        PojlibRuntimeHost.putClipboardData(data, mimeType);
        GLOBAL_CLIPBOARD = PojlibRuntimeHost.GLOBAL_CLIPBOARD;
    }
}
