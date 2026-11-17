package com.dupk.maison;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;

/** Calcule les journées de travail et programme la prochaine notification. */
final class Scheduler {
    private Scheduler() {}

    static final String PREFS = "maison";
    static final String KEY_SETTINGS = "settings";

    static final String START = "start", BREAK_START = "breakStart", BREAK_END = "breakEnd",
            BEFORE_END = "beforeEnd", END = "end", PERIODIC = "periodic";

    static final class Break {
        long start, end;
        String label;
    }

    static final class Shift {
        long start, end;
        List<Break> breaks = new ArrayList<>();
    }

    static final class Event {
        long time;
        String type;
        String label = "";
        long shiftEnd, breakEnd;
    }

    static JSONObject settings(Context c) {
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String raw = p.getString(KEY_SETTINGS, "");
        try {
            return raw.isEmpty() ? null : new JSONObject(raw);
        } catch (Exception e) {
            return null;
        }
    }

    static int hm(String s) {
        try {
            String[] p = s.split(":");
            return Integer.parseInt(p[0].trim()) * 60 + Integer.parseInt(p[1].trim());
        } catch (Exception e) {
            return 0;
        }
    }

    private static long at(Calendar day, int minutes) {
        Calendar c = (Calendar) day.clone();
        c.set(Calendar.HOUR_OF_DAY, 0);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        c.add(Calendar.MINUTE, minutes);
        return c.getTimeInMillis();
    }

    /** Journée qui commence le jour {@code day}, ou null si jour de repos. */
    static Shift shiftFor(JSONObject s, Calendar day) {
        JSONArray days = s.optJSONArray("days");
        int idx = day.get(Calendar.DAY_OF_WEEK) - 1; // 0 = dimanche
        if (days == null || !days.optBoolean(idx, false)) return null;
        Shift sh = new Shift();
        String start = s.optString("start", "08:00"), end = s.optString("end", "17:00");
        JSONArray week = s.optJSONArray("week");
        if (s.optBoolean("perDay", false) && week != null && week.optJSONObject(idx) != null) {
            JSONObject w = week.optJSONObject(idx);
            start = w.optString("start", start);
            end = w.optString("end", end);
        }
        sh.start = at(day, hm(start));
        sh.end = at(day, hm(end));
        if (sh.end <= sh.start) sh.end += 24L * 3600_000L; // travail de nuit
        JSONArray br = s.optJSONArray("breaks");
        if (br != null) {
            for (int i = 0; i < br.length(); i++) {
                JSONObject b = br.optJSONObject(i);
                if (b == null) continue;
                Break x = new Break();
                x.label = b.optString("label", "Pause");
                x.start = at(day, hm(b.optString("start", "12:00")));
                if (x.start < sh.start) x.start += 24L * 3600_000L;
                x.end = Math.min(sh.end, x.start + Math.max(1, b.optInt("dur", 15)) * 60_000L);
                if (x.start >= sh.start && x.start < sh.end) sh.breaks.add(x);
            }
        }
        sh.breaks.sort((a, b) -> Long.compare(a.start, b.start));
        return sh;
    }

    static List<Event> events(JSONObject s, long now) {
        List<Event> out = new ArrayList<>();
        JSONObject n = s.optJSONObject("notif");
        if (n == null) n = new JSONObject();
        int beforeMin = n.optInt("beforeMin", 15);
        int periodic = n.optInt("periodic", 0);

        for (int d = -1; d <= 8; d++) {
            Calendar day = Calendar.getInstance();
            day.setTimeInMillis(now);
            day.add(Calendar.DAY_OF_YEAR, d);
            Shift sh = shiftFor(s, day);
            if (sh == null || sh.end < now) continue;

            List<Event> fixed = new ArrayList<>();
            if (n.optBoolean("start", true)) fixed.add(ev(sh.start, START, "", sh, 0));
            for (Break b : sh.breaks) {
                if (n.optBoolean("breakStart", true)) fixed.add(ev(b.start, BREAK_START, b.label, sh, b.end));
                if (n.optBoolean("breakEnd", true) && b.end < sh.end) fixed.add(ev(b.end, BREAK_END, b.label, sh, b.end));
            }
            if (n.optBoolean("beforeEnd", true) && beforeMin > 0) {
                long t = sh.end - beforeMin * 60_000L;
                if (t > sh.start) {
                    Event e = ev(t, BEFORE_END, String.valueOf(beforeMin), sh, 0);
                    fixed.add(e);
                }
            }
            if (n.optBoolean("end", true)) fixed.add(ev(sh.end, END, "", sh, 0));
            out.addAll(fixed);

            if (periodic > 0) {
                for (long t = sh.start + periodic * 60_000L; t < sh.end; t += periodic * 60_000L) {
                    boolean skip = false;
                    for (Break b : sh.breaks) if (t >= b.start && t < b.end) skip = true;
                    for (Event f : fixed) if (Math.abs(f.time - t) < 10 * 60_000L) skip = true;
                    if (!skip) out.add(ev(t, PERIODIC, "", sh, 0));
                }
            }
        }
        out.sort((a, b) -> Long.compare(a.time, b.time));
        return out;
    }

    private static Event ev(long t, String type, String label, Shift sh, long breakEnd) {
        Event e = new Event();
        e.time = t;
        e.type = type;
        e.label = label;
        e.shiftEnd = sh.end;
        e.breakEnd = breakEnd;
        return e;
    }

    static PendingIntent pending(Context c, Event e) {
        Intent i = new Intent(c, AlarmReceiver.class);
        if (e != null) {
            i.putExtra("type", e.type);
            i.putExtra("label", e.label);
            i.putExtra("shiftEnd", e.shiftEnd);
            i.putExtra("breakEnd", e.breakEnd);
            i.putExtra("time", e.time);
        }
        return PendingIntent.getBroadcast(c, 4242, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static boolean canExact(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        return Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms();
    }

    /** Annule l'alarme courante et programme le prochain évènement. */
    static synchronized long reschedule(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        am.cancel(pending(c, null));
        JSONObject s = settings(c);
        long next = 0;
        if (s != null && s.optJSONObject("notif") != null
                && !"off".equals(s.optJSONObject("notif").optString("style", "pet"))) {
            long now = System.currentTimeMillis();
            for (Event e : events(s, now)) {
                if (e.time > now + 1000) {
                    PendingIntent pi = pending(c, e);
                    if (canExact(c)) {
                        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, e.time, pi);
                    } else {
                        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, e.time, pi);
                    }
                    next = e.time;
                    break;
                }
            }
        }
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putLong("nextAlarm", next).apply();
        return next;
    }
}
