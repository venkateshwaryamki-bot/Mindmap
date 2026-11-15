package app.mindflow;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.text.InputType;
import android.util.Base64;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.inputmethod.EditorInfo;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * MindFlow for Android.
 *
 * The maps, live sync and the Claude assistant live on your MindFlow server
 * (your laptop on Wi-Fi, or a hosted copy). This app remembers the server
 * address and shows MindFlow full screen, with file import/export and the
 * Android back button wired up.
 */
public class MainActivity extends Activity {
    private static final String PREFS = "mindflow";
    private static final String KEY_SERVER = "server";
    private static final int FILE_CHOOSER = 1001;

    private FrameLayout root;
    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private final Handler main = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#161C2B"));
        applySystemBarPadding(root);
        setContentView(root);

        String server = prefs().getString(KEY_SERVER, null);
        if (server == null) showSetup(null, null);
        else showWeb(server);
    }

    // ------------------------------------------------------------------ setup

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void showSetup(String prefill, String error) {
        if (webView != null) {
            webView.stopLoading();
            webView.setVisibility(View.GONE);
        }
        View old = root.findViewWithTag("setup");
        if (old != null) root.removeView(old);

        ScrollView scroll = new ScrollView(this);
        scroll.setTag("setup");
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(Color.parseColor("#0F1420"));

        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER_HORIZONTAL);
        col.setPadding(dp(28), dp(48), dp(28), dp(28));
        scroll.addView(col, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        ImageView icon = new ImageView(this);
        icon.setImageResource(R.mipmap.ic_launcher);
        col.addView(icon, new LinearLayout.LayoutParams(dp(84), dp(84)));

        TextView title = text("MindFlow", 26, "#E5E9F2");
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setPadding(0, dp(14), 0, dp(6));
        col.addView(title);

        TextView subtitle = text("Enter the address of your MindFlow server.", 15, "#8B95A9");
        subtitle.setGravity(Gravity.CENTER);
        subtitle.setPadding(0, 0, 0, dp(22));
        col.addView(subtitle);

        EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        input.setImeOptions(EditorInfo.IME_ACTION_GO);
        input.setHint("192.168.1.20:8787  or  https://my-mindflow.onrender.com");
        input.setHintTextColor(Color.parseColor("#5B657A"));
        input.setTextColor(Color.parseColor("#E5E9F2"));
        input.setTextSize(16);
        input.setPadding(dp(14), dp(12), dp(14), dp(12));
        input.setBackground(rounded("#0B1019", "#283244"));
        if (prefill != null) input.setText(prefill);
        col.addView(input, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView errorView = text(error == null ? "" : error, 14, "#FCA5A5");
        errorView.setPadding(0, dp(10), 0, 0);
        errorView.setVisibility(error == null ? View.GONE : View.VISIBLE);
        col.addView(errorView);

        Button connect = new Button(this);
        connect.setText("Connect");
        connect.setAllCaps(false);
        connect.setTextSize(16);
        connect.setTextColor(Color.WHITE);
        connect.setBackground(rounded("#6366F1", "#6366F1"));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(50));
        lp.topMargin = dp(16);
        col.addView(connect, lp);

        TextView help = text(
                "Where do I find this?\n\n" +
                "• MindFlow running on your laptop: start it with \"npm run app\". It prints a line " +
                "\"On your Wi-Fi  http://192.168.x.x:8787\". Type that address here. " +
                "Your phone must be on the same Wi-Fi and the laptop must stay on.\n\n" +
                "• MindFlow hosted online (e.g. Render): type its https address. Works from anywhere.",
                14, "#8B95A9");
        help.setPadding(0, dp(28), 0, 0);
        help.setLineSpacing(0, 1.2f);
        col.addView(help);

        Runnable go = () -> {
            String url = normalize(input.getText().toString());
            if (url == null) {
                errorView.setText("Please type the server address.");
                errorView.setVisibility(View.VISIBLE);
                return;
            }
            connect.setEnabled(false);
            connect.setText("Connecting…");
            errorView.setVisibility(View.GONE);
            checkServer(url, ok -> {
                connect.setEnabled(true);
                connect.setText("Connect");
                if (ok) {
                    prefs().edit().putString(KEY_SERVER, url).apply();
                    root.removeView(scroll);
                    showWeb(url);
                } else {
                    errorView.setText("Could not reach MindFlow at " + url + ".\nCheck the address, that the server is running, " +
                            "and (for a laptop) that your phone is on the same Wi-Fi.");
                    errorView.setVisibility(View.VISIBLE);
                }
            });
        };
        connect.setOnClickListener(v -> go.run());
        input.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_GO || (event != null && event.getKeyCode() == KeyEvent.KEYCODE_ENTER)) {
                go.run();
                return true;
            }
            return false;
        });

        root.addView(scroll, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    private TextView text(String value, int sp, String color) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(sp);
        view.setTextColor(Color.parseColor(color));
        view.setGravity(Gravity.CENTER_HORIZONTAL);
        return view;
    }

    private GradientDrawable rounded(String fill, String stroke) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(Color.parseColor(fill));
        d.setStroke(dp(1), Color.parseColor(stroke));
        d.setCornerRadius(dp(10));
        return d;
    }

    /** Accepts "192.168.1.20", "192.168.1.20:8787", "my.host.com", full URLs. */
    static String normalize(String raw) {
        String s = raw == null ? "" : raw.trim();
        if (s.isEmpty()) return null;
        while (s.endsWith("/")) s = s.substring(0, s.length() - 1);
        if (!s.startsWith("http://") && !s.startsWith("https://")) {
            String host = s.split("[/:]")[0];
            boolean local = host.matches("\\d+\\.\\d+\\.\\d+\\.\\d+") || host.equals("localhost") || host.endsWith(".local");
            s = (local ? "http://" : "https://") + s;
            if (local && !s.substring(s.indexOf("://") + 3).contains(":")) s = s + ":8787";
        }
        return s;
    }

    interface Result {
        void done(boolean ok);
    }

    private void checkServer(String url, Result result) {
        new Thread(() -> {
            boolean ok = false;
            try {
                HttpURLConnection conn = (HttpURLConnection) new URL(url + "/api/health").openConnection();
                conn.setConnectTimeout(7000);
                conn.setReadTimeout(7000);
                int code = conn.getResponseCode();
                ok = code == 200;
                conn.disconnect();
            } catch (Exception ignored) {
                // unreachable
            }
            final boolean reachable = ok;
            main.post(() -> result.done(reachable));
        }).start();
    }

    // ---------------------------------------------------------------- web view

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private void showWeb(String server) {
        if (webView == null) {
            webView = new WebView(this);
            webView.setBackgroundColor(Color.parseColor("#0F1420"));
            WebSettings s = webView.getSettings();
            s.setJavaScriptEnabled(true);
            s.setDomStorageEnabled(true);
            s.setDatabaseEnabled(true);
            s.setSupportZoom(false);
            s.setBuiltInZoomControls(false);
            s.setDisplayZoomControls(false);
            s.setTextZoom(100);
            s.setMediaPlaybackRequiresUserGesture(true);
            s.setUserAgentString(s.getUserAgentString() + " MindFlowAndroid/1.0");
            CookieManager.getInstance().setAcceptCookie(true);
            CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);

            webView.addJavascriptInterface(new Bridge(), "MindFlowAndroid");
            webView.setWebViewClient(new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    Uri target = request.getUrl();
                    Uri home = Uri.parse(currentServer());
                    if (target.getHost() != null && target.getHost().equals(home.getHost())) return false;
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, target));
                    } catch (Exception ignored) {
                        // no browser
                    }
                    return true;
                }

                @Override
                public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                    if (request.isForMainFrame()) {
                        showSetup(currentServer(), "Could not open MindFlow (" + error.getDescription() + ").\n" +
                                "Is the server running and reachable from this phone?");
                    }
                }
            });
            webView.setWebChromeClient(new WebChromeClient() {
                @Override
                public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                    if (fileCallback != null) fileCallback.onReceiveValue(null);
                    fileCallback = callback;
                    Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("*/*");
                    try {
                        startActivityForResult(Intent.createChooser(intent, "Import a map"), FILE_CHOOSER);
                    } catch (Exception e) {
                        fileCallback = null;
                        return false;
                    }
                    return true;
                }
            });
            root.addView(webView, 0, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        }
        View setup = root.findViewWithTag("setup");
        if (setup != null) root.removeView(setup);
        webView.setVisibility(View.VISIBLE);
        webView.loadUrl(server + "/");
    }

    private String currentServer() {
        return prefs().getString(KEY_SERVER, "");
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER && fileCallback != null) {
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null) result = new Uri[]{data.getData()};
            fileCallback.onReceiveValue(result);
            fileCallback = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.getVisibility() == View.VISIBLE) {
            // Let the page close an open sheet / drawer first.
            webView.evaluateJavascript("window.mindflowBack ? window.mindflowBack() : false", value -> {
                if ("true".equals(value)) return;
                if (webView.canGoBack()) webView.goBack();
                else finish();
            });
            return;
        }
        if (root.findViewWithTag("setup") != null && currentServer().length() > 0 && webView != null) {
            showWeb(currentServer());
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }

    /** Keep content clear of the status bar, navigation bar and keyboard (Android 15 draws edge to edge). */
    private void applySystemBarPadding(View view) {
        view.setOnApplyWindowInsetsListener((v, insets) -> {
            int left, top, right, bottom;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime() | WindowInsets.Type.displayCutout());
                left = bars.left;
                top = bars.top;
                right = bars.right;
                bottom = bars.bottom;
            } else {
                left = insets.getSystemWindowInsetLeft();
                top = insets.getSystemWindowInsetTop();
                right = insets.getSystemWindowInsetRight();
                bottom = insets.getSystemWindowInsetBottom();
            }
            v.setPadding(left, top, right, bottom);
            return insets;
        });
    }

    // ------------------------------------------------------------------ bridge

    /** Called from the web app (window.MindFlowAndroid) for things a WebView cannot do itself. */
    private class Bridge {
        @JavascriptInterface
        public void saveFile(String name, String base64, String mime) {
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                String safe = name.replaceAll("[\\\\/:*?\"<>|]", "_");
                String where;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Downloads.DISPLAY_NAME, safe);
                    values.put(MediaStore.Downloads.MIME_TYPE, mime);
                    values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (uri == null) throw new IllegalStateException("Could not create file");
                    try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                        if (out == null) throw new IllegalStateException("Could not open file");
                        out.write(bytes);
                    }
                    where = "Downloads/" + safe;
                } else {
                    File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    File file = new File(dir, safe);
                    try (FileOutputStream out = new FileOutputStream(file)) {
                        out.write(bytes);
                    }
                    where = file.getAbsolutePath();
                }
                toast("Saved to " + where);
            } catch (Exception e) {
                toast("Could not save: " + e.getMessage());
            }
        }

        @JavascriptInterface
        public void copyText(String text) {
            ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("MindFlow", text));
        }

        @JavascriptInterface
        public void changeServer() {
            main.post(() -> showSetup(currentServer(), null));
        }

        @JavascriptInterface
        public String server() {
            return currentServer();
        }
    }

    private void toast(String message) {
        main.post(() -> Toast.makeText(MainActivity.this, message, Toast.LENGTH_LONG).show());
    }
}
