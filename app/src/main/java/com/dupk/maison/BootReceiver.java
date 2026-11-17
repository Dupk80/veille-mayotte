package com.dupk.maison;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Reprogramme les rappels après redémarrage, mise à jour ou changement d'heure. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        Scheduler.reschedule(c);
    }
}
