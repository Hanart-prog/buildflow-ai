import { useRef, useState, type RefObject } from 'react';

// Drives the --level custom property directly, so the orb can follow the
// voice every frame without re-rendering React.
function trackLevel(stream: MediaStream, target: RefObject<HTMLElement | null>) {
  const context = new AudioContext();
  const analyser = context.createAnalyser();
  analyser.fftSize = 256;
  context.createMediaStreamSource(stream).connect(analyser);
  const samples = new Uint8Array(analyser.frequencyBinCount);
  let frame = requestAnimationFrame(function tick() {
    analyser.getByteFrequencyData(samples);
    const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    target.current?.style.setProperty('--level', Math.min(average / 90, 1).toFixed(3));
    frame = requestAnimationFrame(tick);
  });
  return () => {
    cancelAnimationFrame(frame);
    target.current?.style.removeProperty('--level');
    context.close();
  };
}

export function useRecorder(onAudio: (audio: Blob) => void, levelTarget: RefObject<HTMLElement | null>) {
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const latestOnAudio = useRef(onAudio);
  latestOnAudio.current = onAudio;

  const start = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const stopTracking = trackLevel(stream, levelTarget);
    const chunks: Blob[] = [];
    const next = new MediaRecorder(stream);
    next.ondataavailable = (event) => chunks.push(event.data);
    next.onstop = () => {
      stopTracking();
      stream.getTracks().forEach((track) => track.stop());
      setRecording(false);
      latestOnAudio.current(new Blob(chunks, { type: next.mimeType }));
    };
    next.start();
    recorder.current = next;
    setRecording(true);
  };

  const stop = () => recorder.current?.stop();

  return { recording, start, stop };
}
