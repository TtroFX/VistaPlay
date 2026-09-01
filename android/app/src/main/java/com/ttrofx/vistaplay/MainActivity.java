package com.ttrofx.vistaplay;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

public final class MainActivity extends Activity {
    private static final String APP_URL = "https://ttrofx.github.io/VistaPlay/";
    private static final Set<String> APP_ORIGINS = new HashSet<>(Arrays.asList("https://ttrofx.github.io"));
    private static final Pattern VIDEO_ID_PATTERN = Pattern.compile("^[A-Za-z0-9_-]{6,32}$");
    private static final int MAX_RESOLVER_RESPONSE_BYTES = 2 * 1024 * 1024;
    private static final String[] PIPED_API_BASES = new String[] {
            "https://pipedapi.kavin.rocks",
            "https://pipedapi.tokhmi.xyz",
            "https://pipedapi.moomoo.me",
            "https://pipedapi.syncpundit.io",
            "https://api-piped.mha.fi",
            "https://piped-api.garudalinux.org",
            "https://pipedapi.rivo.lol",
            "https://pipedapi.leptons.xyz"
    };

    private final ExecutorService resolverExecutor = Executors.newFixedThreadPool(2);
    private FrameLayout root;
    private WebView webView;
    private View fullscreenView;
    private WebChromeClient.CustomViewCallback fullscreenCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        setContentView(root);

        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        configureWebView();
        installNativeBridge();
        webView.loadUrl(APP_URL);
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
        boolean debuggable = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        WebView.setWebContentsDebuggingEnabled(debuggable);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                Uri uri = request.getUrl();
                if ("https".equals(uri.getScheme()) && "ttrofx.github.io".equals(uri.getHost()) && uri.getPath() != null && uri.getPath().startsWith("/VistaPlay")) return false;
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
                return true;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (fullscreenView != null) { callback.onCustomViewHidden(); return; }
                fullscreenView = view;
                fullscreenCallback = callback;
                webView.setVisibility(View.GONE);
                root.addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                root.setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION);
            }

            @Override
            public void onHideCustomView() {
                hideFullscreenView();
            }
        });
    }

    private void installNativeBridge() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return;
        WebViewCompat.addWebMessageListener(webView, "VistaPlayNative", APP_ORIGINS,
                (view, message, sourceOrigin, isMainFrame, replyProxy) -> {
                    if (!isMainFrame || message.getData() == null) return;
                    try {
                        JSONObject json = new JSONObject(message.getData());
                        String type = json.optString("type");
                        if ("openChatGPT".equals(type)) {
                            String prompt = json.optString("prompt", "");
                            if (!prompt.isEmpty()) {
                                ClipboardManager clipboard = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                                clipboard.setPrimaryClip(ClipData.newPlainText("VistaPlay ChatGPT prompt", prompt));
                            }
                            openChatGPT();
                            return;
                        }
                        if ("resolveYouTubeMedia".equals(type)) {
                            resolveYouTubeMedia(json, replyProxy);
                        }
                    } catch (Exception ignored) { /* malformed app message */ }
                });
    }

    private void resolveYouTubeMedia(JSONObject request, JavaScriptReplyProxy replyProxy) {
        String requestId = request.optString("requestId", "");
        String videoId = request.optString("videoId", "");
        if (requestId.isEmpty() || !VIDEO_ID_PATTERN.matcher(videoId).matches()) {
            postResolverReply(replyProxy, resolverError(requestId, "Invalid resolver request"));
            return;
        }

        resolverExecutor.execute(() -> {
            StringBuilder failures = new StringBuilder();
            for (String base : PIPED_API_BASES) {
                try {
                    JSONObject payload = fetchPipedStreams(base, videoId);
                    JSONObject response = new JSONObject();
                    response.put("type", "resolveYouTubeMediaResult");
                    response.put("requestId", requestId);
                    response.put("ok", true);
                    response.put("instance", base);
                    response.put("payload", payload);
                    postResolverReply(replyProxy, response);
                    return;
                } catch (Exception error) {
                    if (failures.length() > 0) failures.append("; ");
                    failures.append(base).append(": ").append(error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage());
                }
            }
            postResolverReply(replyProxy, resolverError(requestId, "All native Piped resolvers failed (" + failures + ")"));
        });
    }

    private JSONObject fetchPipedStreams(String base, String videoId) throws Exception {
        URL url = new URL(base + "/streams/" + videoId);
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setConnectTimeout(3500);
        connection.setReadTimeout(6500);
        connection.setInstanceFollowRedirects(true);
        connection.setRequestMethod("GET");
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("User-Agent", "VistaPlay/1.1 Android");
        try {
            int status = connection.getResponseCode();
            InputStream stream = status >= 200 && status < 300 ? connection.getInputStream() : connection.getErrorStream();
            String body = readLimitedUtf8(stream);
            if (status < 200 || status >= 300) throw new IllegalStateException("HTTP " + status);
            JSONObject payload = new JSONObject(body);
            if (!payload.has("videoStreams") && !payload.has("audioStreams")) throw new IllegalStateException("Missing stream arrays");
            return payload;
        } finally {
            connection.disconnect();
        }
    }

    private static String readLimitedUtf8(InputStream input) throws Exception {
        if (input == null) return "";
        try (InputStream stream = input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int total = 0;
            int read;
            while ((read = stream.read(buffer)) != -1) {
                total += read;
                if (total > MAX_RESOLVER_RESPONSE_BYTES) throw new IllegalStateException("Resolver response too large");
                output.write(buffer, 0, read);
            }
            return new String(output.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    private JSONObject resolverError(String requestId, String message) {
        JSONObject response = new JSONObject();
        try {
            response.put("type", "resolveYouTubeMediaResult");
            response.put("requestId", requestId);
            response.put("ok", false);
            response.put("error", message);
        } catch (Exception ignored) { /* fixed keys */ }
        return response;
    }

    private void postResolverReply(JavaScriptReplyProxy replyProxy, JSONObject response) {
        runOnUiThread(() -> replyProxy.postMessage(response.toString()));
    }

    private void openChatGPT() {
        Intent launch = getPackageManager().getLaunchIntentForPackage("com.openai.chatgpt");
        if (launch != null) {
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(launch);
            return;
        }
        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://chatgpt.com/")));
    }

    private void hideFullscreenView() {
        if (fullscreenView == null) return;
        root.removeView(fullscreenView);
        fullscreenView = null;
        webView.setVisibility(View.VISIBLE);
        root.setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
        if (fullscreenCallback != null) fullscreenCallback.onCustomViewHidden();
        fullscreenCallback = null;
    }

    @Override
    public void onBackPressed() {
        if (fullscreenView != null) { hideFullscreenView(); return; }
        if (webView.canGoBack()) { webView.goBack(); return; }
        super.onBackPressed();
    }

    @Override
    protected void onPause() {
        if (webView != null) { webView.onPause(); webView.pauseTimers(); }
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) { webView.resumeTimers(); webView.onResume(); }
    }

    @Override
    protected void onDestroy() {
        resolverExecutor.shutdownNow();
        if (webView != null) { webView.destroy(); webView = null; }
        super.onDestroy();
    }
}
