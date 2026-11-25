import React, { useEffect, useRef, useState } from 'react';
import { Camera, Keyboard, X } from 'lucide-react';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Se llama con cada código leído (o escrito a mano). */
  onDetected: (code: string) => void;
  title?: string;
  /** Si es true la cámara sigue abierta después de cada lectura (ventas de mostrador). */
  continuous?: boolean;
  /** Texto de ayuda o resultado de la última lectura. */
  statusMessage?: string;
}

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
};

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code', 'itf'];

/**
 * Lee códigos de barras o QR con la cámara del celular o la compu.
 * Usa el lector nativo del navegador cuando existe (Chrome en Android) y,
 * si no, la librería ZXing (iPhone / Safari y otros).
 */
export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onDetected,
  title = 'Escanear código',
  continuous = false,
  statusMessage,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState('');
  const [starting, setStarting] = useState(true);
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;
  const continuousRef = useRef(continuous);
  continuousRef.current = continuous;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let zxingControls: { stop: () => void } | null = null;
    let lastCode = '';
    let lastAt = 0;
    setError(null);
    setStarting(true);

    const handleCode = (raw: string) => {
      const code = (raw || '').trim();
      if (!code || stopped) return;
      const now = Date.now();
      if (code === lastCode && now - lastAt < 2000) return; // evita lecturas repetidas
      lastCode = code;
      lastAt = now;
      try {
        navigator.vibrate?.(60);
      } catch {
        // ignore
      }
      onDetectedRef.current(code);
      if (!continuousRef.current) onCloseRef.current();
    };

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Este navegador no permite usar la cámara. Probá con Chrome o escribí el código a mano.');
        setStarting(false);
        return;
      }
      try {
        const Detector = (window as unknown as {
          BarcodeDetector?: new (opts?: { formats: string[] }) => BarcodeDetectorLike;
        }).BarcodeDetector;
        if (Detector) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' } },
            audio: false,
          });
          if (stopped) return stream.getTracks().forEach((t) => t.stop());
          const video = videoRef.current;
          if (!video) return;
          video.srcObject = stream;
          await video.play();
          setStarting(false);
          const detector = new Detector({ formats: FORMATS });
          timer = window.setInterval(async () => {
            if (!videoRef.current || videoRef.current.readyState < 2) return;
            try {
              const found = await detector.detect(videoRef.current);
              if (found[0]?.rawValue) handleCode(found[0].rawValue);
            } catch {
              // frame sin código: se sigue intentando
            }
          }, 220);
        } else {
          const { BrowserMultiFormatReader } = await import('@zxing/browser');
          const reader = new BrowserMultiFormatReader();
          const video = videoRef.current;
          if (!video) return;
          zxingControls = await reader.decodeFromConstraints(
            { video: { facingMode: { ideal: 'environment' } }, audio: false },
            video,
            (result) => {
              if (result) handleCode(result.getText());
            }
          );
          if (stopped) zxingControls.stop();
          setStarting(false);
        }
      } catch (e) {
        const name = (e as { name?: string })?.name;
        setError(
          name === 'NotAllowedError'
            ? 'No diste permiso para usar la cámara. Habilitalo en el candado del navegador, o escribí el código a mano.'
            : name === 'NotFoundError'
            ? 'No se encontró una cámara en este dispositivo. Escribí el código a mano.'
            : 'No se pudo abrir la cámara. Escribí el código a mano.'
        );
        setStarting(false);
      }
    };
    void start();

    return () => {
      stopped = true;
      if (timer) window.clearInterval(timer);
      try {
        zxingControls?.stop();
      } catch {
        // ignore
      }
      stream?.getTracks().forEach((t) => t.stop());
      const v = videoRef.current;
      if (v) v.srcObject = null;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const submitManual = () => {
    const code = manual.trim();
    if (!code) return;
    onDetected(code);
    setManual('');
    if (!continuous) onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/80 flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label={title}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-4 py-3 bg-[#0B1933] text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Camera className="w-4 h-4" />
            {title}
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div className="relative rounded-xl overflow-hidden bg-slate-900 aspect-[4/3] flex items-center justify-center">
            <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
            {!error && (
              <div className="absolute inset-x-8 top-1/2 h-0.5 bg-rose-500/80 shadow-[0_0_10px_rgba(244,63,94,0.9)]" aria-hidden="true" />
            )}
            {starting && !error && <span className="absolute text-xs text-white/80">Abriendo cámara…</span>}
            {error && <p className="absolute inset-0 p-4 text-xs text-white/90 flex items-center text-center">{error}</p>}
          </div>
          <p className="text-[11px] text-slate-500">
            {statusMessage || 'Apuntá la cámara al código de barras o QR, con buena luz y sin movimiento.'}
          </p>
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <Keyboard className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                inputMode="numeric"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submitManual();
                  }
                }}
                autoComplete="off"
                placeholder="O escribí el código a mano"
                className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-900"
              />
            </div>
            <button type="button" onClick={submitManual} className="px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-bold cursor-pointer">
              Usar
            </button>
          </div>
          {continuous && (
            <button type="button" onClick={onClose} className="w-full py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
              Listo, cerrar cámara
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
