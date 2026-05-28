package pojlib.install;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import pojlib.APIHandler;
import pojlib.util.Constants;

public final class NeoForgeMeta {
    private static final Pattern VERSION_PATTERN = Pattern.compile("<version>([^<]+)</version>");

    private NeoForgeMeta() {}

    public static final class NeoForgeVersion {
        public final String minecraftVersion;
        public final String version;

        public NeoForgeVersion(String minecraftVersion, String version) {
            this.minecraftVersion = minecraftVersion;
            this.version = version;
        }

        public String getVersionId() {
            return "neoforge-" + version;
        }

        public String getInstallerUrl() {
            return Constants.NEOFORGE_MAVEN_URL + "/" + version + "/neoforge-" + version + "-installer.jar";
        }
    }

    public static NeoForgeVersion getLatestVersion(String minecraftVersion) {
        String prefix = getVersionPrefix(minecraftVersion);
        if (prefix == null) {
            return null;
        }

        List<String> versions = getVersions();
        String latest = null;
        for (String version : versions) {
            if (!version.startsWith(prefix) || version.contains("-")) {
                continue;
            }

            if (latest == null || compareVersion(version, latest) > 0) {
                latest = version;
            }
        }

        return latest == null ? null : new NeoForgeVersion(minecraftVersion, latest);
    }

    static List<String> getVersions() {
        String xml = APIHandler.getRaw(Constants.NEOFORGE_MAVEN_URL + "/maven-metadata.xml");
        ArrayList<String> versions = new ArrayList<>();
        if (xml == null) {
            return versions;
        }

        Matcher matcher = VERSION_PATTERN.matcher(xml);
        while (matcher.find()) {
            versions.add(matcher.group(1));
        }
        return versions;
    }

    private static String getVersionPrefix(String minecraftVersion) {
        String[] parts = minecraftVersion.split("\\.");
        if (parts.length < 2 || !"1".equals(parts[0])) {
            return null;
        }

        int minor;
        int patch = 0;
        try {
            minor = Integer.parseInt(parts[1]);
            if (parts.length > 2) {
                patch = Integer.parseInt(parts[2]);
            }
        } catch (NumberFormatException e) {
            return null;
        }

        if (minor < 20) {
            return null;
        }

        if (minor == 20 && patch <= 1) {
            return "20.2.";
        }

        return minor + "." + patch + ".";
    }

    private static int compareVersion(String left, String right) {
        String[] leftParts = left.split("\\.");
        String[] rightParts = right.split("\\.");
        int length = Math.max(leftParts.length, rightParts.length);
        for (int i = 0; i < length; i++) {
            int leftValue = i < leftParts.length ? parseNumericComponent(leftParts[i]) : 0;
            int rightValue = i < rightParts.length ? parseNumericComponent(rightParts[i]) : 0;
            if (leftValue != rightValue) {
                return Integer.compare(leftValue, rightValue);
            }
        }
        return 0;
    }

    private static int parseNumericComponent(String component) {
        String numeric = component.replaceAll("[^0-9].*", "");
        if (numeric.isEmpty()) {
            return 0;
        }
        return Integer.parseInt(numeric);
    }
}
