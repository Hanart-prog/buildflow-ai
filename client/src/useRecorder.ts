import { useRef, useState } from 'react';

export function useRecorder(onAudio: (audio: Blob) => void) {
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);

  const start = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks: Blob[] = [];
    const next = new MediaRecorder(stream);
    next.ondataavailable = (event) => chunks.push(event.data);
    next.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      setRecording(false);
      onAudio(new Blob(chunks, { type: next.mimeType }));
    };
    next.start();
    recorder.current = next;
    setRecording(true);
  };

  const stop = () => recorder.current?.stop();

  return { recording, start, stop };
}
