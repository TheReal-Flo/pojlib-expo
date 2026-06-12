package pojlib.util;

import android.app.Activity;

import java.io.File;
import java.util.Objects;

public class Constants {
    public static final int DEFAULT_RUNTIME_JAVA_MAJOR_VERSION = 22;

    public static final String MOJANG_META_URL = "https://piston-meta.mojang.com";

    public static final String MOJANG_RESOURCES_URL = "https://resources.download.minecraft.net";

    public static final String FABRIC_META_URL = "https://meta.fabricmc.net/v2";

    public static final String QUILT_META_URL = "https://meta.quiltmc.org/v3";

    public static final String NEOFORGE_MAVEN_URL = "https://maven.neoforged.net/releases/net/neoforged/neoforge";

    public static final String OAUTH_TOKEN_URL = "https://login.live.com/oauth20_token.srf";

    public static final String XBL_AUTH_URL = "https://user.auth.xboxlive.com/user/authenticate";

    public static final String XSTS_AUTH_URL = "https://xsts.auth.xboxlive.com/xsts/authorize";

    public static final String MC_LOGIN_URL = "https://api.minecraftservices.com/authentication/login_with_xbox";

    public static final String MC_STORE_URL = "https://api.minecraftservices.com/entitlements/mcstore";

    public static final String MC_PROFILE_URL = "https://api.minecraftservices.com/minecraft/profile";

    public static final String MINOTAR_URL = "https://minotar.net";
    public static final String GIT_BRANCH = "QuestCraft-6.0.1";
    public static String APP_PACKAGE;
    public static String USER_HOME;
    public static String INTERNAL_HOME;
    private static volatile String SELECTED_RUNTIME_FOLDER_NAME = getRuntimeFolderName(DEFAULT_RUNTIME_JAVA_MAJOR_VERSION);

    public static void initConstants(Activity activity) {
        APP_PACKAGE = activity.getPackageName();
        File externalFilesDir = activity.getExternalFilesDir(null);
        USER_HOME = (externalFilesDir != null ? externalFilesDir : activity.getFilesDir()).getAbsolutePath();
        INTERNAL_HOME = activity.getFilesDir().getAbsolutePath();
    }

    public static String requireUserHome() {
        return Objects.requireNonNull(USER_HOME, "Pojlib constants were not initialized. Call Constants.initConstants(activity) first.");
    }

    public static String requireInternalHome() {
        return Objects.requireNonNull(INTERNAL_HOME, "Pojlib constants were not initialized. Call Constants.initConstants(activity) first.");
    }

    public static File getUserHomeFile(String relativePath) {
        return new File(requireUserHome(), relativePath);
    }

    public static File getInternalHomeFile(String relativePath) {
        return new File(requireInternalHome(), relativePath);
    }

    public static File getAccountsDir() {
        return getInternalHomeFile("accounts");
    }

    public static File getRuntimeDir() {
        return getInternalHomeFile("runtimes/" + SELECTED_RUNTIME_FOLDER_NAME);
    }

    public static void selectRuntimeJavaMajorVersion(int majorVersion) {
        SELECTED_RUNTIME_FOLDER_NAME = getRuntimeFolderName(majorVersion);
    }

    public static int getSelectedRuntimeJavaMajorVersion() {
        String folderName = SELECTED_RUNTIME_FOLDER_NAME;
        if ("JRE".equals(folderName)) {
            return DEFAULT_RUNTIME_JAVA_MAJOR_VERSION;
        }
        if (folderName.startsWith("JRE-")) {
            try {
                return Integer.parseInt(folderName.substring("JRE-".length()));
            } catch (NumberFormatException ignored) {
            }
        }
        return DEFAULT_RUNTIME_JAVA_MAJOR_VERSION;
    }

    public static void selectRuntimeDirectory(File runtimeDir) {
        if (runtimeDir == null) {
            SELECTED_RUNTIME_FOLDER_NAME = getRuntimeFolderName(DEFAULT_RUNTIME_JAVA_MAJOR_VERSION);
            return;
        }
        SELECTED_RUNTIME_FOLDER_NAME = runtimeDir.getName();
    }

    public static String getRuntimeFolderName(int majorVersion) {
        int normalized = majorVersion <= 0 ? DEFAULT_RUNTIME_JAVA_MAJOR_VERSION : Math.max(DEFAULT_RUNTIME_JAVA_MAJOR_VERSION, majorVersion);
        if (normalized == DEFAULT_RUNTIME_JAVA_MAJOR_VERSION) {
            return "JRE";
        }
        return "JRE-" + normalized;
    }

    public static File getRuntimeDir(int majorVersion) {
        return getInternalHomeFile("runtimes/" + getRuntimeFolderName(majorVersion));
    }

    public static File getRuntimeArchiveFile(int majorVersion) {
        String folderName = getRuntimeFolderName(majorVersion);
        if ("JRE".equals(folderName)) {
            return getInternalHomeFile("runtimes/JRE.zip");
        }
        return getInternalHomeFile("runtimes/" + folderName + ".zip");
    }
}
