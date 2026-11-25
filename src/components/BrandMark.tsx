import React from 'react';
import { Truck, Package, Store, Building2, ShoppingBag, ShieldCheck } from 'lucide-react';

interface BrandMarkProps {
  logoUrl?: string;
  icon?: string;
  name?: string;
  size?: 'sm' | 'md' | 'lg';
  // Sin logo subido: muestra la inicial del comercio en lugar del emblema genérico
  initialFallback?: boolean;
}

/**
 * Emblema corporativo Azul Marino (#0B1933) y Plata (#CBD5E1 / #E2E8F0).
 * Muestra el logo personalizado de la distribuidora si fue subido, o el emblema metálico por defecto.
 */
export const BrandMark: React.FC<BrandMarkProps> = ({
  logoUrl,
  icon = 'shield',
  name = 'Distribuidora',
  size = 'md',
  initialFallback = false,
}) => {
  const sizeClasses =
    size === 'sm'
      ? 'w-9 h-9 rounded-lg'
      : size === 'lg'
      ? 'w-14 h-14 rounded-2xl'
      : 'w-10 h-10 rounded-xl';

  const effectiveLogoUrl =
    logoUrl ||
    (icon === 'shield-navy'
      ? '/assets/aistudio/file_0000000080a8820e83e95938baa4fbe8_5866e787.png'
      : undefined);

  if (effectiveLogoUrl) {
    return (
      <div
        className={`${sizeClasses} bg-[#071021] border border-[#B6C2D2]/60 overflow-hidden shadow-xs shrink-0 flex items-center justify-center`}
      >
        <img
          src={effectiveLogoUrl}
          alt={name}
          referrerPolicy="no-referrer"
          className={`w-full h-full object-cover ${!logoUrl ? 'scale-[1.06]' : ''}`}
        />
      </div>
    );
  }

  const initial = (name || '').trim().charAt(0).toUpperCase();
  if (!logoUrl && initialFallback && initial) {
    const textSize = size === 'sm' ? 'text-base' : size === 'lg' ? 'text-2xl' : 'text-lg';
    return (
      <div
        className={`${sizeClasses} bg-[#0B1933] text-white border border-white/20 shadow-xs shrink-0 flex items-center justify-center font-black ${textSize}`}
        role="img"
        aria-label={name}
      >
        {initial}
      </div>
    );
  }

  const iconSize = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-7 h-7' : 'w-5 h-5';

  const renderGlyph = () => {
    if (icon === 'truck') return <Truck className={`${iconSize} text-[#E2E8F0]`} />;
    if (icon === 'package') return <Package className={`${iconSize} text-[#E2E8F0]`} />;
    if (icon === 'store') return <Store className={`${iconSize} text-[#E2E8F0]`} />;
    if (icon === 'building') return <Building2 className={`${iconSize} text-[#E2E8F0]`} />;
    if (icon === 'shopping-bag') return <ShoppingBag className={`${iconSize} text-[#E2E8F0]`} />;
    if (icon === 'shield') return <ShieldCheck className={`${iconSize} text-[#E2E8F0]`} />;
    // Emblema geométrico sobrio Azul Marino y Plata por defecto
    return (
      <svg
        viewBox="0 0 32 32"
        className={iconSize}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M16 3L27 7.8V15.6C27 22.2 22.3 27.6 16 29.4C9.7 27.6 5 22.2 5 15.6V7.8L16 3Z"
          stroke="#CBD5E1"
          strokeWidth="2"
          fill="#12264B"
        />
        <path
          d="M11 16.5L14.5 20L21.5 12.5"
          stroke="#E2E8F0"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  };

  return (
    <div
      className={`${sizeClasses} bg-gradient-to-b from-[#162E59] to-[#0B1933] border border-[#B6C2D2]/50 shadow-xs shrink-0 flex items-center justify-center`}
    >
      {renderGlyph()}
    </div>
  );
};
