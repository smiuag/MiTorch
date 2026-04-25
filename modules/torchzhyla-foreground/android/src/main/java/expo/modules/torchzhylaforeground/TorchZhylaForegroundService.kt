package expo.modules.torchzhylaforeground

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat

class TorchZhylaForegroundService : Service() {

  private var wakeLock: PowerManager.WakeLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val title = intent?.getStringExtra(EXTRA_TITLE) ?: "TorchZhyla conectado"
    val message = intent?.getStringExtra(EXTRA_MESSAGE) ?: "Manteniendo conexión"

    ensureChannel()
    val notification = buildNotification(title, message)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }

    acquireWakeLock()

    return START_STICKY
  }

  override fun onDestroy() {
    releaseWakeLock()
    super.onDestroy()
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (nm.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Conexión MUD en segundo plano",
      NotificationManager.IMPORTANCE_LOW
    ).apply {
      description = "Mantiene la conexión Telnet activa con la pantalla apagada"
      setShowBadge(false)
    }
    nm.createNotificationChannel(channel)
  }

  private fun buildNotification(title: String, message: String): Notification {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
    val pendingFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    } else {
      PendingIntent.FLAG_UPDATE_CURRENT
    }
    val contentPi = launchIntent?.let {
      PendingIntent.getActivity(this, 0, it, pendingFlags)
    }

    val iconResId = applicationInfo.icon

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(title)
      .setContentText(message)
      .setSmallIcon(iconResId)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .apply { if (contentPi != null) setContentIntent(contentPi) }
      .build()
  }

  private fun acquireWakeLock() {
    if (wakeLock?.isHeld == true) return
    val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
    val lock = pm.newWakeLock(
      PowerManager.PARTIAL_WAKE_LOCK,
      "TorchZhyla::TelnetWakeLock"
    )
    lock.setReferenceCounted(false)
    lock.acquire()
    wakeLock = lock
  }

  private fun releaseWakeLock() {
    try {
      wakeLock?.let { if (it.isHeld) it.release() }
    } catch (_: Exception) {
    }
    wakeLock = null
  }

  companion object {
    const val CHANNEL_ID = "torchzhyla_background"
    const val NOTIFICATION_ID = 1244

    const val EXTRA_TITLE = "title"
    const val EXTRA_MESSAGE = "message"
  }
}
