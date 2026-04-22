package expo.modules.blowtorchforeground

import android.content.Intent
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class BlowTorchForegroundModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("BlowTorchForeground")

    AsyncFunction("start") { title: String?, message: String? ->
      val ctx = appContext.reactContext
        ?: throw IllegalStateException("React context unavailable")
      val intent = Intent(ctx, BlowTorchForegroundService::class.java).apply {
        putExtra(BlowTorchForegroundService.EXTRA_TITLE, title ?: "BlowTorch conectado")
        putExtra(
          BlowTorchForegroundService.EXTRA_MESSAGE,
          message ?: "Manteniendo conexión"
        )
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        ctx.startForegroundService(intent)
      } else {
        ctx.startService(intent)
      }
      true
    }

    AsyncFunction("stop") {
      val ctx = appContext.reactContext
        ?: throw IllegalStateException("React context unavailable")
      ctx.stopService(Intent(ctx, BlowTorchForegroundService::class.java))
      true
    }

    AsyncFunction("notify") { id: Int, title: String, body: String ->
      val ctx = appContext.reactContext
        ?: throw IllegalStateException("React context unavailable")
      BlowTorchNotifier.notify(ctx, id, title, body)
      true
    }
  }
}
