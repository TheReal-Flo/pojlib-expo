package pojlib;

import static org.lwjgl.glfw.CallbackBridge.sendKeyPress;
import static org.lwjgl.glfw.CallbackBridge.sendMouseButton;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.res.Configuration;
import android.os.Bundle;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.widget.FrameLayout;

import org.lwjgl.glfw.CallbackBridge;

import fr.spse.gamepad_remapper.RemapperManager;
import fr.spse.gamepad_remapper.RemapperView;
import pojlib.input.EfficientAndroidLWJGLKeycode;
import pojlib.input.GrabListener;
import pojlib.input.LwjglGlfwKeycode;
import pojlib.input.gamepad.DefaultDataProvider;
import pojlib.input.gamepad.Gamepad;
import pojlib.util.Constants;

public class PojlibRuntimeActivity extends Activity implements GrabListener {
    private Gamepad mGamepad = null;
    private RemapperManager mInputManager;
    private boolean mLastGrabState = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        Constants.initConstants(this);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        super.onCreate(savedInstanceState);

        FrameLayout root = new FrameLayout(this);
        root.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        setContentView(root);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        PojlibRuntimeHost.attachActivity(this);

        mInputManager = new RemapperManager(this, new RemapperView.Builder(null)
                .remapA(true)
                .remapB(true)
                .remapX(true)
                .remapY(true)
                .remapLeftJoystick(true)
                .remapRightJoystick(true)
                .remapStart(true)
                .remapSelect(true)
                .remapLeftShoulder(true)
                .remapRightShoulder(true)
                .remapLeftTrigger(true)
                .remapRightTrigger(true)
                .remapDpad(true));

        CallbackBridge.nativeSetUseInputStackQueue(true);
    }

    protected void reinitRuntime() {
        PojlibRuntimeHost.restartRuntime(this);
    }

    private void createGamepad(InputDevice inputDevice) {
        mGamepad = new Gamepad(inputDevice, DefaultDataProvider.INSTANCE);
    }

    @SuppressLint("NewApi")
    @Override
    public boolean dispatchGenericMotionEvent(MotionEvent event) {
        int mouseCursorIndex = -1;

        if (Gamepad.isGamepadEvent(event)) {
            if (mGamepad == null) {
                createGamepad(event.getDevice());
            }

            mInputManager.handleMotionEventInput(this, event, mGamepad);
            return true;
        }

        for (int i = 0; i < event.getPointerCount(); i++) {
            if (event.getToolType(i) != MotionEvent.TOOL_TYPE_MOUSE &&
                    event.getToolType(i) != MotionEvent.TOOL_TYPE_STYLUS) {
                continue;
            }
            mouseCursorIndex = i;
            break;
        }
        if (mouseCursorIndex == -1) {
            return super.dispatchGenericMotionEvent(event);
        }

        updateGrabState(CallbackBridge.isGrabbing());

        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_HOVER_MOVE:
                CallbackBridge.mouseX = (event.getX(mouseCursorIndex) * 100);
                CallbackBridge.mouseY = (event.getY(mouseCursorIndex) * 100);
                CallbackBridge.sendCursorPos(CallbackBridge.mouseX, CallbackBridge.mouseY);
                return true;
            case MotionEvent.ACTION_SCROLL:
                CallbackBridge.sendScroll(
                        (double) event.getAxisValue(MotionEvent.AXIS_HSCROLL),
                        (double) event.getAxisValue(MotionEvent.AXIS_VSCROLL)
                );
                return true;
            case MotionEvent.ACTION_BUTTON_PRESS:
                return sendMouseButtonUnconverted(event.getActionButton(), true);
            case MotionEvent.ACTION_BUTTON_RELEASE:
                return sendMouseButtonUnconverted(event.getActionButton(), false);
            default:
                return super.dispatchGenericMotionEvent(event);
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        boolean handleEvent = processKeyEvent(event);
        if (!handleEvent && event.getKeyCode() == KeyEvent.KEYCODE_BACK) {
            if (event.getAction() != KeyEvent.ACTION_UP) {
                return true;
            }
            sendKeyPress(LwjglGlfwKeycode.GLFW_KEY_ESCAPE);
            return true;
        }
        return handleEvent || super.dispatchKeyEvent(event);
    }

    public boolean processKeyEvent(KeyEvent event) {
        int eventKeycode = event.getKeyCode();
        if (eventKeycode == KeyEvent.KEYCODE_UNKNOWN) {
            return true;
        }
        if (eventKeycode == KeyEvent.KEYCODE_VOLUME_DOWN || eventKeycode == KeyEvent.KEYCODE_VOLUME_UP) {
            return false;
        }
        if (event.getRepeatCount() != 0) {
            return true;
        }
        int action = event.getAction();
        if (action == KeyEvent.ACTION_MULTIPLE) {
            return true;
        }
        if (action == KeyEvent.ACTION_UP && (event.getFlags() & KeyEvent.FLAG_CANCELED) != 0) {
            return true;
        }

        if ((event.getFlags() & KeyEvent.FLAG_SOFT_KEYBOARD) == KeyEvent.FLAG_SOFT_KEYBOARD) {
            return eventKeycode == KeyEvent.KEYCODE_ENTER || super.dispatchKeyEvent(event);
        }

        if (event.getDevice() != null &&
                (((event.getSource() & InputDevice.SOURCE_MOUSE_RELATIVE) == InputDevice.SOURCE_MOUSE_RELATIVE) ||
                        ((event.getSource() & InputDevice.SOURCE_MOUSE) == InputDevice.SOURCE_MOUSE))) {
            if (eventKeycode == KeyEvent.KEYCODE_BACK) {
                sendMouseButton(LwjglGlfwKeycode.GLFW_MOUSE_BUTTON_RIGHT, event.getAction() == KeyEvent.ACTION_DOWN);
                return true;
            }
        }

        if (Gamepad.isGamepadEvent(event)) {
            if (mGamepad == null) {
                createGamepad(event.getDevice());
            }

            mInputManager.handleKeyEventInput(this, event, mGamepad);
            return true;
        }

        int index = EfficientAndroidLWJGLKeycode.getIndexByKey(eventKeycode);
        if (EfficientAndroidLWJGLKeycode.containsIndex(index)) {
            EfficientAndroidLWJGLKeycode.execKey(event, index);
            return true;
        }

        return (event.getFlags() & KeyEvent.FLAG_FALLBACK) == KeyEvent.FLAG_FALLBACK;
    }

    public static boolean sendMouseButtonUnconverted(int button, boolean status) {
        int glfwButton = -256;
        switch (button) {
            case MotionEvent.BUTTON_PRIMARY:
                glfwButton = LwjglGlfwKeycode.GLFW_MOUSE_BUTTON_LEFT;
                break;
            case MotionEvent.BUTTON_TERTIARY:
                glfwButton = LwjglGlfwKeycode.GLFW_MOUSE_BUTTON_MIDDLE;
                break;
            case MotionEvent.BUTTON_SECONDARY:
                glfwButton = LwjglGlfwKeycode.GLFW_MOUSE_BUTTON_RIGHT;
                break;
        }
        if (glfwButton == -256) {
            return false;
        }
        sendMouseButton(glfwButton, status);
        return true;
    }

    @Override
    public void onGrabState(boolean isGrabbing) {
        runOnUiThread(() -> updateGrabState(isGrabbing));
    }

    private void updateGrabState(boolean isGrabbing) {
        if (mLastGrabState != isGrabbing) {
            mLastGrabState = isGrabbing;
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        PojlibRuntimeHost.attachActivity(this);
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        PojlibRuntimeHost.updateWindowSize(this);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            PojlibRuntimeHost.updateWindowSize(this);
        }
    }
}
