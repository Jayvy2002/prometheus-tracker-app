import { useCallback, useEffect, useRef, useState } from 'react';

export type VoiceRecorderState = 'idle' | 'recording' | 'unsupported' | 'denied';

/** Minimal voice note: tap to record, tap to stop (max 5 min). */
export function useVoiceRecorder(onDone: (file: File, durationS: number) => void) {
  const supported = typeof window !== 'undefined'
    && typeof window.MediaRecorder !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia;
  const [state, setState] = useState<VoiceRecorderState>(supported ? 'idle' : 'unsupported');
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const started = useRef(0);
  const timer = useRef<number | null>(null);
  const done = useRef(onDone);
  done.current = onDone;

  const clear = () => {
    if (timer.current != null) window.clearInterval(timer.current);
    timer.current = null;
  };

  const stop = useCallback(() => {
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }, []);

  const start = useCallback(async () => {
    if (!supported || recorder.current?.state === 'recording') return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setState('denied');
      return;
    }
    const media = new MediaRecorder(stream);
    chunks.current = [];
    media.ondataavailable = event => { if (event.data.size) chunks.current.push(event.data); };
    media.onstop = () => {
      clear();
      stream.getTracks().forEach(track => track.stop());
      const duration = (Date.now() - started.current) / 1000;
      const type = (media.mimeType || 'audio/webm').split(';')[0];
      const blob = new Blob(chunks.current, { type });
      setState('idle');
      setSeconds(0);
      if (blob.size > 0) {
        const extension = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
        done.current(new File([blob], `vocal-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${extension}`, { type }), duration);
      }
    };
    recorder.current = media;
    started.current = Date.now();
    media.start();
    setState('recording');
    timer.current = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - started.current) / 1000);
      setSeconds(elapsed);
      if (elapsed >= 300) media.stop();
    }, 500);
  }, [supported]);

  useEffect(() => () => {
    clear();
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }, []);

  return { state, seconds, start, stop };
}
