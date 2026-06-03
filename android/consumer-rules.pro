# Keep the Expo bridge surface stable. Expo/autolinking and the JS bridge reach
# these classes indirectly, so obfuscation/removal here is high-risk.
-keep class dev.justfeli.pojlibexpo.** { *; }

# Pojlib relies on JNI and reflection for these exact class names.
-keep class pojlib.API { *; }
-keep class pojlib.PojlibRuntimeActivity { *; }
-keep class pojlib.PojlibRuntimeHost { *; }
-keep class pojlib.UnityPlayerActivity { *; }
-keep class pojlib.util.Logger { *; }
-keep class pojlib.util.JREUtils { *; }
-keep class pojlib.util.VLoader { *; }
-keep class pojlib.input.AWTInputBridge { *; }
-keep class pojlib.input.CriticalNativeTest { *; }
-keep class org.lwjgl.glfw.CallbackBridge { *; }
-keep class com.oracle.dalvik.VMLauncher { *; }
-keep class dalvik.annotation.optimization.CriticalNative { *; }

# Native entry points must keep their declaring classes and method names.
-keepclasseswithmembers class * {
    native <methods>;
}

# Ignore desktop/server-only references pulled in by bundled libraries.
-dontwarn com.sun.net.httpserver.**
-dontwarn java.awt.**
-dontwarn lombok.**
-dontwarn org.slf4j.impl.**
-dontwarn com.unity3d.player.**
