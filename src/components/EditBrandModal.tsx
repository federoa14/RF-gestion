import React, { useState, useEffect } from 'react';
import {
  X,
  Upload,
  Image as ImageIcon,
  Check,
  Building2,
  Truck,
  Package,
  Store,
  FileText,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { DistributorConfig } from '../types';

interface EditBrandModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: DistributorConfig;
  onSave: (updated: DistributorConfig) => void;
}

const ICON_PRESETS = [
  { id: 'shield-navy', label: 'Azul Marino y Plata', icon: ShieldCheck, color: 'from-[#162E59] via-[#0F2142] to-[#091428]' },
  { id: 'file', label: 'Boleta', icon: FileText, color: 'from-[#1B3566] to-[#0B1933]' },
  { id: 'truck', label: 'Camión / Reparto', icon: Truck, color: 'from-emerald-700 to-teal-800' },
  { id: 'package', label: 'Bultos / Logística', icon: Package, color: 'from-slate-600 to-slate-800' },
  { id: 'store', label: 'Comercio / Mayorista', icon: Store, color: 'from-[#162E59] to-slate-800' },
  { id: 'building', label: 'Edificio / Empresa', icon: Building2, color: 'from-slate-700 to-slate-900' },
  { id: 'shopping-bag', label: 'Ventas y Reparto', icon: ShoppingBag, color: 'from-[#1E3A6D] to-[#0F2142]' },
];

export const EditBrandModal: React.FC<EditBrandModalProps> = ({
  isOpen,
  onClose,
  config,
  onSave,
}) => {
  const [name, setName] = useState(config.distributorName || '');
  const [logoUrl, setLogoUrl] = useState(config.distributorLogoUrl || '');
  const [selectedIcon, setSelectedIcon] = useState(config.distributorIcon || 'file');
  const [phone, setPhone] = useState(config.distributorPhone || '');
  const [email, setEmail] = useState(config.distributorEmail || '');

  useEffect(() => {
    if (isOpen) {
      setName(config.distributorName || '');
      setLogoUrl(config.distributorLogoUrl || '');
      setSelectedIcon(config.distributorIcon || 'file');
      setPhone(config.distributorPhone || '');
      setEmail(config.distributorEmail || '');
    }
  }, [isOpen, config]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('Por favor selecciona una imagen menor a 5MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const rawDataUrl = String(reader.result || '');
      if (file.type === 'image/svg+xml' || !rawDataUrl.startsWith('data:image/')) {
        setLogoUrl(rawDataUrl);
        return;
      }
      const img = new Image();
      img.onerror = () => setLogoUrl(rawDataUrl);
      img.onload = () => {
        try {
          const maxSide = 400;
          let { width, height } = img;
          if (width <= maxSide && height <= maxSide && rawDataUrl.length < 180_000) {
            setLogoUrl(rawDataUrl);
            return;
          }
          if (width > maxSide || height > maxSide) {
            if (width >= height) {
              height = Math.max(1, Math.round((height * maxSide) / width));
              width = maxSide;
            } else {
              width = Math.max(1, Math.round((width * maxSide) / height));
              height = maxSide;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            setLogoUrl(rawDataUrl);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          // Solo las fotos JPG se guardan como JPG; el resto (PNG, WebP, SVG, GIF) como PNG para no perder la transparencia
          const outputType = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
          setLogoUrl(canvas.toDataURL(outputType, 0.88));
        } catch {
          setLogoUrl(rawDataUrl);
        }
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setLogoUrl('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('El nombre de la distribuidora no puede estar vacío.');
      return;
    }

    const updated: DistributorConfig = {
      ...config,
      distributorName: name.trim(),
      distributorLogoUrl: logoUrl.trim() || undefined,
      distributorIcon: selectedIcon,
      distributorPhone: phone.trim(),
      distributorEmail: email.trim(),
    };

    onSave(updated);
    onClose();
  };

  const currentPreset = ICON_PRESETS.find((p) => p.id === selectedIcon) || ICON_PRESETS[0];
  const PresetIcon = currentPreset.icon;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative my-8 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between border-b pb-4 border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/10 text-indigo-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Editar Nombre y Logo
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Personalizá la identidad de tu sistema y de tu página web pública
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          {/* Live Preview Box */}
          <div className="p-4 rounded-xl bg-slate-900 text-white border border-slate-800 space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Vista Previa en el Encabezado:
            </span>
            <div className="flex items-center gap-3 pt-1">
              {logoUrl ? (
                <div className="relative group">
                  <img
                    src={logoUrl}
                    alt="Logo preview"
                    className="max-w-[3.5rem] max-h-14 w-auto h-auto object-contain"
                  />
                </div>
              ) : (
                <div
                  className={`w-12 h-12 rounded-xl bg-gradient-to-tr ${currentPreset.color} flex items-center justify-center shadow-md`}
                >
                  <PresetIcon className="w-6 h-6 text-white" />
                </div>
              )}

              <div className="min-w-0">
                <h3 className="font-bold text-base sm:text-lg text-white truncate">
                  {name || 'Nombre de la Distribuidora'}
                </h3>
                <p className="text-xs text-slate-400">
                  Sistema de Control de Boletas Fiadas y Vencimientos
                </p>
              </div>
            </div>
          </div>

          {/* Business Name Input */}
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
              Nombre de la Distribuidora / Empresa:
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre de tu distribuidora o comercio"
              className="w-full text-sm p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
              required
            />
          </div>

          {/* Logo Selection: Upload or Icon */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
              Logo de la Distribuidora:
            </label>

            {/* Upload File / URL Option */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-indigo-300 dark:border-indigo-800/80 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 hover:bg-indigo-50 cursor-pointer transition-colors text-center">
                <Upload className="w-6 h-6 text-indigo-600 mb-1" />
                <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300">
                  Subir imagen desde el equipo
                </span>
                <span className="text-[10px] text-slate-400">PNG, JPG, SVG o WebP</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>

              <div className="p-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/40 space-y-2">
                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 block">
                  O pegar link / URL de imagen:
                </span>
                <div className="flex gap-1.5">
                  <input
                    type="url"
                    placeholder="https://ejemplo.com/logo.png"
                    value={logoUrl.startsWith('data:') ? '' : logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                  />
                </div>
                {logoUrl && (
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    className="text-[11px] text-rose-600 hover:text-rose-700 flex items-center gap-1 font-semibold pt-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Quitar imagen y usar icono</span>
                  </button>
                )}
              </div>
            </div>

            {/* Presets if no image is uploaded */}
            {!logoUrl && (
              <div className="space-y-2 pt-2">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 block">
                  O elegí un icono representativo:
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {ICON_PRESETS.map((preset) => {
                    const IconComp = preset.icon;
                    const isSelected = selectedIcon === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setSelectedIcon(preset.id)}
                        className={`flex items-center gap-2 p-2 rounded-xl border text-left text-xs transition-all ${
                          isSelected
                            ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-900 dark:text-indigo-200 font-bold ring-2 ring-indigo-400'
                            : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <div
                          className={`w-7 h-7 rounded-lg bg-gradient-to-tr ${preset.color} flex items-center justify-center shrink-0 shadow-xs`}
                        >
                          <IconComp className="w-3.5 h-3.5 text-white" />
                        </div>
                        <span className="text-[11px] truncate">{preset.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Quick contact details optional */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-100 dark:border-slate-800">
            <div>
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                Teléfono de la Distribuidora:
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+54 9 11 ..."
                className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                Email de Administración:
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="administracion@distribuidora.com"
                className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-md transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              Guardar Nombre y Logo
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
