import AVFoundation
import Tauri
import UIKit

private let notRecording = "Speech recording is not in progress."
private let interruptedCode = "recordingInterrupted"

// Records speech for the play screen's mic button, called from speech_recorder.rs.
// Like the desktop and Android recorders it returns 16-bit PCM in a WAV file and
// reports a smoothed peak level for the waveform. Commands arrive on the thread that
// called them from Rust and the notifications that end a recording on any thread, so
// all of them run on the main thread.
class SpeechRecorderPlugin: Plugin {
  private var recorder: AVAudioRecorder?
  private var level: Float = 0
  private var interrupted = false

  override init() {
    super.init()
    let center = NotificationCenter.default
    // iOS suspends apps it moves to the background, and a call or another app can
    // take the microphone. End the recording then; the next command says why.
    center.addObserver(
      self, selector: #selector(interrupt), name: UIApplication.didEnterBackgroundNotification,
      object: nil)
    center.addObserver(
      self, selector: #selector(interrupt), name: AVAudioSession.interruptionNotification,
      object: nil)
  }

  @objc public func startRecording(_ invoke: Invoke) {
    DispatchQueue.main.async { self.requestAndBegin(invoke) }
  }

  @objc public func stopRecording(_ invoke: Invoke) {
    DispatchQueue.main.async { self.stop(invoke) }
  }

  @objc public func getRecordingLevel(_ invoke: Invoke) {
    DispatchQueue.main.async { self.reportLevel(invoke) }
  }

  @objc public func cancelRecording(_ invoke: Invoke) {
    DispatchQueue.main.async { self.cancel(invoke) }
  }

  private func requestAndBegin(_ invoke: Invoke) {
    interrupted = false
    if recorder != nil {
      invoke.reject("Speech recording is already in progress.")
      return
    }
    let session = AVAudioSession.sharedInstance()
    switch session.recordPermission {
    case .granted:
      begin(invoke)
    case .denied:
      // iOS asks only once, so after a refusal only Settings can allow it.
      invoke.reject(
        "Microphone access is turned off for Hakawati. Allow it in your device settings to record speech.",
        code: "microphonePermissionBlocked")
    default:
      session.requestRecordPermission { granted in
        DispatchQueue.main.async {
          if granted {
            self.begin(invoke)
          } else {
            invoke.reject(
              "Hakawati needs microphone access to record speech.",
              code: "microphonePermissionDenied")
          }
        }
      }
    }
  }

  private func stop(_ invoke: Invoke) {
    guard let active = takeRecorder() else { return rejectNotRecording(invoke) }
    active.stop()
    let data = try? Data(contentsOf: active.url)
    finish(active)
    // A WAV header alone is 44 bytes.
    guard let data = data, data.count > 44 else {
      invoke.reject("Recording did not capture any audio.")
      return
    }
    invoke.resolve(["mimeType": "audio/wav", "dataBase64": data.base64EncodedString()])
  }

  private func reportLevel(_ invoke: Invoke) {
    guard let active = recorder else { return rejectNotRecording(invoke) }
    active.updateMeters()
    let peak = pow(10, active.peakPower(forChannel: 0) / 20)
    level = smoothLevel(level, min(max(peak, 0), 1))
    invoke.resolve(["level": level])
  }

  private func cancel(_ invoke: Invoke) {
    guard let active = takeRecorder() else { return rejectNotRecording(invoke) }
    active.stop()
    finish(active)
    invoke.resolve()
  }

  @objc private func interrupt() {
    DispatchQueue.main.async { self.endInterrupted() }
  }

  private func endInterrupted() {
    guard let active = takeRecorder() else { return }
    interrupted = true
    active.stop()
    finish(active)
  }

  private func begin(_ invoke: Invoke) {
    if recorder != nil {
      invoke.reject("Speech recording is already in progress.")
      return
    }
    // 16 kHz mono is plenty for speech and keeps uploads small.
    let url = FileManager.default.temporaryDirectory
      .appendingPathComponent("hakawati-speech-\(UUID().uuidString).wav")
    let settings: [String: Any] = [
      AVFormatIDKey: kAudioFormatLinearPCM,
      AVSampleRateKey: 16_000,
      AVNumberOfChannelsKey: 1,
      AVLinearPCMBitDepthKey: 16,
      AVLinearPCMIsFloatKey: false,
      AVLinearPCMIsBigEndianKey: false,
    ]
    let session = AVAudioSession.sharedInstance()
    do {
      try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
      try session.setActive(true)
      let active = try AVAudioRecorder(url: url, settings: settings)
      active.isMeteringEnabled = true
      guard active.record() else {
        finish(active)
        invoke.reject(
          "Could not start microphone recording. Another app may be using the microphone.")
        return
      }
      level = 0
      recorder = active
      invoke.resolve()
    } catch {
      try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
      invoke.reject("Could not start microphone recording: \(error.localizedDescription)")
    }
  }

  private func takeRecorder() -> AVAudioRecorder? {
    let active = recorder
    recorder = nil
    return active
  }

  private func finish(_ active: AVAudioRecorder) {
    try? FileManager.default.removeItem(at: active.url)
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }

  private func rejectNotRecording(_ invoke: Invoke) {
    let wasInterrupted = interrupted
    interrupted = false
    if wasInterrupted {
      invoke.reject("Recording stopped because you left Hakawati.", code: interruptedCode)
    } else {
      invoke.reject(notRecording)
    }
  }

  // Same smoothing as the desktop recorder so the waveform moves the same way.
  private func smoothLevel(_ previous: Float, _ current: Float) -> Float {
    let smoothing: Float = current > previous ? 0.72 : 0.34
    return min(max(previous + (current - previous) * smoothing, 0), 1)
  }
}

@_cdecl("init_plugin_speech_recorder")
func initSpeechRecorderPlugin() -> Plugin {
  return SpeechRecorderPlugin()
}
