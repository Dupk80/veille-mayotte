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
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

public class MainActivity extends Activity {
    private WebView web;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        web.setBackgroundColor(0xFF5AA9F0);
        setContentView(web);

        WebSettings ws = web.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setAllowFileAccess(true);
        ws.setTextZoom(100);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setWebViewClient(new WebViewClient());
        web.addJavascriptInterface(new Bridge(this), "Android");
        web.loadUrl("file:///android_asset/index.html");

        Notifier.ensureChannel(this);
        requestNotifPermission();
        Scheduler.reschedule(this);
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
                try {
                    int col = Color.parseColor(hex);
                    Window w = getWindow();
                    w.setStatusBarColor(col);
                    w.setNavigationBarColor(col);
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
