package dev.hakawati.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Base64
import androidx.appcompat.app.AppCompatActivity
import app.tauri.PermissionState
import app.tauri.annotation.Command
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.abs

private const val MICROPHONE = "microphone"
private const val NOT_RECORDING = "Speech recording is not in progress."

// Records speech for the play screen's mic button, called from speech_recorder.rs.
// Like the desktop recorder it returns 16-bit PCM in a WAV file and reports a
// smoothed peak level for the waveform.
@TauriPlugin(
  permissions = [Permission(strings = [Manifest.permission.RECORD_AUDIO], alias = MICROPHONE)]
)
class SpeechRecorderPlugin(activity: Activity) : Plugin(activity) {
  private var recording: Recording? = null

  @Command
  fun startRecording(invoke: Invoke) {
    if (recording != null) {
      invoke.reject("Speech recording is already in progress.")
      return
    }
    if (getPermissionState(MICROPHONE) == PermissionState.GRANTED) {
      begin(invoke)
    } else {
      requestPermissionForAlias(MICROPHONE, invoke, "microphonePermissionCallback")
    }
  }

  @PermissionCallback
  private fun microphonePermissionCallback(invoke: Invoke) {
    when (getPermissionState(MICROPHONE)) {
      PermissionState.GRANTED -> begin(invoke)
      // Android stops asking after the second refusal, so only Settings can allow it.
      PermissionState.DENIED -> invoke.reject(
        "Microphone access is turned off for Hakawati. Allow it in your device settings to record speech.",
        "microphonePermissionBlocked"
      )
      else -> invoke.reject(
        "Hakawati needs microphone access to record speech.",
        "microphonePermissionDenied"
      )
    }
  }

  @Command
  fun stopRecording(invoke: Invoke) {
    val active = recording ?: return invoke.reject(NOT_RECORDING)
    recording = null
    val pcm = active.finish()
    if (pcm.isEmpty()) {
      invoke.reject("Recording did not capture any audio.")
      return
    }
    val wav = encodeWav(pcm, active.sampleRate)
    invoke.resolve(JSObject().apply {
      put("mimeType", "audio/wav")
      put("dataBase64", Base64.encodeToString(wav, Base64.NO_WRAP))
    })
  }

  @Command
  fun getRecordingLevel(invoke: Invoke) {
    val active = recording ?: return invoke.reject(NOT_RECORDING)
    invoke.resolve(JSObject().apply { put("level", active.level.toDouble()) })
  }

  @Command
  fun cancelRecording(invoke: Invoke) {
    val active = recording ?: return invoke.reject(NOT_RECORDING)
    recording = null
    active.finish()
    invoke.resolve()
  }

  override fun onDestroy(activity: AppCompatActivity) {
    recording?.finish()
    recording = null
  }

  private fun begin(invoke: Invoke) {
    if (recording != null) {
      invoke.reject("Speech recording is already in progress.")
      return
    }
    val record = openAudioRecord()
      ?: return invoke.reject("Could not open the microphone input device.")
    try {
      record.startRecording()
    } catch (error: IllegalStateException) {
      record.release()
      invoke.reject("Could not start microphone recording: ${error.message}")
      return
    }
    if (record.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
      record.release()
      invoke.reject("Could not start microphone recording. Another app may be using the microphone.")
      return
    }
    recording = Recording(record).also { it.start() }
    invoke.resolve()
  }

  // 16 kHz mono is plenty for speech and keeps uploads small; 44.1 kHz is the
  // only rate every device has to support.
  @SuppressLint("MissingPermission")
  private fun openAudioRecord(): AudioRecord? {
    for (sampleRate in intArrayOf(16_000, 44_100)) {
      val minBufferSize = AudioRecord.getMinBufferSize(
        sampleRate,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT
      )
      if (minBufferSize <= 0) continue
      val record = try {
        AudioRecord(
          MediaRecorder.AudioSource.VOICE_RECOGNITION,
          sampleRate,
          AudioFormat.CHANNEL_IN_MONO,
          AudioFormat.ENCODING_PCM_16BIT,
          maxOf(minBufferSize, sampleRate / 2)
        )
      } catch (error: IllegalArgumentException) {
        continue
      }
      if (record.state == AudioRecord.STATE_INITIALIZED) return record
      record.release()
    }
    return null
  }

  private class Recording(private val record: AudioRecord) {
    val sampleRate = record.sampleRate
    private val pcm = ByteArrayOutputStream()
    private val reader = Thread({ readSamples() }, "hakawati-speech-recorder")

    @Volatile private var running = true

    @Volatile var level = 0f
      private set

    fun start() = reader.start()

    // Each read waits for 20 ms of audio, so finishing waits about that long.
    fun finish(): ByteArray {
      running = false
      reader.join()
      record.stop()
      record.release()
      return pcm.toByteArray()
    }

    private fun readSamples() {
      val samples = ShortArray(sampleRate / 50)
      val bytes = ByteBuffer.allocate(samples.size * 2).order(ByteOrder.LITTLE_ENDIAN)
      while (running) {
        val count = record.read(samples, 0, samples.size)
        if (count < 0) break
        var peak = 0f
        bytes.clear()
        for (index in 0 until count) {
          val sample = samples[index]
          peak = maxOf(peak, abs(sample / Short.MAX_VALUE.toFloat()).coerceAtMost(1f))
          bytes.putShort(sample)
        }
        pcm.write(bytes.array(), 0, count * 2)
        level = smoothLevel(level, peak)
      }
    }

    // Same smoothing as the desktop recorder so the waveform moves the same way.
    private fun smoothLevel(previous: Float, current: Float): Float {
      val smoothing = if (current > previous) 0.72f else 0.34f
      return (previous + (current - previous) * smoothing).coerceIn(0f, 1f)
    }
  }
}

private fun encodeWav(pcm: ByteArray, sampleRate: Int): ByteArray {
  val channels = 1
  val bytesPerSample = 2
  val header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN).apply {
    put("RIFF".toByteArray(Charsets.US_ASCII))
    putInt(36 + pcm.size)
    put("WAVE".toByteArray(Charsets.US_ASCII))
    put("fmt ".toByteArray(Charsets.US_ASCII))
    putInt(16)
    putShort(1) // PCM
    putShort(channels.toShort())
    putInt(sampleRate)
    putInt(sampleRate * channels * bytesPerSample)
    putShort((channels * bytesPerSample).toShort())
    putShort((bytesPerSample * 8).toShort())
    put("data".toByteArray(Charsets.US_ASCII))
    putInt(pcm.size)
  }
  return header.array() + pcm
}
