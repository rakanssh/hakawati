use serde::Serialize;

#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod desktop {
    use super::{SpeechRecordingAudio, SpeechRecordingLevel};
    use base64::{engine::general_purpose, Engine as _};
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
    use cpal::{FromSample, Sample, SampleFormat, SizedSample};
    use std::io::Cursor;
    use std::sync::{Arc, Mutex};

    #[derive(Default)]
    pub struct SpeechRecorderState {
        active: Mutex<Option<ActiveRecording>>,
    }

    struct ActiveRecording {
        stream: Option<cpal::Stream>,
        samples: SharedSamples,
        level: SharedLevel,
        sample_rate: u32,
        channels: u16,
    }

    type SharedSamples = Arc<Mutex<Vec<i16>>>;
    type SharedLevel = Arc<Mutex<f32>>;

    pub fn start_recording(state: &SpeechRecorderState) -> Result<(), String> {
        let mut active = state
            .active
            .lock()
            .map_err(|_| "Speech recorder state is unavailable.".to_string())?;

        if active.is_some() {
            return Err("Speech recording is already in progress.".to_string());
        }

        let host = cpal::default_host();
        let device = host
            .default_input_device()
            .ok_or_else(|| "No microphone input device was found.".to_string())?;
        let supported_config = device
            .default_input_config()
            .map_err(|error| format!("Could not open the microphone input device: {error}"))?;

        let sample_rate = supported_config.sample_rate();
        let channels = supported_config.channels();
        let stream_config = supported_config.clone().into();
        let samples = Arc::new(Mutex::new(Vec::new()));
        let level = Arc::new(Mutex::new(0.0));
        let stream = build_input_stream(
            &device,
            &stream_config,
            supported_config.sample_format(),
            Arc::clone(&samples),
            Arc::clone(&level),
        )?;

        stream
            .play()
            .map_err(|error| format!("Could not start microphone recording: {error}"))?;

        *active = Some(ActiveRecording {
            stream: Some(stream),
            samples,
            level,
            sample_rate,
            channels,
        });

        Ok(())
    }

    pub fn stop_recording(state: &SpeechRecorderState) -> Result<SpeechRecordingAudio, String> {
        let recording = state
            .active
            .lock()
            .map_err(|_| "Speech recorder state is unavailable.".to_string())?
            .take()
            .ok_or_else(|| "Speech recording is not in progress.".to_string())?;

        drop(recording.stream);

        let samples = recording
            .samples
            .lock()
            .map_err(|_| "Recorded audio data is unavailable.".to_string())?
            .clone();

        let wav_bytes = encode_wav(&samples, recording.sample_rate, recording.channels)?;

        Ok(SpeechRecordingAudio {
            mime_type: "audio/wav".to_string(),
            data_base64: general_purpose::STANDARD.encode(wav_bytes),
        })
    }

    pub fn get_recording_level(
        state: &SpeechRecorderState,
    ) -> Result<SpeechRecordingLevel, String> {
        let active = state
            .active
            .lock()
            .map_err(|_| "Speech recorder state is unavailable.".to_string())?;
        let recording = active
            .as_ref()
            .ok_or_else(|| "Speech recording is not in progress.".to_string())?;
        let level = *recording
            .level
            .lock()
            .map_err(|_| "Speech recorder level is unavailable.".to_string())?;

        Ok(SpeechRecordingLevel { level })
    }

    pub fn cancel_recording(state: &SpeechRecorderState) -> Result<(), String> {
        let recording = state
            .active
            .lock()
            .map_err(|_| "Speech recorder state is unavailable.".to_string())?
            .take()
            .ok_or_else(|| "Speech recording is not in progress.".to_string())?;

        drop(recording.stream);
        Ok(())
    }

    fn build_input_stream(
        device: &cpal::Device,
        config: &cpal::StreamConfig,
        sample_format: SampleFormat,
        samples: SharedSamples,
        level: SharedLevel,
    ) -> Result<cpal::Stream, String> {
        match sample_format {
            SampleFormat::I8 => build_input_stream_for_sample::<i8>(device, config, samples, level),
            SampleFormat::I16 => {
                build_input_stream_for_sample::<i16>(device, config, samples, level)
            }
            SampleFormat::I24 => {
                build_input_stream_for_sample::<cpal::I24>(device, config, samples, level)
            }
            SampleFormat::I32 => {
                build_input_stream_for_sample::<i32>(device, config, samples, level)
            }
            SampleFormat::I64 => {
                build_input_stream_for_sample::<i64>(device, config, samples, level)
            }
            SampleFormat::U8 => build_input_stream_for_sample::<u8>(device, config, samples, level),
            SampleFormat::U16 => {
                build_input_stream_for_sample::<u16>(device, config, samples, level)
            }
            SampleFormat::U24 => {
                build_input_stream_for_sample::<cpal::U24>(device, config, samples, level)
            }
            SampleFormat::U32 => {
                build_input_stream_for_sample::<u32>(device, config, samples, level)
            }
            SampleFormat::U64 => {
                build_input_stream_for_sample::<u64>(device, config, samples, level)
            }
            SampleFormat::F32 => {
                build_input_stream_for_sample::<f32>(device, config, samples, level)
            }
            SampleFormat::F64 => {
                build_input_stream_for_sample::<f64>(device, config, samples, level)
            }
            _ if sample_format.is_dsd() => {
                Err("DSD microphone input formats are not supported.".to_string())
            }
            _ => Err(format!(
                "Unsupported microphone input sample format: {sample_format}."
            )),
        }
    }

    fn build_input_stream_for_sample<T>(
        device: &cpal::Device,
        config: &cpal::StreamConfig,
        samples: SharedSamples,
        level: SharedLevel,
    ) -> Result<cpal::Stream, String>
    where
        T: Sample + SizedSample,
        i16: FromSample<T>,
    {
        device
            .build_input_stream(
                config,
                move |data: &[T], _| append_sample_data(data, &samples, &level),
                move |error| eprintln!("microphone stream error: {error}"),
                None,
            )
            .map_err(|error| format!("Could not create microphone input stream: {error}"))
    }

    pub(crate) fn append_sample_data<T>(input: &[T], samples: &SharedSamples, level: &SharedLevel)
    where
        T: Sample,
        i16: FromSample<T>,
    {
        let mut peak = 0.0_f32;
        if let Ok(mut samples) = samples.lock() {
            samples.reserve(input.len());
            for sample in input {
                let sample = sample.to_sample::<i16>();
                peak = peak.max(normalized_sample_level(sample));
                samples.push(sample);
            }
        }

        if let Ok(mut level) = level.lock() {
            *level = smooth_level(*level, peak);
        }
    }

    pub(crate) fn normalized_sample_level(sample: i16) -> f32 {
        (sample as f32 / i16::MAX as f32).abs().clamp(0.0, 1.0)
    }

    pub(crate) fn smooth_level(previous: f32, current: f32) -> f32 {
        let current = current.clamp(0.0, 1.0);
        let smoothing = if current > previous { 0.72 } else { 0.34 };
        (previous + (current - previous) * smoothing).clamp(0.0, 1.0)
    }

    pub(crate) fn encode_wav(
        samples: &[i16],
        sample_rate: u32,
        channels: u16,
    ) -> Result<Vec<u8>, String> {
        if samples.is_empty() {
            return Err("Recording did not capture any audio.".to_string());
        }
        if channels == 0 {
            return Err("Microphone reported zero audio channels.".to_string());
        }

        let spec = hound::WavSpec {
            channels,
            sample_rate,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut cursor = Cursor::new(Vec::new());
        {
            let mut writer = hound::WavWriter::new(&mut cursor, spec)
                .map_err(|error| format!("Could not create WAV recording: {error}"))?;
            for sample in samples {
                writer
                    .write_sample(*sample)
                    .map_err(|error| format!("Could not write WAV recording: {error}"))?;
            }
            writer
                .finalize()
                .map_err(|error| format!("Could not finalize WAV recording: {error}"))?;
        }

        Ok(cursor.into_inner())
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use std::io::Cursor;

        #[test]
        fn appends_i16_samples_without_conversion() {
            let samples = Arc::new(Mutex::new(Vec::new()));
            let level = Arc::new(Mutex::new(0.0));

            append_sample_data(&[-12_i16, 0, 42], &samples, &level);

            assert_eq!(*samples.lock().unwrap(), vec![-12, 0, 42]);
        }

        #[test]
        fn converts_f32_samples_to_i16() {
            let samples = Arc::new(Mutex::new(Vec::new()));
            let level = Arc::new(Mutex::new(0.0));

            append_sample_data(&[-1.0_f32, 0.0, 1.0], &samples, &level);

            assert_eq!(*samples.lock().unwrap(), vec![i16::MIN, 0, i16::MAX]);
        }

        #[test]
        fn converts_u16_samples_to_centered_i16() {
            let samples = Arc::new(Mutex::new(Vec::new()));
            let level = Arc::new(Mutex::new(0.0));

            append_sample_data(&[0_u16, 32768, u16::MAX], &samples, &level);

            assert_eq!(*samples.lock().unwrap(), vec![i16::MIN, 0, i16::MAX]);
        }

        #[test]
        fn updates_smoothed_level_from_sample_data() {
            let samples = Arc::new(Mutex::new(Vec::new()));
            let level = Arc::new(Mutex::new(0.0));

            append_sample_data(&[0_i16, i16::MAX], &samples, &level);

            let level = *level.lock().unwrap();
            assert!(level > 0.0);
            assert!(level <= 1.0);
        }

        #[test]
        fn normalizes_sample_level() {
            assert_eq!(normalized_sample_level(0), 0.0);
            assert_eq!(normalized_sample_level(i16::MAX), 1.0);
            assert_eq!(normalized_sample_level(i16::MIN), 1.0);
        }

        #[test]
        fn smooths_and_clamps_level() {
            let rising = smooth_level(0.0, 1.5);
            let falling = smooth_level(rising, 0.0);

            assert!(rising > 0.0);
            assert!(rising <= 1.0);
            assert!(falling < rising);
            assert!(falling >= 0.0);
        }

        #[test]
        fn level_rejects_when_not_recording() {
            let state = SpeechRecorderState::default();

            let error = get_recording_level(&state).unwrap_err();

            assert!(error.contains("not in progress"));
        }

        #[test]
        fn cancel_clears_active_recording_state() {
            let state = SpeechRecorderState {
                active: Mutex::new(Some(ActiveRecording {
                    stream: None,
                    samples: Arc::new(Mutex::new(Vec::new())),
                    level: Arc::new(Mutex::new(0.0)),
                    sample_rate: 16_000,
                    channels: 1,
                })),
            };

            cancel_recording(&state).unwrap();

            let error = stop_recording(&state).unwrap_err();
            assert!(error.contains("not in progress"));
        }

        #[test]
        fn encodes_non_empty_wav() {
            let wav = encode_wav(&[0, i16::MAX, i16::MIN, 0], 16_000, 1).unwrap();

            assert!(wav.len() > 44);

            let reader = hound::WavReader::new(Cursor::new(wav)).unwrap();
            assert_eq!(reader.spec().channels, 1);
            assert_eq!(reader.spec().sample_rate, 16_000);
        }

        #[test]
        fn rejects_empty_wav() {
            let error = encode_wav(&[], 16_000, 1).unwrap_err();

            assert!(error.contains("did not capture"));
        }
    }
}

#[cfg(any(target_os = "android", target_os = "ios"))]
mod mobile {
    use super::{SpeechRecordingAudio, SpeechRecordingLevel};

    #[derive(Default)]
    pub struct SpeechRecorderState;

    pub fn start_recording(_state: &SpeechRecorderState) -> Result<(), String> {
        Err("Speech recording is not supported on this platform yet.".to_string())
    }

    pub fn stop_recording(_state: &SpeechRecorderState) -> Result<SpeechRecordingAudio, String> {
        Err("Speech recording is not supported on this platform yet.".to_string())
    }

    pub fn get_recording_level(
        _state: &SpeechRecorderState,
    ) -> Result<SpeechRecordingLevel, String> {
        Err("Speech recording is not supported on this platform yet.".to_string())
    }

    pub fn cancel_recording(_state: &SpeechRecorderState) -> Result<(), String> {
        Err("Speech recording is not supported on this platform yet.".to_string())
    }
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
use desktop as platform;
#[cfg(any(target_os = "android", target_os = "ios"))]
use mobile as platform;

pub use platform::SpeechRecorderState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeechRecordingAudio {
    mime_type: String,
    data_base64: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeechRecordingLevel {
    level: f32,
}

#[tauri::command]
pub fn start_speech_recording(state: tauri::State<'_, SpeechRecorderState>) -> Result<(), String> {
    platform::start_recording(&state)
}

#[tauri::command]
pub fn stop_speech_recording(
    state: tauri::State<'_, SpeechRecorderState>,
) -> Result<SpeechRecordingAudio, String> {
    platform::stop_recording(&state)
}

#[tauri::command]
pub fn get_speech_recording_level(
    state: tauri::State<'_, SpeechRecorderState>,
) -> Result<SpeechRecordingLevel, String> {
    platform::get_recording_level(&state)
}

#[tauri::command]
pub fn cancel_speech_recording(state: tauri::State<'_, SpeechRecorderState>) -> Result<(), String> {
    platform::cancel_recording(&state)
}
