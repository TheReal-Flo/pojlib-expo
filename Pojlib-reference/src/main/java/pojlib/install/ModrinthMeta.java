package pojlib.install;

import com.google.gson.Gson;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URLEncoder;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class ModrinthMeta {
    private static final String API_ROOT = "https://api.modrinth.com/v2";
    private static final String USER_AGENT = "TheReal-Flo/pojlib-expo";
    private static final Gson GSON = new Gson();

    private ModrinthMeta() {}

    public static ResolvedProject resolveVersion(String versionId) throws IOException {
        VersionResponse[] versions = requestJson(
                API_ROOT + "/versions?ids=" + encodeIds(versionId),
                VersionResponse[].class
        );

        if (versions == null || versions.length == 0 || versions[0] == null) {
            throw new IOException("Modrinth version '" + versionId + "' was not found.");
        }

        VersionResponse version = versions[0];
        VersionFile file = selectPrimaryFile(version.files);
        ProjectResponse project = requestJson(API_ROOT + "/project/" + version.project_id, ProjectResponse.class);

        String slug = project != null && project.slug != null && !project.slug.isEmpty()
                ? project.slug
                : version.project_id;
        String title = project != null && project.title != null && !project.title.isEmpty()
                ? project.title
                : slug;

        return new ResolvedProject(slug, title, version.id, version.version_number, file.filename, file.url);
    }

    private static String encodeIds(String versionId) {
        String payload = "[\"" + versionId + "\"]";
        return URLEncoder.encode(payload, StandardCharsets.UTF_8);
    }

    private static VersionFile selectPrimaryFile(VersionFile[] files) throws IOException {
        if (files == null || files.length == 0) {
            throw new IOException("The requested Modrinth version does not expose any downloadable files.");
        }

        for (VersionFile file : files) {
            if (file != null && file.primary) {
                return file;
            }
        }

        if (files[0] == null) {
            throw new IOException("The requested Modrinth version has an invalid primary file entry.");
        }

        return files[0];
    }

    private static <T> T requestJson(String url, Class<T> clazz) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setRequestMethod("GET");
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("User-Agent", USER_AGENT);
        connection.setConnectTimeout(10000);
        connection.setReadTimeout(10000);
        connection.setDoInput(true);
        connection.connect();

        int responseCode = connection.getResponseCode();
        if (responseCode != HttpURLConnection.HTTP_OK) {
            throw new IOException("Modrinth API request failed with status " + responseCode + " for " + url);
        }

        try (InputStream stream = connection.getInputStream();
             InputStreamReader reader = new InputStreamReader(stream, StandardCharsets.UTF_8)) {
            return GSON.fromJson(reader, clazz);
        } finally {
            connection.disconnect();
        }
    }

    public static class ResolvedProject {
        public final String slug;
        public final String title;
        public final String versionId;
        public final String versionNumber;
        public final String fileName;
        public final String downloadUrl;

        public ResolvedProject(String slug, String title, String versionId, String versionNumber, String fileName, String downloadUrl) {
            this.slug = slug;
            this.title = title;
            this.versionId = versionId;
            this.versionNumber = versionNumber;
            this.fileName = fileName;
            this.downloadUrl = downloadUrl;
        }
    }

    private static class VersionResponse {
        String id;
        String project_id;
        String version_number;
        VersionFile[] files;
    }

    private static class VersionFile {
        String url;
        String filename;
        boolean primary;
    }

    private static class ProjectResponse {
        String slug;
        String title;
    }
}
