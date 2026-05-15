#include <jni.h>
#include <assert.h>
#include <dlfcn.h>

#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/types.h>
#include <unistd.h>

#include <EGL/egl.h>

#ifdef GLES_TEST
#include <GLES2/gl2.h>
#endif
#include <GLES3/gl3.h>

#include <android/native_window.h>
#include <android/native_window_jni.h>
#include <android/rect.h>
#include <string.h>
#include <pthread.h>
#include "utils.h"
#include "environ/environ.h"
#include "GL/gl.h"

typedef EGLDisplay eglGetDisplay_t (EGLNativeDisplayType display_id);
typedef EGLBoolean eglInitialize_t (EGLDisplay dpy, EGLint *major, EGLint *minor);
typedef EGLBoolean eglChooseConfig_t (EGLDisplay dpy, const EGLint *attrib_list, EGLConfig *configs, EGLint config_size, EGLint *num_config);
typedef EGLBoolean eglGetConfigAttrib_t (EGLDisplay dpy, EGLConfig config, EGLint attribute, EGLint *value);
typedef EGLBoolean eglBindAPI_t (EGLenum api);
typedef EGLContext eglCreateContext_t (EGLDisplay dpy, EGLConfig config, EGLContext share_context, const EGLint *attrib_list);
typedef EGLBoolean eglMakeCurrent_t (EGLDisplay dpy, EGLSurface draw, EGLSurface read, EGLContext ctx);
typedef EGLint eglGetError_t (void);
typedef EGLBoolean eglSwapInterval_t (EGLDisplay dpy, EGLint interval);
typedef __eglMustCastToProperFunctionPointerType eglGetProcAddress_t (const char *procname);

eglGetDisplay_t* eglGetDisplay_p;
eglInitialize_t* eglInitialize_p;
eglChooseConfig_t* eglChooseConfig_p;
eglGetConfigAttrib_t* eglGetConfigAttrib_p;
eglBindAPI_t* eglBindAPI_p;
eglCreateContext_t* eglCreateContext_p;
eglMakeCurrent_t* eglMakeCurrent_p;
eglGetError_t* eglGetError_p;
eglSwapInterval_t* eglSwapInterval_p;
eglGetProcAddress_t* eglGetProcAddress_p;

EGLContext xrEglContext;
EGLDisplay xrEglDisplay;
EGLSurface xrEglSurface;
EGLConfig xrConfig;

void* gbuffer;

void pojav_openGLOnLoad() {
}
void pojav_openGLOnUnload() {

}

void pojavTerminate() {
}

void dlsym_egl() {
    void* handle = dlopen("libmobileglues.so", RTLD_NOW);
    eglGetProcAddress_p = (eglGetProcAddress_t*) dlsym(handle, "eglGetProcAddress");
    eglGetDisplay_p = (eglGetDisplay_t*) eglGetProcAddress_p("eglGetDisplay");
    eglInitialize_p = (eglInitialize_t*) eglGetProcAddress_p("eglInitialize");
    eglChooseConfig_p = (eglChooseConfig_t*) eglGetProcAddress_p("eglChooseConfig");
    eglGetConfigAttrib_p = (eglGetConfigAttrib_t*) eglGetProcAddress_p("eglGetConfigAttrib");
    eglBindAPI_p = (eglBindAPI_t*) eglGetProcAddress_p("eglBindAPI");
    eglCreateContext_p = (eglCreateContext_t*) eglGetProcAddress_p("eglCreateContext");
    eglMakeCurrent_p = (eglMakeCurrent_t*) eglGetProcAddress_p("eglMakeCurrent");
    eglGetError_p = (eglGetError_t*) eglGetProcAddress_p("eglGetError");
    eglSwapInterval_p = (eglSwapInterval_t*) eglGetProcAddress_p("eglSwapInterval");
}

void* pojavGetCurrentContext() {
    return xrEglContext;
}

static void log_gl_context_probe() {
    const GLubyte* version = glGetString(GL_VERSION);
    const GLubyte* vendor = glGetString(GL_VENDOR);
    const GLubyte* renderer = glGetString(GL_RENDERER);
    GLenum error = glGetError();

    printf("XREGLBridge: native GL_VERSION=%s\n", version ? (const char*) version : "<null>");
    printf("XREGLBridge: native GL_VENDOR=%s\n", vendor ? (const char*) vendor : "<null>");
    printf("XREGLBridge: native GL_RENDERER=%s\n", renderer ? (const char*) renderer : "<null>");
    printf("XREGLBridge: native glGetError()=0x%x\n", error);
}

int xrEglInit() {
    dlsym_egl();

    if (xrEglDisplay == NULL || xrEglDisplay == EGL_NO_DISPLAY) {
        xrEglDisplay = eglGetDisplay_p(EGL_DEFAULT_DISPLAY);
        if (xrEglDisplay == EGL_NO_DISPLAY) {
            printf("EGLBridge: Error eglGetDefaultDisplay() failed: %p\n", eglGetError_p());
            return 0;
        }
    }

    printf("EGLBridge: Initializing\n");
    // printf("EGLBridge: ANativeWindow pointer = %p\n", androidWindow);
    //(*env)->ThrowNew(env,(*env)->FindClass(env,"java/lang/Exception"),"Trace exception");
    if (!eglInitialize_p(xrEglDisplay, NULL, NULL)) {
        printf("EGLBridge: Error eglInitialize() failed: %s\n", eglGetError_p());
        return 0;
    }

    static const EGLint attribs[] = {
            EGL_RED_SIZE, 8,
            EGL_GREEN_SIZE, 8,
            EGL_BLUE_SIZE, 8,
            EGL_ALPHA_SIZE, 8,
            // Minecraft required on initial 24
            EGL_DEPTH_SIZE, 24,
            EGL_RENDERABLE_TYPE, EGL_OPENGL_ES3_BIT,
            EGL_SURFACE_TYPE, EGL_PBUFFER_BIT,
            EGL_NONE
    };

    EGLint num_configs;
    EGLint vid;

    if (!eglChooseConfig_p(xrEglDisplay, attribs, &xrConfig, 1, &num_configs)) {
        printf("EGLBridge: Error couldn't get an EGL visual config: %s\n", eglGetError_p());
        return 0;
    }

    assert(xrConfig);
    assert(num_configs > 0);

    if (!eglGetConfigAttrib_p(xrEglDisplay, xrConfig, EGL_NATIVE_VISUAL_ID, &vid)) {
        printf("EGLBridge: Error eglGetConfigAttrib() failed: %s\n", eglGetError_p());
        return 0;
    }

    eglBindAPI_p(EGL_OPENGL_ES_API);

    printf("XREGLBridge: Initialized!\n");
    printf("XREGLBridge: ThreadID=%d\n", gettid());
    printf("XREGLBridge: XREGLDisplay=%p\n", xrEglDisplay);

    return 1;
}

int pojavInit() {
    savedWidth = 1;
    savedHeight = 1;
    printf("XREGLBridge: Thread name is %d\n", gettid());

    return xrEglInit();
}

void pojavSetWindowHint(int hint, int value) {
    // Stub
}


int32_t stride;
void pojavSwapBuffers() {
}

bool locked = false;
void pojavMakeCurrent(void* window) {
    EGLBoolean success = eglMakeCurrent_p(
            xrEglDisplay,
            EGL_NO_SURFACE,
            EGL_NO_SURFACE,
            window
    );

    xrEglContext = window;

    if (success == EGL_FALSE) {
        printf("XREGLBridge: Error: eglMakeCurrent() failed: %p\n", eglGetError_p());
    } else {
        printf("XREGLBridge: eglMakeCurrent() succeed!\n");
        printf("XREGLBridge: system eglGetCurrentDisplay()=%p\n", eglGetCurrentDisplay());
        printf("XREGLBridge: system eglGetCurrentContext()=%p\n", eglGetCurrentContext());
        log_gl_context_probe();
    }
}

JNIEXPORT JNICALL jlong
Java_pojlib_util_JREUtils_getEGLDisplayPtr(JNIEnv *env, jclass clazz) {
    return (jlong) &xrEglDisplay;
}

JNIEXPORT JNICALL jlong
Java_pojlib_util_JREUtils_getEGLContextPtr(JNIEnv *env, jclass clazz) {
    return (jlong) &xrEglContext;
}

JNIEXPORT JNICALL jlong
Java_pojlib_util_JREUtils_getEGLConfigPtr(JNIEnv *env, jclass clazz) {
    return (jlong) &xrConfig;
}

JNIEXPORT JNICALL jlong
Java_org_lwjgl_glfw_GLFWNativeEGL_nglfwGetEGLDisplay(JNIEnv *env, jclass clazz) {
    return (jlong) xrEglDisplay;
}

JNIEXPORT JNICALL jlong
Java_org_lwjgl_glfw_GLFWNativeEGL_nglfwGetEGLContext(JNIEnv *env, jclass clazz, jlong window) {
    if (window != 0) {
        return window;
    }
    return (jlong) xrEglContext;
}

JNIEXPORT JNICALL jlong
Java_org_lwjgl_glfw_GLFWNativeEGL_nglfwGetEGLSurface(JNIEnv *env, jclass clazz, jlong window) {
    return (jlong) EGL_NO_SURFACE;
}

JNIEXPORT JNICALL jlong
Java_org_lwjgl_glfw_GLFWNativeEGL_nglfwGetEGLConfig(JNIEnv *env, jclass clazz, jlong window) {
    return (jlong) xrConfig;
}

void* pojavCreateContext(void* contextSrc) {
    const EGLint ctx_attribs[] = {
            EGL_CONTEXT_CLIENT_VERSION, 3,
            EGL_NONE
    };
    EGLContext ctx = eglCreateContext_p(xrEglDisplay, xrConfig, contextSrc, ctx_attribs);

    printf("XREGLBridge: %p\n", ctx);
    return ctx;
}

JNIEXPORT JNICALL jlong
Java_org_lwjgl_opengl_GL_getGraphicsBufferAddr(JNIEnv *env, jobject thiz) {
    return (jlong) &gbuffer;
}
JNIEXPORT JNICALL jintArray
Java_org_lwjgl_opengl_GL_getNativeWidthHeight(JNIEnv *env, jobject thiz) {
    jintArray ret = (*env)->NewIntArray(env,2);
    jint arr[] = {savedWidth, savedHeight};
    (*env)->SetIntArrayRegion(env,ret,0,2,arr);
    return ret;
}
void pojavSwapInterval(int interval) {
    eglSwapInterval_p(xrEglDisplay, interval);
}
