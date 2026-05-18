package pojlib.install;

import org.objectweb.asm.ClassReader;
import org.objectweb.asm.ClassWriter;
import org.objectweb.asm.tree.ClassNode;
import org.objectweb.asm.tree.InsnList;
import org.objectweb.asm.tree.InsnNode;
import org.objectweb.asm.tree.JumpInsnNode;
import org.objectweb.asm.tree.LabelNode;
import org.objectweb.asm.tree.LdcInsnNode;
import org.objectweb.asm.tree.MethodInsnNode;
import org.objectweb.asm.tree.MethodNode;
import org.objectweb.asm.tree.VarInsnNode;
import org.objectweb.asm.tree.FieldInsnNode;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.util.Enumeration;
import java.util.jar.JarEntry;
import java.util.jar.JarFile;
import java.util.jar.JarOutputStream;

import pojlib.util.Logger;

import static org.objectweb.asm.Opcodes.*;

public final class VivecraftJarPatcher {
    private static final String TARGET_CLASS = "org/vivecraft/client_vr/provider/openxr/MCOpenXR.class";
    private static final String TARGET_OWNER = "org/vivecraft/client_vr/provider/openxr/MCOpenXR";

    private VivecraftJarPatcher() {}

    public static void patchIfNeeded(File jarFile) {
        if (jarFile == null || !jarFile.isFile()) {
            return;
        }

        String fileName = jarFile.getName().toLowerCase();
        if (!fileName.contains("vivecraft")) {
            return;
        }

        File tempFile = new File(jarFile.getParentFile(), jarFile.getName() + ".tmp");
        boolean patched = false;

        try (JarFile inputJar = new JarFile(jarFile);
             JarOutputStream outputJar = new JarOutputStream(new FileOutputStream(tempFile))) {
            Enumeration<JarEntry> entries = inputJar.entries();
            while (entries.hasMoreElements()) {
                JarEntry entry = entries.nextElement();
                JarEntry outputEntry = new JarEntry(entry.getName());
                outputJar.putNextEntry(outputEntry);

                try (InputStream inputStream = inputJar.getInputStream(entry)) {
                    byte[] data = inputStream.readAllBytes();
                    if (TARGET_CLASS.equals(entry.getName())) {
                        data = patchMcOpenXR(data);
                        patched = true;
                    }
                    outputJar.write(data);
                }

                outputJar.closeEntry();
            }
        } catch (Throwable t) {
            Logger.getInstance().appendToLog("WARN: Failed to patch Vivecraft jar " + jarFile.getName() + ": " + t);
            if (tempFile.exists()) {
                tempFile.delete();
            }
            return;
        }

        if (!patched) {
            tempFile.delete();
            return;
        }

        try {
            Files.move(tempFile.toPath(), jarFile.toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            Logger.getInstance().appendToLog("Patched Vivecraft OpenXR refresh-rate guard in " + jarFile.getName());
        } catch (IOException e) {
            Logger.getInstance().appendToLog("WARN: Failed to replace patched Vivecraft jar " + jarFile.getName() + ": " + e);
            tempFile.delete();
        }
    }

    private static byte[] patchMcOpenXR(byte[] classBytes) {
        ClassReader reader = new ClassReader(classBytes);
        ClassNode node = new ClassNode();
        reader.accept(node, ClassReader.EXPAND_FRAMES);

        boolean found = false;
        for (MethodNode method : node.methods) {
            if (!"initDisplayRefreshRate".equals(method.name) || !"()V".equals(method.desc)) {
                continue;
            }
            rewriteInitDisplayRefreshRate(method);
            found = true;
            break;
        }

        if (!found) {
            return classBytes;
        }

        ClassWriter writer = new ClassWriter(ClassWriter.COMPUTE_FRAMES | ClassWriter.COMPUTE_MAXS) {
            @Override
            protected String getCommonSuperClass(String type1, String type2) {
                return "java/lang/Object";
            }
        };
        node.accept(writer);
        return writer.toByteArray();
    }

    private static void rewriteInitDisplayRefreshRate(MethodNode method) {
        method.instructions.clear();
        method.tryCatchBlocks.clear();
        method.localVariables = null;

        LabelNode afterFirstCheck = new LabelNode();
        LabelNode afterSecondCheck = new LabelNode();

        InsnList insns = method.instructions;
        insns.add(new MethodInsnNode(INVOKESTATIC, "org/lwjgl/system/MemoryStack", "stackPush", "()Lorg/lwjgl/system/MemoryStack;", false));
        insns.add(new VarInsnNode(ASTORE, 1));

        insns.add(new VarInsnNode(ALOAD, 1));
        insns.add(new InsnNode(ICONST_1));
        insns.add(new MethodInsnNode(INVOKEVIRTUAL, "org/lwjgl/system/MemoryStack", "callocInt", "(I)Ljava/nio/IntBuffer;", false));
        insns.add(new VarInsnNode(ASTORE, 2));

        insns.add(new VarInsnNode(ALOAD, 0));
        insns.add(new FieldInsnNode(GETFIELD, TARGET_OWNER, "session", "Lorg/lwjgl/openxr/XrSession;"));
        insns.add(new VarInsnNode(ALOAD, 2));
        insns.add(new InsnNode(ACONST_NULL));
        insns.add(new MethodInsnNode(INVOKESTATIC, "org/lwjgl/openxr/FBDisplayRefreshRate", "xrEnumerateDisplayRefreshRatesFB", "(Lorg/lwjgl/openxr/XrSession;Ljava/nio/IntBuffer;Ljava/nio/FloatBuffer;)I", false));
        insns.add(new VarInsnNode(ISTORE, 3));

        insns.add(new VarInsnNode(ALOAD, 0));
        insns.add(new VarInsnNode(ILOAD, 3));
        insns.add(new LdcInsnNode("xrEnumerateDisplayRefreshRatesFB"));
        insns.add(new LdcInsnNode("get count"));
        insns.add(new MethodInsnNode(INVOKEVIRTUAL, TARGET_OWNER, "logError", "(ILjava/lang/String;Ljava/lang/String;)V", false));

        insns.add(new VarInsnNode(ALOAD, 2));
        insns.add(new InsnNode(ICONST_0));
        insns.add(new MethodInsnNode(INVOKEVIRTUAL, "java/nio/IntBuffer", "get", "(I)I", false));
        insns.add(new VarInsnNode(ISTORE, 4));

        insns.add(new VarInsnNode(ILOAD, 4));
        insns.add(new JumpInsnNode(IFGT, afterFirstCheck));
        insns.add(new VarInsnNode(ALOAD, 1));
        insns.add(new MethodInsnNode(INVOKEVIRTUAL, "org/lwjgl/system/MemoryStack", "close", "()V", false));
        insns.add(new InsnNode(RETURN));

        insns.add(afterFirstCheck);
        insns.add(new VarInsnNode(ALOAD, 1));
        insns.add(new VarInsnNode(ILOAD, 4));
        insns.add(new MethodInsnNode(INVOKEVIRTUAL, "org/lwjgl/system/MemoryStack", "callocFloat", "(I)Ljava/nio/FloatBuffer;", false));
        insns.add(new VarInsnNode(ASTORE, 5));

        insns.add(new VarInsnNode(ALOAD, 0));
        insns.add(new FieldInsnNode(GETFIELD, TARGET_OWNER, "session", "Lorg/lwjgl/openxr/XrSession;"));
        insns.add(new VarInsnNode(ALOAD, 2));
        insns.add(new VarInsnNode(ALOAD, 5));
        insns.add(new MethodInsnNode(INVOKESTATIC, "org/lwjgl/openxr/FBDisplayRefreshRate", "xrEnumerateDisplayRefreshRatesFB", "(Lorg/lwjgl/openxr/XrSession;Ljava/nio/IntBuffer;Ljava/nio/FloatBuffer;)I", false));
        insns.add(new VarInsnNode(ISTORE, 3));

        insns.add(new VarInsnNode(ALOAD, 0));
        insns.add(new VarInsnNode(ILOAD, 3));
        insns.add(new LdcInsnNode("xrEnumerateDisplayRefreshRatesFB"));
        insns.add(new LdcInsnNode("get rates"));
        insns.add(new MethodInsnNode(INVOKEVIRTUAL, TARGET_OWNER, "logError", "(ILjava/lang/String;Ljava/lang/String;)V", false));

        insns.add(new VarInsnNode(ALOAD, 2));
        insns.add(new InsnNode(ICONST_0));
        insns.add(new MethodInsnNode(INVOKEVIRTUAL, "java/nio/IntBuffer", "get", "(I)I", false));
        insns.add(new VarInsnNode(ISTORE, 6));

        insns.add(new VarInsnNode(ILOAD, 6));
        insns.add(new JumpInsnNode(IFGT, afterSecondCheck));
        insns.add(new VarInsnNode(ALOAD, 1));
        insns.add(new MethodInsnNode(INVOKEVIRTUAL, "org/lwjgl/system/MemoryStack", "close", "()V", false));
        insns.add(new InsnNode(RETURN));

        insns.add(afterSecondCheck);
        insns.add(new VarInsnNode(ALOAD, 5));
        insns.add(new MethodInsnNode(INVOKEVIRTUAL, "java/nio/FloatBuffer", "rewind", "()Ljava/nio/Buffer;", false));
        insns.add(new InsnNode(POP));

        insns.add(new VarInsnNode(ALOAD, 0));
        insns.add(new FieldInsnNode(GETFIELD, TARGET_OWNER, "session", "Lorg/lwjgl/openxr/XrSession;"));
        insns.add(new VarInsnNode(ALOAD, 5));
        insns.add(new VarInsnNode(ILOAD, 6));
        insns.add(new InsnNode(ICONST_1));
        insns.add(new InsnNode(ISUB));
        insns.add(new MethodInsnNode(INVOKEVIRTUAL, "java/nio/FloatBuffer", "get", "(I)F", false));
        insns.add(new MethodInsnNode(INVOKESTATIC, "org/lwjgl/openxr/FBDisplayRefreshRate", "xrRequestDisplayRefreshRateFB", "(Lorg/lwjgl/openxr/XrSession;F)I", false));
        insns.add(new VarInsnNode(ISTORE, 3));

        insns.add(new VarInsnNode(ALOAD, 0));
        insns.add(new VarInsnNode(ILOAD, 3));
        insns.add(new LdcInsnNode("xrRequestDisplayRefreshRateFB"));
        insns.add(new LdcInsnNode("set max refresh rate"));
        insns.add(new MethodInsnNode(INVOKEVIRTUAL, TARGET_OWNER, "logError", "(ILjava/lang/String;Ljava/lang/String;)V", false));

        insns.add(new VarInsnNode(ALOAD, 1));
        insns.add(new MethodInsnNode(INVOKEVIRTUAL, "org/lwjgl/system/MemoryStack", "close", "()V", false));
        insns.add(new InsnNode(RETURN));
    }
}
