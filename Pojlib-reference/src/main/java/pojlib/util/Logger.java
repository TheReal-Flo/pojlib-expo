package pojlib.util;

import androidx.annotation.Keep;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.PrintStream;
import java.lang.ref.WeakReference;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;

/** Singleton class made to log on one file
 * The singleton part can be removed but will require more implementation from the end-dev
 */
@Keep
public class Logger {
    public static final String LATEST_LOG_FILE_NAME = "latestlog.txt";
    public static final String LAST_SESSION_LOG_FILE_NAME = "lastsessionlog.txt";

    /* Instance variables */
    private final File mLogFile;
    private final File mLastSessionLogFile;
    private PrintStream mLogStream;
    private WeakReference<eventLogListener> mLogListenerWeakReference = null;

    /* No public construction */
    private Logger(){
        this(LATEST_LOG_FILE_NAME);
    }

    private Logger(String fileName){
        mLogFile = new File(Constants.USER_HOME, fileName);
        mLastSessionLogFile = new File(Constants.USER_HOME, LAST_SESSION_LOG_FILE_NAME);
        rotateCurrentLogToLastSession();
        // Make a new instance of the log file
        mLogFile.delete();
        try {
            mLogFile.createNewFile();
            mLogStream = createLogStream();
        }catch (IOException e){e.printStackTrace();}

    }

    private static final class SLoggerSingletonHolder {
        static final Logger sLoggerSingleton = new Logger();
    }

    public static Logger getInstance(){
        return SLoggerSingletonHolder.sLoggerSingleton;
    }


    /** Print the text to the log file if not censored */
    public synchronized void appendToLog(String text){
        if(shouldCensorLog(text)) return;
        appendToLogUnchecked(text);
    }

    /** Print the text to the log file, no china censoring there */
    public synchronized void appendToLogUnchecked(String text){
        if (mLogStream == null) {
            return;
        }
        mLogStream.println(text);
        mLogStream.flush();
        notifyLogListener(text);
    }

    public void appendThrowable(String prefix, Throwable throwable) {
        StringBuilder builder = new StringBuilder(prefix == null ? "" : prefix);
        if (throwable != null) {
            if (builder.length() > 0 && builder.charAt(builder.length() - 1) != '\n') {
                builder.append('\n');
            }
            builder.append(android.util.Log.getStackTraceString(throwable));
        }
        appendToLogUnchecked(builder.toString());
    }

    /** Reset the log file, effectively erasing any previous logs */
    public synchronized void reset(){
        try{
            if (mLogStream != null) {
                mLogStream.flush();
                mLogStream.close();
            }
            rotateCurrentLogToLastSession();
            mLogFile.delete();
            mLogFile.createNewFile();
            mLogStream = createLogStream();
        }catch (IOException e){ e.printStackTrace();}
    }

    /** Disables the printing */
    public synchronized void shutdown(){
        if (mLogStream != null) {
            mLogStream.flush();
            mLogStream.close();
        }
    }

    public synchronized void archiveCurrentLogToLastSession() {
        if (mLogStream != null) {
            mLogStream.flush();
        }
        copyCurrentLogToLastSession();
    }

    private void rotateCurrentLogToLastSession() {
        if (!mLogFile.exists()) {
            return;
        }

        if (!hasMeaningfulLogContent(mLogFile)) {
            return;
        }

        copyCurrentLogToLastSession();
        if (mLogFile.exists()) {
            mLogFile.delete();
        }
    }

    private void copyCurrentLogToLastSession() {
        if (!mLogFile.exists() || !hasMeaningfulLogContent(mLogFile)) {
            return;
        }

        if (mLastSessionLogFile.exists()) {
            mLastSessionLogFile.delete();
        }

        if (mLogFile.renameTo(mLastSessionLogFile)) {
            return;
        }

        try {
            Files.copy(mLogFile.toPath(), mLastSessionLogFile.toPath(), StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException ignored) {
            // Ignore rotation failures and continue with a fresh latest log.
        }
    }

    private PrintStream createLogStream() throws IOException {
        return new PrintStream(new FileOutputStream(mLogFile, false), true, StandardCharsets.UTF_8.name());
    }

    private boolean hasMeaningfulLogContent(File file) {
        try {
            return file.exists() && Files.size(file.toPath()) > 0;
        } catch (IOException ignored) {
            return false;
        }
    }

    /**
     * Perform various checks to see if the log is safe to print
     * Subclasses may want to override this behavior
     * @param text The text to check
     * @return Whether the log should be censored
     */
    private static boolean shouldCensorLog(String text){
        return text.contains("Session ID is");
    }

    /** Small listener for anything listening to the log */
    public interface eventLogListener {
        void onEventLogged(String text);
    }

    /** Link a log listener to the logger */
    public void setLogListener(eventLogListener logListener){
        this.mLogListenerWeakReference = new WeakReference<>(logListener);
    }

    /** Notifies the event listener, if it exists */
    private void notifyLogListener(String text){
        if(mLogListenerWeakReference == null) return;
        eventLogListener logListener = mLogListenerWeakReference.get();
        if(logListener == null){
            mLogListenerWeakReference = null;
            return;
        }
        logListener.onEventLogged(text);
    }
}
