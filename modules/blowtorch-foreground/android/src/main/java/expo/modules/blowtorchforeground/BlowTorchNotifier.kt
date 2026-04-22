package expo.modules.blowtorchforeground

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

object BlowTorchNotifier {
  const val CHANNEL_ID = "blowtorch_alerts"

  fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (nm.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Alertas del MUD",
      NotificationManager.IMPORTANCE_HIGH
    ).apply {
      description = "Notificaciones disparadas por triggers del juego (BONK, etc.)"
      enableVibration(true)
      setShowBadge(true)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    }
    nm.createNotificationChannel(channel)
  }

  fun notify(context: Context, id: Int, title: String, body: String) {
    ensureChannel(context)

    val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
    val pendingFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    } else {
      PendingIntent.FLAG_UPDATE_CURRENT
    }
    val contentPi = launchIntent?.let {
      PendingIntent.getActivity(context, 0, it, pendingFlags)
    }

    val builder = NotificationCompat.Builder(context, CHANNEL_ID)
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setSmallIcon(context.applicationInfo.icon)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setCategory(NotificationCompat.CATEGORY_MESSAGE)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setAutoCancel(true)
      .setDefaults(NotificationCompat.DEFAULT_ALL)

    if (contentPi != null) builder.setContentIntent(contentPi)

    try {
      NotificationManagerCompat.from(context).notify(id, builder.build())
    } catch (e: SecurityException) {
      // POST_NOTIFICATIONS not granted on Android 13+; silently ignore.
    }
  }
}
