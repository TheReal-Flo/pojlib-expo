package pojlib.install;

import android.app.Activity;

import com.google.gson.Gson;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import org.apache.commons.io.FileUtils;

import pojlib.PojlibRuntimeHost;
import pojlib.APIHandler;
import pojlib.util.GsonUtils;
import pojlib.util.JREUtils;
import pojlib.util.download.DownloadManager;
import pojlib.util.download.DownloadUtils;
import pojlib.util.json.MinecraftInstances;
import pojlib.util.*;

import java.io.File;
import java.io.IOException;
import java.io.BufferedReader;
import java.io.FileReader;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.HashMap;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.StringJoiner;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Future;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

//This class reads data from a game version json and downloads its contents.
//This works for the base game as well as mod loaders
public class Installer {
    private static final String DEFAULT_JRE_22_URL = "https://github.com/QuestCraftPlusPlus/android-openjdk-build-multiarch/releases/latest/download/JRE.zip";
    private static final String DEFAULT_JRE_25_URL = "https://github.com/QuestCraftPlusPlus/android-openjdk-build-multiarch/releases/latest/download/JRE25.zip";

    public static int resolveRequiredJavaMajorVersion(VersionInfo versionInfo) {
        int requiredVersion = versionInfo == null ? 0 : versionInfo.getRequiredJavaMajorVersion();
        if (requiredVersion <= 0) {
            return Constants.DEFAULT_RUNTIME_JAVA_MAJOR_VERSION;
        }
        return Math.max(Constants.DEFAULT_RUNTIME_JAVA_MAJOR_VERSION, requiredVersion);
    }

    public static File installJVM(Activity activity) throws IOException {
        return installJVM(activity, Constants.DEFAULT_RUNTIME_JAVA_MAJOR_VERSION);
    }

    public static File installJVM(Activity activity, VersionInfo versionInfo) throws IOException {
        return installJVM(activity, resolveRequiredJavaMajorVersion(versionInfo));
    }

    public static File installJVM(Activity activity, int requiredJavaMajorVersion) throws IOException {
        int runtimeMajorVersion = requiredJavaMajorVersion <= 0
                ? Constants.DEFAULT_RUNTIME_JAVA_MAJOR_VERSION
                : Math.max(Constants.DEFAULT_RUNTIME_JAVA_MAJOR_VERSION, requiredJavaMajorVersion);
        Constants.selectRuntimeJavaMajorVersion(runtimeMajorVersion);

        Logger.getInstance().appendToLog("Checking JRE for Java " + runtimeMajorVersion);
        File jre = findInstalledRuntime(runtimeMajorVersion);
        if (jre == null) {
            jre = installRuntimeArchive(activity, runtimeMajorVersion);
        } else {
            Logger.getInstance().appendToLog("Using installed runtime: " + jre.getAbsolutePath());
        }

        Constants.selectRuntimeDirectory(jre);
        Logger.getInstance().appendToLog("JRE installed");
        return jre;
    }

    // Will only download client if it is missing, however it will overwrite if sha1 does not match the downloaded client
    // Returns client classpath
    public static CompletableFuture<String> installClient(VersionInfo minecraftVersionInfo, String gameDir) throws IOException {
        return CompletableFuture.supplyAsync(() -> {
            Logger.getInstance().appendToLog("Checking Client");

            File clientFile = new File(gameDir + "/versions/" + minecraftVersionInfo.id + "/client.jar");

            try {
                for (int i = 0; i < 5; i++) {
                    if (i == 4)
                        throw new RuntimeException("Client download failed after 5 retries");

                    if (!clientFile.exists()) {
                        DownloadUtils.downloadFile(minecraftVersionInfo.downloads.client.url, clientFile);
                    } else if (DownloadUtils.compareSHA1(clientFile, minecraftVersionInfo.downloads.client.sha1)) {
                        clientFile.delete();
                        DownloadUtils.downloadFile(minecraftVersionInfo.downloads.client.url, clientFile);
                    }

                    // Check if the downloaded client matches the expected SHA1 hash
                    if (DownloadUtils.compareSHA1(clientFile, minecraftVersionInfo.downloads.client.sha1)) {
                        Logger.getInstance().appendToLog("Client downloaded");
                        return clientFile.getAbsolutePath();
                    }
                }
            } catch (IOException e) {
                Logger.getInstance().appendToLog("Failed to download client: " + e.getMessage());
                e.printStackTrace();
            }
            return null;
        });
    }

    // Will only download library if it is missing, however it will overwrite if sha1 does not match the downloaded library
    // Returns the classpath of the downloaded libraries
    public static CompletableFuture<String> installLibraries(VersionInfo versionInfo, String gameDir) throws IOException {
        return CompletableFuture.supplyAsync(() -> {
            Logger.getInstance().appendToLog("Checking Libraries for: " + versionInfo.id);
            StringJoiner classpath = new StringJoiner(File.pathSeparator);
            LinkedHashSet<String> seenClasspathEntries = new LinkedHashSet<>();

            for (VersionInfo.Library library : versionInfo.libraries) {
                if (library.name.contains("lwjgl")) {
                    continue;
                }
                if (library.name.contains("org.ow2.asm") && versionInfo.inheritsFrom == null) {
                    continue;
                }
                for (int i = 0; i < 5; i++) {
                    if (i == 4)
                        throw new RuntimeException(String.format("Library download of %s failed after 5 retries", library.name));

                    File libraryFile;
                    String sha1;

                    //Null means mod lib, otherwise vanilla lib
                    try {
                        if (library.downloads == null) {
                            String path = parseLibraryNameToPath(library.name);
                            libraryFile = new File(gameDir + "/libraries/", path);
                            sha1 = APIHandler.getRaw(library.url + path + ".sha1");
                            if (!libraryFile.exists()) {
                                Logger.getInstance().appendToLog("Downloading: " + library.name);
                                DownloadUtils.downloadFile(library.url + path, libraryFile);
                            }
                        } else {
                            VersionInfo.Library.Artifact artifact = library.downloads.artifact;
                            libraryFile = new File(gameDir + "/libraries/", artifact.path);
                            sha1 = artifact.sha1;
                            if (!libraryFile.exists()) {
                                Logger.getInstance().appendToLog("Downloading: " + library.name);
                                DownloadUtils.downloadFile(artifact.url, libraryFile, artifact.size);
                            }
                        }
                        if (DownloadUtils.compareSHA1(libraryFile, sha1)) {
                            String absolutePath = libraryFile.getAbsolutePath();
                            if (seenClasspathEntries.add(absolutePath)) {
                                classpath.add(absolutePath);
                            }
                            break;
                        }
                    } catch (IOException e) {
                        e.printStackTrace();
                    }
                }
            }

            // DNS SRV Resolver fix
            String resConfHackPath = Constants.USER_HOME + "/hacks/ResConfHack.jar";
            if (seenClasspathEntries.add(resConfHackPath)) {
                classpath.add(resConfHackPath);
            }

            Logger.getInstance().appendToLog("Libraries installed");
            return classpath.toString();
        });
    }

    public static VersionInfo installNeoForge(Activity activity, String gameDir, String minecraftVersion) throws IOException {
        Logger.getInstance().appendToLog("Checking NeoForge");
        NeoForgeMeta.NeoForgeVersion neoForgeVersion = NeoForgeMeta.getLatestVersion(minecraftVersion);
        if (neoForgeVersion == null) {
            throw new IOException("No NeoForge build was found for Minecraft " + minecraftVersion + ".");
        }
        Logger.getInstance().appendToLog(
                "Resolved NeoForge " + neoForgeVersion.version + " for Minecraft " + minecraftVersion
        );

        File versionJson = new File(
                gameDir + "/versions/" + neoForgeVersion.getVersionId() + "/" + neoForgeVersion.getVersionId() + ".json"
        );
        if (versionJson.exists()) {
            VersionInfo installed = GsonUtils.jsonFileToObject(versionJson.getAbsolutePath(), VersionInfo.class);
            if (installed != null) {
                Logger.getInstance().appendToLog("NeoForge already installed: " + neoForgeVersion.version);
                return installed;
            }
        }

        installJVM(activity, MinecraftMeta.getVersionInfo(minecraftVersion));

        File installRoot = new File(gameDir);
        installRoot.mkdirs();

        File launcherProfiles = new File(installRoot, "launcher_profiles.json");
        if (!launcherProfiles.exists()) {
            HashMap<String, Object> launcherProfileStub = new HashMap<>();
            launcherProfileStub.put("profiles", new HashMap<String, Object>());
            launcherProfileStub.put("settings", new HashMap<String, Object>());
            launcherProfileStub.put("version", 2);
            GsonUtils.objectToJsonFile(launcherProfiles.getAbsolutePath(), launcherProfileStub);
        }

        File installerJar = new File(gameDir + "/setup/neoforge-" + neoForgeVersion.version + "-installer.jar");
        if (!installerJar.exists()) {
            Logger.getInstance().appendToLog("Downloading NeoForge installer: " + neoForgeVersion.version);
            DownloadUtils.downloadFile(neoForgeVersion.getInstallerUrl(), installerJar);
        }
        Logger.getInstance().appendToLog("NeoForge installer jar: " + installerJar.getAbsolutePath());

        Logger.getInstance().appendToLog("Installing NeoForge " + neoForgeVersion.version);
        List<String> installerArgs = new ArrayList<>(Arrays.asList(
                "-Djava.awt.headless=true",
                "-Duser.home=" + installRoot.getAbsolutePath(),
                "-jar",
                installerJar.getAbsolutePath(),
                "--install-client",
                installRoot.getAbsolutePath(),
                "--skip-hash-check"
        ));
        Logger.getInstance().appendToLog("NeoForge installer args: " + installerArgs);

        int exitCode;
        try {
            exitCode = JREUtils.launchJavaTool(
                    activity,
                    installRoot,
                    installerArgs,
                    resolveRequiredJavaMajorVersion(MinecraftMeta.getVersionInfo(minecraftVersion))
            );
        } catch (Throwable t) {
            throw new IOException("NeoForge installer failed to start in-process.", t);
        }
        Logger.getInstance().appendToLog("NeoForge installer exited with code " + exitCode);
        if (exitCode != 0) {
            throw new IOException("NeoForge installer exited with code " + exitCode + ".");
        }

        VersionInfo installed = GsonUtils.jsonFileToObject(versionJson.getAbsolutePath(), VersionInfo.class);
        if (installed == null) {
            throw new IOException("NeoForge installation did not produce " + versionJson.getAbsolutePath() + ".");
        }
        Logger.getInstance().appendToLog("NeoForge version json: " + versionJson.getAbsolutePath());

        Logger.getInstance().appendToLog("NeoForge installed");
        return installed;
    }

    //Only works on minecraft, not fabric, quilt, etc...
    //Will only download asset if it is missing
    public static CompletableFuture<String> installAssets(VersionInfo minecraftVersionInfo, String gameDir) throws IOException {
        return CompletableFuture.supplyAsync(() -> {
            Logger.getInstance().appendToLog("Checking assets");
            JsonObject assets = APIHandler.getFullUrl(minecraftVersionInfo.assetIndex.url, JsonObject.class);

            for (Map.Entry<String, JsonElement> entry : assets.getAsJsonObject("objects").entrySet()) {
                VersionInfo.Asset asset = new Gson().fromJson(entry.getValue(), VersionInfo.Asset.class);
                DownloadManager.addTotalBytes(asset.size);
            }

            ThreadPoolExecutor tp = new ThreadPoolExecutor(8, 8, 100, TimeUnit.MILLISECONDS, new LinkedBlockingQueue<>());

            for (Map.Entry<String, JsonElement> entry : assets.getAsJsonObject("objects").entrySet()) {
                AsyncDownload thread = new AsyncDownload(entry, gameDir);
                tp.execute(thread);
            }

            tp.shutdown();
            try {
                while (!tp.awaitTermination(100, TimeUnit.MILLISECONDS)) ;
            } catch (InterruptedException e) {
                Logger.getInstance().appendToLog("Download thread interrupted" + e.getMessage());
            }

            File indexJson = new File(gameDir + "/assets/indexes/" + minecraftVersionInfo.assets + ".json");
            if (!indexJson.exists()) {
                try {
                    DownloadUtils.downloadFile(minecraftVersionInfo.assetIndex.url, indexJson);
                } catch (IOException e) {
                    e.printStackTrace();
                }
            }

            return new File(gameDir + "/assets").getAbsolutePath();
        });
    }

    public static void moveLocalAssets(Activity activity, MinecraftInstances.Instance instance) throws IOException {
        try {
            FileUtils.writeByteArrayToFile(new File(instance.gameDir + "/config/sodium-options.json"), FileUtil.loadFromAssetToByte(activity, "sodium-options.json"));
            FileUtils.writeByteArrayToFile(new File(instance.gameDir + "/config/smoothboot.json"), FileUtil.loadFromAssetToByte(activity, "smoothboot.json"));
            FileUtils.writeByteArrayToFile(new File(instance.gameDir + "/config/immediatelyfast.json"), FileUtil.loadFromAssetToByte(activity, "immediatelyfast.json"));
            FileUtils.writeByteArrayToFile(new File(instance.gameDir + "/config/moreculling.toml"), FileUtil.loadFromAssetToByte(activity,"moreculling.toml"));
            FileUtils.writeByteArrayToFile(new File(instance.gameDir + "/config/modernfix-mixins.properties"), FileUtil.loadFromAssetToByte(activity,"modernfix-mixins.properties"));
            FileUtils.writeByteArrayToFile(new File(instance.gameDir + "/options.txt"), FileUtil.loadFromAssetToByte(activity, "options.txt"));
            FileUtils.writeByteArrayToFile(new File(instance.gameDir + "/servers.dat"), FileUtil.loadFromAssetToByte(activity, "servers.dat"));
            FileUtils.writeByteArrayToFile(new File(instance.gameDir + "/config/vivecraft-client-config.json"), FileUtil.loadFromAssetToByte(activity, "vivecraft-client-config.json"));
            FileUtils.writeByteArrayToFile(new File(Constants.USER_HOME + "/hacks/ResConfHack.jar"), FileUtil.loadFromAssetToByte(activity, "hacks/ResConfHack.jar"));
            FileUtils.writeByteArrayToFile(new File(Constants.USER_HOME + "/hacks/resolv.conf"), FileUtil.loadFromAssetToByte(activity, "hacks/resolv.conf"));
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    public static class AsyncDownload implements Runnable {
        private final Map.Entry<String, JsonElement> entry;
        private final String gameDir;
        private final String fileName;

        public AsyncDownload(Map.Entry<String, JsonElement> entry, String gameDir) {
            this.entry = entry;
            this.gameDir = gameDir;
            this.fileName = entry.getKey();
        }

        @Override
        public void run() {
            VersionInfo.Asset asset = new Gson().fromJson(entry.getValue(), VersionInfo.Asset.class);
            String path = asset.hash.substring(0, 2) + "/" + asset.hash;
            File assetFile = new File(gameDir + "/assets/objects/", path);

            for (int i = 0; i < 5; i++) {
                if (i == 4) throw new RuntimeException(String.format("Asset download of %s failed after 5 retries", fileName));

                if (!assetFile.exists()) {
                    Logger.getInstance().appendToLog("Downloading: " + fileName);
                    try {
                        DownloadUtils.downloadFile(Constants.MOJANG_RESOURCES_URL + "/" + path, assetFile, 0);
                    } catch (IOException e) {
                        throw new RuntimeException(e);
                    }
                }

                if (DownloadUtils.compareSHA1(assetFile, asset.hash)) {
                    break;
                } else {
                    assetFile.delete();
                }
            }
        }
    }


    //Used for mod libraries, vanilla is handled a different (tbh better) way
    private static String parseLibraryNameToPath(String libraryName) {
        String[] parts = libraryName.split(":");
        String location = parts[0].replace(".", "/");
        String name = parts[1];
        String version = parts[2];

        return String.format("%s/%s/%s/%s", location, name, version, name + "-" + version + ".jar");
    }

    private static File installRuntimeArchive(Activity activity, int runtimeMajorVersion) throws IOException {
        String jreURL = resolveRuntimeDownloadUrl(runtimeMajorVersion);
        if (jreURL == null || jreURL.trim().isEmpty()) {
            throw new IOException(
                    "No runtime source is configured for Java " + runtimeMajorVersion + ". " +
                    "Install " + Constants.getRuntimeFolderName(runtimeMajorVersion) + " manually under " +
                    Constants.getInternalHomeFile("runtimes").getAbsolutePath() +
                    " or provide POJLIB_JRE_" + runtimeMajorVersion + "_URL in custom_env.txt."
            );
        }

        Logger.getInstance().appendToLog("Installing JRE for Java " + runtimeMajorVersion);
        File jreZip = Constants.getRuntimeArchiveFile(runtimeMajorVersion);
        File runtimeDir = Constants.getRuntimeDir(runtimeMajorVersion);
        DownloadUtils.downloadFile(jreURL, jreZip);
        DownloadManager.reset();
        FileUtil.unzipArchive(jreZip.getPath(), runtimeDir.getAbsolutePath());
        File nativeLibDir = PojlibRuntimeHost.installNativeLibraries(activity);
        File awtXawtSource = new File(nativeLibDir, "libawt_xawt.so");
        if (awtXawtSource.exists()) {
            Files.copy(
                    Paths.get(awtXawtSource.getAbsolutePath()),
                    Paths.get(new File(runtimeDir, "lib/libawt_xawt.so").getAbsolutePath()),
                    java.nio.file.StandardCopyOption.REPLACE_EXISTING
            );
        } else {
            Logger.getInstance().appendToLog(
                    "Skipping libawt_xawt.so copy because it is not packaged in the app native libraries."
            );
        }
        jreZip.delete();
        return runtimeDir;
    }

    private static File findInstalledRuntime(int runtimeMajorVersion) {
        File preferredRuntime = Constants.getRuntimeDir(runtimeMajorVersion);
        if (isRuntimeCompatible(preferredRuntime, runtimeMajorVersion)) {
            return preferredRuntime;
        }

        File legacyRuntime = Constants.getRuntimeDir(Constants.DEFAULT_RUNTIME_JAVA_MAJOR_VERSION);
        if (!preferredRuntime.equals(legacyRuntime) && isRuntimeCompatible(legacyRuntime, runtimeMajorVersion)) {
            return legacyRuntime;
        }

        return null;
    }

    private static boolean isRuntimeCompatible(File runtimeDir, int requiredJavaMajorVersion) {
        if (runtimeDir == null || !runtimeDir.exists()) {
            return false;
        }

        File libJvm = new File(runtimeDir, "lib/server/libjvm.so");
        File clientJvm = new File(runtimeDir, "lib/client/libjvm.so");
        if (!libJvm.exists() && !clientJvm.exists()) {
            return false;
        }

        int installedMajorVersion = readInstalledJavaMajorVersion(runtimeDir, 0);
        return installedMajorVersion == 0 || installedMajorVersion >= requiredJavaMajorVersion;
    }

    private static int readInstalledJavaMajorVersion(File runtimeDir, int fallback) {
        File releaseFile = new File(runtimeDir, "release");
        if (!releaseFile.exists()) {
            return fallback;
        }

        try (BufferedReader reader = new BufferedReader(new FileReader(releaseFile))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (!line.startsWith("JAVA_VERSION=")) {
                    continue;
                }
                String value = line.substring("JAVA_VERSION=".length()).replace("\"", "").trim();
                String majorComponent = value;
                int dot = value.indexOf('.');
                if (dot != -1) {
                    majorComponent = value.substring(0, dot);
                }
                return Integer.parseInt(majorComponent);
            }
        } catch (Throwable t) {
            Logger.getInstance().appendToLog("Failed to read runtime release metadata: " + t.getMessage());
        }

        return fallback;
    }

    private static String resolveRuntimeDownloadUrl(int runtimeMajorVersion) {
        String override = readRuntimeUrlOverride(runtimeMajorVersion);
        if (override != null && !override.trim().isEmpty()) {
            return override.trim();
        }

        if (runtimeMajorVersion <= Constants.DEFAULT_RUNTIME_JAVA_MAJOR_VERSION) {
            return DEFAULT_JRE_22_URL;
        }

        if (runtimeMajorVersion == 25) {
            return DEFAULT_JRE_25_URL;
        }

        return null;
    }

    private static String readRuntimeUrlOverride(int runtimeMajorVersion) {
        String envKey = "POJLIB_JRE_" + runtimeMajorVersion + "_URL";
        String processValue = System.getenv(envKey);
        if (processValue != null && !processValue.trim().isEmpty()) {
            return processValue.trim();
        }

        File customEnvFile = Constants.getUserHomeFile("custom_env.txt");
        if (!customEnvFile.exists()) {
            return null;
        }

        try (BufferedReader reader = new BufferedReader(new FileReader(customEnvFile))) {
            String line;
            while ((line = reader.readLine()) != null) {
                int index = line.indexOf('=');
                if (index <= 0) {
                    continue;
                }
                String key = line.substring(0, index).trim();
                if (!envKey.equals(key)) {
                    continue;
                }
                String value = line.substring(index + 1).trim();
                if (!value.isEmpty()) {
                    return value;
                }
            }
        } catch (IOException e) {
            Logger.getInstance().appendToLog("Failed to read runtime override from custom_env.txt: " + e.getMessage());
        }

        return null;
    }
}
