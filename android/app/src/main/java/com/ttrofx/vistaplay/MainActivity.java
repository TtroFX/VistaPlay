package com.ttrofx.vistaplay;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
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
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArraySet;

public final class MainActivity extends Activity {
    private static final String APP_URL = "https://ttrofx.github.io/VistaPlay/";
    private static final Set<String> APP_ORIGINS = new HashSet<>(Arrays.asList("https://ttrofx.github.io"));
    private static final Set<String> YOUTUBE_ORIGINS = new HashSet<>(Arrays.asList("https://www.youtube.com", "https://www.youtube-nocookie.com"));
    private static final Set<String> PLAYBACK_ORIGINS = new HashSet<>();

    static {
        PLAYBACK_ORIGINS.addAll(APP_ORIGINS);
        PLAYBACK_ORIGINS.addAll(YOUTUBE_ORIGINS);
    }

    private final Set<JavaScriptReplyProxy> appPlaybackFrames = new CopyOnWriteArraySet<>();
    private final Set<JavaScriptReplyProxy> mediaPlaybackFrames = new CopyOnWriteArraySet<>();
    private FrameLayout root;
    private WebView webView;
    private View fullscreenView;
    private WebChromeClient.CustomViewCallback fullscreenCallback;
    private double targetRate = 1.0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        setContentView(root);

        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        configureWebView();
        installPlaybackBridge();
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
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

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

    private void installPlaybackBridge() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)
                || !WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return;

        WebViewCompat.addWebMessageListener(webView, "VistaPlayPlayback", PLAYBACK_ORIGINS,
                (view, message, sourceOrigin, isMainFrame, replyProxy) -> {
                    String data = message.getData();
                    if (data == null) return;
                    String host = sourceOrigin.getHost();
                    boolean youtube = "www.youtube.com".equals(host) || "www.youtube-nocookie.com".equals(host);
                    if (youtube) {
                        mediaPlaybackFrames.add(replyProxy);
                        if (messageType(data).equals("agent:ready")) post(replyProxy, rateCommand());
                        if (messageType(data).startsWith("agent:")) for (JavaScriptReplyProxy proxy : appPlaybackFrames) post(proxy, data);
                        return;
                    }
                    if (!isMainFrame || !"ttrofx.github.io".equals(host)) return;
                    appPlaybackFrames.add(replyProxy);
                    String type = messageType(data);
                    if ("client:hello".equals(type)) post(replyProxy, "{\"type\":\"native:capabilities\",\"extendedPlayback\":true}");
                    if ("client:setRate".equals(type)) {
                        try {
                            double requested = new JSONObject(data).getDouble("rate");
                            if (Double.isFinite(requested)) targetRate = Math.max(0.25, Math.min(8.0, requested));
                        } catch (Exception ignored) { return; }
                        String command = rateCommand();
                        for (JavaScriptReplyProxy proxy : mediaPlaybackFrames) post(proxy, command);
                    }
                });

        try {
            WebViewCompat.addDocumentStartJavaScript(webView, readAsset("playback-agent.js"), YOUTUBE_ORIGINS);
        } catch (IOException ignored) {
            // Without the agent the bridge object is harmless; the web layer will keep the IFrame fallback.
        }
    }

    private void installNativeBridge() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return;
        WebViewCompat.addWebMessageListener(webView, "VistaPlayNative", APP_ORIGINS,
                (view, message, sourceOrigin, isMainFrame, replyProxy) -> {
                    if (!isMainFrame || message.getData() == null) return;
                    try {
                        JSONObject json = new JSONObject(message.getData());
                        if (!"openChatGPT".equals(json.optString("type"))) return;
                        String prompt = json.optString("prompt", "");
                        if (!prompt.isEmpty()) {
                            ClipboardManager clipboard = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                            clipboard.setPrimaryClip(ClipData.newPlainText("VistaPlay ChatGPT prompt", prompt));
                        }
                        openChatGPT();
                    } catch (Exception ignored) { /* malformed app message */ }
                });
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

    private String messageType(String raw) {
        try { return new JSONObject(raw).optString("type", ""); }
        catch (Exception ignored) { return ""; }
    }

    private String rateCommand() {
        return "{\"type\":\"agent:setRate\",\"rate\":" + targetRate + "}";
    }

    private void post(JavaScriptReplyProxy proxy, String data) {
        try { proxy.postMessage(data); } catch (RuntimeException ignored) { /* frame navigated */ }
    }

    private String readAsset(String name) throws IOException {
        try (InputStream stream = getAssets().open(name)) {
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        }
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
        if (webView != null) { webView.destroy(); webView = null; }
        super.onDestroy();
    }
}
