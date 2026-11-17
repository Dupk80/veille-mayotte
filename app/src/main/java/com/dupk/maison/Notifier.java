package com.dupk.maison;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Rect;

import java.io.File;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** Construit et affiche les notifications (style compagnon ou classique). */
final class Notifier {
    private Notifier() {}

    static final String CHANNEL = "rappels_maison";

    static void ensureChannel(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Rappels de la journée",
                NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Pauses, fin de journée et petits mots de ton compagnon");
        ch.enableVibration(true);
        ch.setVibrationPattern(new long[]{0, 120, 80, 120});
        nm.createNotificationChannel(ch);
    }

    static String hhmm(long t) {
        return new SimpleDateFormat("HH:mm", Locale.FRANCE).format(new Date(t));
    }

    static String dur(long ms) {
        long min = Math.max(0, Math.round(ms / 60000.0));
        long h = min / 60, m = min % 60;
        if (h == 0) return m + " min";
        if (m == 0) return h + " h";
        return h + " h " + (m < 10 ? "0" : "") + m;
    }

    static void show(Context c, String type, String label, long shiftEnd, long breakEnd) {
        ensureChannel(c);
        JSONObject s = Scheduler.settings(c);
        if (s == null) s = new JSONObject();
        JSONObject n = s.optJSONObject("notif");
        String style = n == null ? "pet" : n.optString("style", "pet");
        if ("off".equals(style)) return;
        String pet = s.optString("pet", "cat");
        String name = s.optString("petName", "Minou");
        String e = Pets.emoji(pet), cry = Pets.cry(pet);
        long left = shiftEnd - System.currentTimeMillis();
        boolean petStyle = !"classic".equals(style);

        String title, body;
        switch (type) {
            case Scheduler.START:
                title = petStyle ? e + " " + cry + " ! C'est parti !" : "Début de la journée";
                body = petStyle ? "Ta journée commence. Fin prévue à " + hhmm(shiftEnd) + ", je compte les minutes avec toi !"
                        : "Fin prévue à " + hhmm(shiftEnd) + " (dans " + dur(left) + ").";
                break;
            case Scheduler.BREAK_START:
                title = petStyle ? e + " " + cry + " ! C'est la pause !" : "Début de pause : " + label;
                body = petStyle ? label + " jusqu'à " + hhmm(breakEnd) + ". Lâche l'écran, je garde ta place 💤"
                        : label + " jusqu'à " + hhmm(breakEnd) + ".";
                break;
            case Scheduler.BREAK_END:
                title = petStyle ? e + " " + cry + "… la pause est finie" : "Fin de pause : " + label;
                body = petStyle ? "Courage ! Plus que " + dur(left) + " avant la maison 🏠"
                        : "Reprise du travail. Il reste " + dur(left) + ".";
                break;
            case Scheduler.BEFORE_END:
                title = petStyle ? e + " " + cry + " " + cry + " ! Plus que " + dur(left) + " !" : "Fin dans " + dur(left);
                body = petStyle ? "Prépare tes affaires, on rentre bientôt 🏠 " + Pets.flavor(pet)
                        : "Fin de journée à " + hhmm(shiftEnd) + ".";
                break;
            case Scheduler.END:
                title = petStyle ? e + " " + cry + " !!! On rentre à la maison !" : "Fin de la journée";
                body = petStyle ? "Journée terminée 🎉 Bravo ! " + name + " t'attend à la maison."
                        : "Il est " + hhmm(shiftEnd) + ", tu peux rentrer chez toi.";
                break;
            case "test":
                title = petStyle ? e + " " + cry + " ! Coucou, c'est " + name + " !" : "Notification de test";
                body = petStyle ? "Je te préviendrai pour tes pauses et ta fin de journée. " + Pets.flavor(pet)
                        : "Les notifications fonctionnent correctement.";
                break;
            default: // PERIODIC
                title = petStyle ? e + " Encore " + dur(left) + " !" : "Il reste " + dur(left);
                body = petStyle ? Pets.cheer() + " " + Pets.flavor(pet) : "Fin de journée à " + hhmm(shiftEnd) + ".";
        }

        Intent open = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, 1, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder b = new Notification.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_notif)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setColor(Pets.color(pet))
                .setAutoCancel(true)
                .setContentIntent(pi)
                .setCategory(Notification.CATEGORY_REMINDER);
        if (petStyle) {
            Bitmap pix = petBitmap(c, Pets.color(pet));
            b.setLargeIcon(pix != null ? pix : emojiBitmap(e, Pets.color(pet)));
        }

        NotificationManager nm = c.getSystemService(NotificationManager.class);
        try {
            nm.notify(type.hashCode(), b.build());
        } catch (SecurityException ignored) {
            // permission de notification refusée
        }
    }

    /** Le compagnon en pixel-art (exporté par l'interface), agrandi sans flou. */
    static Bitmap petBitmap(Context c, int color) {
        try {
            File f = new File(c.getFilesDir(), "pet.png");
            if (!f.exists()) return null;
            Bitmap src = BitmapFactory.decodeFile(f.getAbsolutePath());
            if (src == null) return null;
            int size = 192;
            int k = Math.max(1, (size - 16) / Math.max(src.getWidth(), src.getHeight()));
            int w = src.getWidth() * k, h = src.getHeight() * k;
            Bitmap out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
            Canvas cv = new Canvas(out);
            Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
            bg.setColor((color & 0x00FFFFFF) | 0x66000000);
            cv.drawCircle(size / 2f, size / 2f, size / 2f, bg);
            Paint p = new Paint();
            p.setFilterBitmap(false);
            p.setAntiAlias(false);
            int x = (size - w) / 2, y = (size - h) / 2;
            cv.drawBitmap(src, new Rect(0, 0, src.getWidth(), src.getHeight()), new Rect(x, y, x + w, y + h), p);
            return out;
        } catch (Exception ex) {
            return null;
        }
    }

    static Bitmap emojiBitmap(String emoji, int color) {
        int size = 192;
        Bitmap bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bmp);
        Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
        bg.setColor((color & 0x00FFFFFF) | 0x55000000);
        cv.drawCircle(size / 2f, size / 2f, size / 2f, bg);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setTextSize(size * 0.62f);
        p.setTextAlign(Paint.Align.CENTER);
        Paint.FontMetrics fm = p.getFontMetrics();
        cv.drawText(emoji, size / 2f, size / 2f - (fm.ascent + fm.descent) / 2f, p);
        return bmp;
    }
}
