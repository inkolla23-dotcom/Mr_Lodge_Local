import React, { useRef, useState, useEffect } from 'react';
import { Camera, RefreshCw, X, Check, AlertCircle } from 'lucide-react';

interface WebcamCaptureProps {
  onCapture: (base64Image: string) => void;
  label: string;
}

export default function WebcamCapture({ onCapture, label }: WebcamCaptureProps) {
  // We keep ONE persistent <video> element in the DOM at all times (hidden when idle).
  // This eliminates the mount/unmount race condition that caused the black screen —
  // the element always exists, so srcObject can be assigned without timing issues.
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [mode, setMode] = useState<'idle' | 'live' | 'captured'>('idle');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    // Clear srcObject so video element doesn't hold the stream
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const startCamera = async () => {
    if (isStarting) return;
    setErrorMsg(null);
    setIsStarting(true);
    stopStream();

    try {
      let stream: MediaStream | null = null;
      const attempts: MediaStreamConstraints[] = [
        { video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
        { video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: false },
        { video: true, audio: false },
      ];
      for (const c of attempts) {
        try { stream = await navigator.mediaDevices.getUserMedia(c); break; }
        catch { /* try next */ }
      }
      if (!stream) throw Object.assign(new Error('No camera'), { name: 'NotFoundError' });

      streamRef.current = stream;

      // The video element is ALWAYS mounted — set srcObject directly, no timing issue
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try { await videoRef.current.play(); }
        catch { /* play() blocked — onLoadedMetadata will call play() */ }
      }

      setMode('live');
    } catch (err: any) {
      const n = err?.name || '';
      if (n === 'NotAllowedError' || n === 'PermissionDeniedError') {
        setErrorMsg('Camera permission denied. Click the camera icon in your browser address bar and allow access.');
      } else if (n === 'NotFoundError' || n === 'DevicesNotFoundError') {
        setErrorMsg('No camera found on this device.');
      } else if (n === 'NotReadableError' || n === 'TrackStartError') {
        setErrorMsg('Camera is in use by another app. Close it and try again.');
      } else {
        setErrorMsg(`Camera error: ${err?.message || 'Unknown'}. Check browser permissions.`);
      }
      console.error('Webcam error:', n, err);
    } finally {
      setIsStarting(false);
    }
  };

  const stopCamera = () => {
    stopStream();
    setMode('idle');
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video) return;
    const w = video.videoWidth  || 640;
    const h = video.videoHeight || 480;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    stopStream();
    setPreviewUrl(dataUrl);
    setMode('captured');
    onCapture(dataUrl);
  };

  const retake = () => {
    setPreviewUrl(null);
    onCapture('');
    setMode('idle');
    startCamera();
  };

  const clear = () => {
    setPreviewUrl(null);
    onCapture('');
    stopCamera();
  };

  // Cleanup on unmount
  useEffect(() => () => stopStream(), []);

  return (
    <div className="flex flex-col border border-dashed border-gray-300 rounded-lg p-3 bg-gray-50/50 w-full items-center justify-center gap-2"
      style={{ minHeight: '130px' }}>

      {/* ── Persistent video element — always in DOM, visible only when live ── */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        onLoadedMetadata={() => {
          // Guaranteed play once stream metadata arrives
          videoRef.current?.play().catch(() => {});
        }}
        className={`w-full rounded-md border bg-black object-cover ${mode === 'live' ? 'block' : 'hidden'}`}
        style={{ minHeight: mode === 'live' ? '160px' : undefined, maxHeight: '220px' }}
      />

      {/* ── Captured image preview ────────────────────────────────────────── */}
      {mode === 'captured' && previewUrl && (
        <>
          <img src={previewUrl} alt="Captured" className="w-full max-h-36 object-cover rounded-md border shadow" />
          <div className="flex gap-2 w-full">
            <button type="button" onClick={retake}
              className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-lodge-accent text-lodge-brown text-xs font-semibold rounded-md hover:bg-lodge-hover transition">
              <RefreshCw className="w-3 h-3" /> Retake
            </button>
            <button type="button" onClick={clear}
              className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-md hover:bg-red-700 transition">
              <X className="w-3 h-3" /> Clear
            </button>
          </div>
        </>
      )}

      {/* ── Live controls (shown when camera is streaming) ────────────────── */}
      {mode === 'live' && (
        <div className="flex gap-2 w-full">
          <button type="button" onClick={capturePhoto}
            className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-md hover:bg-emerald-700 transition">
            <Check className="w-3 h-3" /> Capture Snapshot
          </button>
          <button type="button" onClick={stopCamera}
            className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-gray-600 text-white text-xs font-semibold rounded-md hover:bg-gray-700 transition">
            <X className="w-3 h-3" /> Cancel
          </button>
        </div>
      )}

      {/* ── Idle: show label + open camera button ─────────────────────────── */}
      {mode === 'idle' && (
        <>
          <p className="text-xs text-gray-500 font-medium text-center leading-snug">{label}</p>
          <button type="button" onClick={startCamera} disabled={isStarting}
            className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 rounded-md text-xs font-semibold bg-white text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-60 transition">
            <Camera className="w-3.5 h-3.5" />
            {isStarting ? 'Starting camera…' : 'Open Webcam'}
          </button>
          {errorMsg && (
            <div className="flex items-start gap-1.5 bg-red-50 border border-red-100 rounded-lg p-2 w-full">
              <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-[10px] text-red-600 font-semibold leading-snug">{errorMsg}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
