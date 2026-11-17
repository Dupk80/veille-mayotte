package com.dupk.maison;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;
import android.util.Base64;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

public class MainActivity extends Activity {
    private WebView web;
    private boolean pageReady = false, edgeToEdge = false;
    private int sysTop = 0, sysBottom = 0;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        web.setBackgroundColor(0xFF15172B);
        setContentView(web);
        setupEdgeToEdge();

        WebSettings ws = web.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setAllowFileAccess(true);
        ws.setTextZoom(100);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView v, String url) {
                pageReady = true;
                pushInsets();
            }
        });
        web.addJavascriptInterface(new Bridge(this), "Android");
        web.loadUrl("file:///android_asset/index.html");

        Notifier.ensureChannel(this);
        requestNotifPermission();
        Scheduler.reschedule(this);
    }

    /** Le ciel pixel passe sous la barre d'état ; on transmet les marges à la page. */
    private void setupEdgeToEdge() {
        Window w = getWindow();
        w.setStatusBarColor(Color.TRANSPARENT);
        w.setNavigationBarColor(0xFF15172B);
        if (Build.VERSION.SDK_INT >= 30) {
            w.setDecorFitsSystemWindows(false);
        } else {
            w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
            View content = findViewById(android.R.id.content);
            if (content != null && content.getParent() instanceof View) ((View) content.getParent()).setFitsSystemWindows(false);
        }
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams lp = w.getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            w.setAttributes(lp);
        }
        View content = findViewById(android.R.id.content);
        content.setOnApplyWindowInsetsListener((v, ins) -> {
            sysTop = ins.getSystemWindowInsetTop();
            int bottom = ins.getSystemWindowInsetBottom();
            float d = getResources().getDisplayMetrics().density;
            // Clavier ouvert : on raccourcit la WebView pour que le champ reste visible
            int ime = Build.VERSION.SDK_INT >= 30 ? ins.getInsets(WindowInsets.Type.ime()).bottom : (bottom > 120 * d ? bottom : 0);
            sysBottom = ime > 0 ? 0 : bottom;
            FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) web.getLayoutParams();
            if (lp != null && lp.bottomMargin != ime) {
                lp.bottomMargin = ime;
                web.setLayoutParams(lp);
            }
            v.post(this::pushInsets);
            return ins;
        });
    }

    private void pushInsets() {
        if (!pageReady || web == null) return;
        int[] loc = new int[2];
        web.getLocationOnScreen(loc);
        float d = getResources().getDisplayMetrics().density;
        int top = Math.max(0, sysTop - loc[1]);
        int decorH = getWindow().getDecorView().getHeight();
        int below = Math.max(0, decorH - (loc[1] + web.getHeight()));
        int bottom = Math.max(0, sysBottom - below);
        edgeToEdge = top > 0;
        if (!edgeToEdge) getWindow().setStatusBarColor(0xFF3F8CE8);
        web.evaluateJavascript("window.setInsets&&window.setInsets(" + (top / d) + "," + (bottom / d) + ")", null);
    }

    private void requestNotifPermission() {
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 7);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.evaluateJavascript("window.onResumeApp && window.onResumeApp()", null);
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.onBack ? window.onBack() : false", v -> {
            if (!"true".equals(v)) finish();
        });
    }

    /** Pont JavaScript ↔ Android utilisé par l'interface (assets/index.html). */
    public class Bridge {
        private final Context ctx;
        private final SharedPreferences prefs;

        Bridge(Context c) {
            ctx = c.getApplicationContext();
            prefs = ctx.getSharedPreferences(Scheduler.PREFS, Context.MODE_PRIVATE);
        }

        @JavascriptInterface
        public String getSettings() {
            return prefs.getString(Scheduler.KEY_SETTINGS, "");
        }

        @JavascriptInterface
        public void saveSettings(String json) {
            prefs.edit().putString(Scheduler.KEY_SETTINGS, json).commit();
            Scheduler.reschedule(ctx);
        }

        @JavascriptInterface
        public void testNotification() {
            requestNotifPermission();
            Notifier.show(ctx, "test", "", System.currentTimeMillis(), 0);
        }

        @JavascriptInterface
        public boolean isNight() {
            return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                    == Configuration.UI_MODE_NIGHT_YES;
        }

        @JavascriptInterface
        public void vibrate(int ms) {
            Vibrator v = (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null && v.hasVibrator()) {
                v.vibrate(VibrationEffect.createOneShot(Math.max(5, Math.min(ms, 400)), VibrationEffect.DEFAULT_AMPLITUDE));
            }
        }

        @JavascriptInterface
        public void setBarColor(String hex, boolean lightIcons) {
            runOnUiThread(() -> {
                if (edgeToEdge) return;
                try {
                    int col = Color.parseColor(hex);
                    Window w = getWindow();
                    w.setStatusBarColor(col);
                    int flags = w.getDecorView().getSystemUiVisibility();
                    if (lightIcons) {
                        flags &= ~(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
                    } else {
                        flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                    }
                    w.getDecorView().setSystemUiVisibility(flags);
                } catch (Exception ignored) {
                }
            });
        }

        /** Image pixel du compagnon (PNG en base64), utilisée dans les notifications. */
        @JavascriptInterface
        public void setPetIcon(String b64) {
            try {
                byte[] data = Base64.decode(b64, Base64.DEFAULT);
                try (java.io.FileOutputStream fo = ctx.openFileOutput("pet.png", Context.MODE_PRIVATE)) {
                    fo.write(data);
                }
            } catch (Exception ignored) {
            }
        }

        @JavascriptInterface
        public String status() {
            JSONObject o = new JSONObject();
            try {
                NotificationManager nm = ctx.getSystemService(NotificationManager.class);
                o.put("notif", nm.areNotificationsEnabled());
                o.put("exact", Scheduler.canExact(ctx));
                o.put("next", prefs.getLong("nextAlarm", 0));
            } catch (Exception ignored) {
            }
            return o.toString();
        }

        @JavascriptInterface
        public void openNotifSettings() {
            Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, ctx.getPackageName())
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
        }

        @JavascriptInterface
        public void openExactAlarmSettings() {
            if (Build.VERSION.SDK_INT >= 31) {
                Intent i = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                        Uri.parse("package:" + ctx.getPackageName())).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                try {
                    ctx.startActivity(i);
                } catch (Exception ignored) {
                }
            }
        }
    }
}
