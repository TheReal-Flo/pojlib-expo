# Pojlib relies on JNI and reflection for these exact class names.
-keep class pojlib.API { *; }
-keep class pojlib.UnityPlayerActivity { *; }
-keep class pojlib.util.Logger { *; }
-keep class org.lwjgl.glfw.CallbackBridge { *; }

# Ignore desktop/server-only references pulled in by bundled libraries.
-dontwarn com.sun.net.httpserver.**
-dontwarn java.awt.**
-dontwarn lombok.**
-dontwarn org.slf4j.impl.**
-dontwarn com.unity3d.player.**
