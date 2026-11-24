import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface QrCodeSvgProps {
  value: string;
  size?: number;
  className?: string;
}

export const QrCodeSvg: React.FC<QrCodeSvgProps> = ({ value, size = 140, className = '' }) => {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    let active = true;
    const clean = (value || '').trim();
    if (!clean) {
      setDataUrl('');
      return;
    }
    QRCode.toDataURL(clean, {
      margin: 1,
      width: size * 2,
      color: {
        dark: '#0B1933',
        light: '#FFFFFF',
      },
    })
      .then((url) => {
        if (active) setDataUrl(url);
      })
      .catch(() => {
        if (active) setDataUrl('');
      });

    return () => {
      active = false;
    };
  }, [value, size]);

  if (!dataUrl) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center text-[10px] font-mono text-slate-400 ${className}`}
      >
        QR
      </div>
    );
  }

  return (
    <img
      src={dataUrl}
      alt={`QR ${value}`}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={`rounded-lg border border-slate-200 bg-white p-1 ${className}`}
    />
  );
};
