package pojlib.install;

import java.io.File;

import pojlib.util.Logger;

public final class VivecraftJarPatcher {
    private VivecraftJarPatcher() {}

    public static void patchIfNeeded(File jarFile) {
        if (jarFile != null && jarFile.isFile() && jarFile.getName().toLowerCase().contains("vivecraft")) {
            Logger.getInstance().appendToLog("Skipping Vivecraft jar patching for " + jarFile.getName());
        }
    }
}
