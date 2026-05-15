package org.lwjgl.glfw;

import org.lwjgl.system.NativeType;

public class GLFWNativeEGL {
    private static native long nglfwGetEGLDisplay();
    private static native long nglfwGetEGLContext(long window);
    private static native long nglfwGetEGLSurface(long window);
    private static native long nglfwGetEGLConfig(long window);

    @NativeType("EGLDisplay")
    public static long glfwGetEGLDisplay() {
        return nglfwGetEGLDisplay();
    }

    @NativeType("EGLContext")
    public static long glfwGetEGLContext(@NativeType("GLFWwindow *") long window) {
        return nglfwGetEGLContext(window);
    }

    @NativeType("EGLSurface")
    public static long glfwGetEGLSurface(@NativeType("GLFWwindow *") long window) {
        return nglfwGetEGLSurface(window);
    }

    @NativeType("EGLConfig")
    public static long glfwGetEGLConfig(@NativeType("GLFWwindow *") long window) {
        return nglfwGetEGLConfig(window);
    }
}
