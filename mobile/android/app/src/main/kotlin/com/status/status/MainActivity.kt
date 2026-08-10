package com.status.status

import android.content.Context
import android.os.Handler
import android.os.Looper
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

/**
 * Phase 40 — Ambient cognitive fabric bridge (Android).
 * Soft continuous context ticks without wake-word UX (privacy: processed locally first).
 */
class MainActivity : FlutterActivity() {
    private val channelName = "com.status/ambient"
    private var ambientHandler: Handler? = null
    private var ambientRunnable: Runnable? = null
    private var channel: MethodChannel? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        channel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, channelName)
        channel?.setMethodCallHandler { call, result ->
            when (call.method) {
                "startAmbient" -> {
                    startAmbientLoop()
                    result.success(true)
                }
                "stopAmbient" -> {
                    stopAmbientLoop()
                    result.success(true)
                }
                else -> result.notImplemented()
            }
        }
    }

    private fun startAmbientLoop() {
        stopAmbientLoop()
        val handler = Handler(Looper.getMainLooper())
        ambientHandler = handler
        ambientRunnable = object : Runnable {
            override fun run() {
                channel?.invokeMethod(
                    "onAmbientTranscript",
                    mapOf(
                        "text" to "ambient context pulse",
                        "platform" to "android",
                        "wakeWordRequired" to false
                    )
                )
                handler.postDelayed(this, 15_000L)
            }
        }
        handler.post(ambientRunnable!!)
    }

    private fun stopAmbientLoop() {
        ambientRunnable?.let { ambientHandler?.removeCallbacks(it) }
        ambientRunnable = null
        ambientHandler = null
    }

    override fun onDestroy() {
        stopAmbientLoop()
        super.onDestroy()
    }
}
