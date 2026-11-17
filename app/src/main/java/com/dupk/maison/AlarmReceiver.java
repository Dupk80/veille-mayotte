package com.dupk.maison;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class AlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        String type = i.getStringExtra("type");
        long time = i.getLongExtra("time", 0);
        // Ignore une alarme arrivée très en retard (ex. téléphone éteint) sauf la fin de journée.
        boolean stale = time > 0 && System.currentTimeMillis() - time > 20 * 60_000L;
        if (type != null && (!stale || Scheduler.END.equals(type))) {
            Notifier.show(c, type, i.getStringExtra("label"),
                    i.getLongExtra("shiftEnd", 0), i.getLongExtra("breakEnd", 0));
        }
        Scheduler.reschedule(c);
    }
}
