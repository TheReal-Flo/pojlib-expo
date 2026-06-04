package pojlib;

import android.content.Context;

import androidx.annotation.Keep;

import com.google.gson.Gson;
import com.google.gson.annotations.SerializedName;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.stream.Collectors;

import pojlib.util.Constants;
import pojlib.util.download.DownloadManager;
import pojlib.util.download.DownloadUtils;
import pojlib.util.GsonUtils;
import pojlib.util.Logger;

public class APIHandler {
    private static final String DEFAULT_SUPPORTED_VERSION = "1.21.4";
    public final String baseUrl;

    public APIHandler(String url) {
        baseUrl = url;
    }

    public <T> T get(String endpoint, Class<T> tClass) {
        return getFullUrl(baseUrl + "/" + endpoint, tClass);
    }

    public <T> T get(String endpoint, HashMap<String, Object> query, Class<T> tClass) {
        return getFullUrl(baseUrl + "/" + endpoint, query, tClass);
    }

    public <T> T post(String endpoint, T body, Class<T> tClass) {
        return postFullUrl(baseUrl + "/" + endpoint, body, tClass);
    }

    public <T> T post(String endpoint, HashMap<String, Object> query, T body, Class<T> tClass) {
        return postFullUrl(baseUrl + "/" + endpoint, query, body, tClass);
    }

    //Make a get request and return the response as a raw string;
    public static String getRaw(String url) {
        try {
            HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
            InputStream inputStream = conn.getInputStream();
            String data = new BufferedReader(new InputStreamReader(inputStream, StandardCharsets.UTF_8)).lines().collect(Collectors.joining("\n"));
            inputStream.close();
            conn.disconnect();
            return data;
        } catch (IOException e) {
            e.printStackTrace();
        }
        return null;
    }

    public static String postRaw(String url, String body) {
        try {
            HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Accept", "application/json");
            conn.setDoOutput(true);

            OutputStream outputStream = conn.getOutputStream();
            byte[] input = body.getBytes(StandardCharsets.UTF_8);
            outputStream.write(input, 0, input.length);
            outputStream.close();

            InputStream inputStream = conn.getInputStream();
            String data = new BufferedReader(new InputStreamReader(inputStream, StandardCharsets.UTF_8)).lines().collect(Collectors.joining("\n"));
            inputStream.close();

            conn.disconnect();
            return data;
        } catch (IOException e) {
            e.printStackTrace();
        }
        return null;
    }

    private static String parseQueries(HashMap<String, Object> query) {
        StringBuilder params = new StringBuilder("?");
        for (String param : query.keySet()) {
            Object value = query.get(param);
            params.append(param).append("=").append(value).append("&");
        }
        return params.substring(0, params.length() - 1);
    }

    public static <T> T getFullUrl(String url, Class<T> tClass) {
        return new Gson().fromJson(getRaw(url), tClass);
    }

    public static <T> T getFullUrl(String url, HashMap<String, Object> query, Class<T> tClass) {
        return getFullUrl(url + parseQueries(query), tClass);
    }

    public static <T> T postFullUrl(String url, T body, Class<T> tClass) {
        return new Gson().fromJson(postRaw(url, body.toString()), tClass);
    }

    public static <T> T postFullUrl(String url, HashMap<String, Object> query, T body, Class<T> tClass) {
        return new Gson().fromJson(postRaw(url + parseQueries(query), body.toString()), tClass);
    }

    public static final String SUPPORTED_VERSIONS = "https://raw.githubusercontent.com/QuestCraftPlusPlus/Pojlib/refs/heads/" + Constants.GIT_BRANCH + "/supportedVersions.json";

    public static String[] getQCSupportedVersions(Context ctx) {
        File versionsJson = new File(Constants.USER_HOME + "/supportedVersions.json");
        if(API.hasConnection(ctx)) {
            try {
                DownloadUtils.downloadFile(SUPPORTED_VERSIONS, versionsJson);
            } catch (IOException e) {
                Logger.getInstance().appendToLog("Error while grabbing supported versions!\n" + e);
            }
        } else {
            Logger.getInstance().appendToLog("Skipping supported versions download.");
        }

        DownloadManager.reset();
        SupportedVersions versions = GsonUtils.jsonFileToObject(versionsJson.getAbsolutePath(), SupportedVersions.class);
        if(versions == null || versions.supportedVersions == null || versions.supportedVersions.length == 0) {
            return new String[] {
                    DEFAULT_SUPPORTED_VERSION
            };
        }

        String[] normalized = java.util.Arrays.stream(versions.supportedVersions)
                .filter(value -> value != null && !value.trim().isEmpty())
                .map(String::trim)
                .distinct()
                .toArray(String[]::new);
        if (normalized.length == 0) {
            return new String[] {
                    DEFAULT_SUPPORTED_VERSION
            };
        }

        return normalized;
    }

    @Keep
    public static class SupportedVersions {
        public SupportedVersions() {}

        @Keep
        @SerializedName("supportedVersions")
        public String[] supportedVersions;
    }
}
