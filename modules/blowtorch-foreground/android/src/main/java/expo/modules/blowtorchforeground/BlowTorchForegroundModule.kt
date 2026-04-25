package expo.modules.blowtorchforeground

import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class BlowTorchForegroundModule : Module() {
  private val walkHandler = Handler(Looper.getMainLooper())
  private var walkCommands: List<String> = emptyList()
  private var walkIndex: Int = 0
  private var walkDelayMs: Long = 1100
  private var walkRunnable: Runnable? = null

  override fun definition() = ModuleDefinition {
    Name("BlowTorchForeground")

    Events("onWalkStep", "onWalkDone")

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

    AsyncFunction("startWalk") { commands: List<String>, stepDelayMs: Int ->
      cancelWalkInternal()
      walkCommands = commands
      walkIndex = 0
      walkDelayMs = stepDelayMs.toLong()
      scheduleNextWalkStep(0L)
      true
    }

    AsyncFunction("cancelWalk") {
      cancelWalkInternal()
      true
    }
  }

  private fun scheduleNextWalkStep(delayMs: Long) {
    val runnable = Runnable {
      val idx = walkIndex
      val cmds = walkCommands
      if (idx >= cmds.size) {
        sendEvent("onWalkDone", mapOf("total" to cmds.size))
        walkRunnable = null
        walkCommands = emptyList()
        walkIndex = 0
        return@Runnable
      }
      val cmd = cmds[idx]
      sendEvent(
        "onWalkStep",
        mapOf(
          "index" to idx,
          "total" to cmds.size,
          "command" to cmd
        )
      )
      walkIndex = idx + 1
      scheduleNextWalkStep(walkDelayMs)
    }
    walkRunnable = runnable
    walkHandler.postDelayed(runnable, delayMs)
  }

  private fun cancelWalkInternal() {
    walkRunnable?.let { walkHandler.removeCallbacks(it) }
    walkRunnable = null
    walkCommands = emptyList()
    walkIndex = 0
  }
}
