import React, { useEffect, useRef, useState } from 'react';

type Props = {
  onCapture: (blob: Blob, width: number, height: number) => void;
  onCancel: () => void;
  /** Called when the camera cannot be opened, so the caller can fall back. */
  onUnavailable: (reason: string) => void;
};

/**
 * Full-screen live camera for the web build, using the browser's camera API.
 * Rear camera by default, with a flip button, a shutter, and cancel.
 */
export function WebCamera({ onCapture, onCancel, onUnavailable }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [ready, setReady] = useState(false);
  const [canFlip, setCanFlip] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    setReady(false);
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        onUnavailable('This browser cannot open the camera directly.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setReady(true);
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          setCanFlip(devices.filter((d) => d.kind === 'videoinput').length > 1);
        } catch {
          setCanFlip(false);
        }
      } catch (err) {
        const name = err instanceof Error ? err.name : '';
        onUnavailable(
          name === 'NotAllowedError'
            ? 'Camera access was not allowed. You can allow it in the browser settings for this site.'
            : 'The camera could not be opened.',
        );
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [facing, onUnavailable]);

  function snap() {
    const video = videoRef.current;
    if (!video || !ready || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (facing === 'user') {
      // Selfies are shown mirrored in the preview; save them the way others see you.
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => blob && onCapture(blob, canvas.width, canvas.height), 'image/jpeg', 0.9);
  }

  return (
    <div style={styles.root} role="dialog" aria-label="Camera">
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        style={{ ...styles.video, transform: facing === 'user' ? 'scaleX(-1)' : undefined }}
      />
      {!ready && <div style={styles.status}>Opening camera…</div>}
      <div style={styles.bar}>
        <button type="button" onClick={onCancel} style={styles.sideButton} aria-label="Cancel">
          Cancel
        </button>
        <button type="button" onClick={snap} disabled={!ready} style={{ ...styles.shutter, opacity: ready ? 1 : 0.4 }} aria-label="Take photo">
          <span style={styles.shutterInner} />
        </button>
        <button
          type="button"
          onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
          style={{ ...styles.sideButton, visibility: canFlip ? 'visible' : 'hidden' }}
          aria-label="Switch camera"
        >
          Flip
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: { position: 'fixed', inset: 0, background: '#000', zIndex: 1000, display: 'flex', flexDirection: 'column' },
  video: { flex: 1, width: '100%', height: '100%', objectFit: 'cover', background: '#000' },
  status: { position: 'absolute', top: '45%', width: '100%', textAlign: 'center', color: '#fff', fontFamily: 'system-ui, sans-serif' },
  bar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: '20px 24px calc(20px + env(safe-area-inset-bottom))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: 'linear-gradient(transparent, rgba(0,0,0,0.6))',
  },
  sideButton: {
    background: 'rgba(255,255,255,0.15)',
    color: '#fff',
    border: 0,
    borderRadius: 999,
    padding: '10px 16px',
    fontSize: 15,
    fontWeight: 600,
    fontFamily: 'system-ui, sans-serif',
    minWidth: 72,
  },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: '50%',
    background: 'transparent',
    border: '4px solid #fff',
    padding: 4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { display: 'block', width: '100%', height: '100%', borderRadius: '50%', background: '#fff' },
};
