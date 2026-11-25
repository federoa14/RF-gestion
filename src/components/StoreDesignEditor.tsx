import React from 'react';
import { ArrowRight, Lock, Palette, RotateCcw, ShoppingCart } from 'lucide-react';
import type { CatalogStoreTheme } from '../types';
import {
  STORE_FONTS,
  STORE_PALETTES,
  getStoreThemeRootProps,
  isTooLightForWhiteText,
  isValidHexColor,
  resolveStoreTheme,
} from '../utils/storeTheme';

interface StoreDesignEditorProps {
  value: CatalogStoreTheme | undefined;
  onChange: (next: CatalogStoreTheme | undefined) => void;
  storeName: string;
  currencySymbol: string;
  locked: boolean;
  onUpgrade?: () => void;
}

type Option<T extends string> = { value: T; label: string };

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold text-slate-700">{label}</div>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(o.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${
                active
                  ? 'bg-[#0B1933] text-white border-[#0B1933]'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export const StoreDesignEditor: React.FC<StoreDesignEditorProps> = ({
  value,
  onChange,
  storeName,
  currencySymbol,
  locked,
  onUpgrade,
}) => {
  const theme: CatalogStoreTheme = value || {};
  const r = resolveStoreTheme(theme);
  const set = (patch: Partial<CatalogStoreTheme>) => onChange({ ...theme, ...patch });
  const isCustom = theme.palette === 'personalizada';
  const primaryTooLight = isTooLightForWhiteText(r.primary);
  const previewProps = getStoreThemeRootProps(value || {}, true);

  return (
    <div className="sm:col-span-2 p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <Palette className="w-4 h-4 text-slate-600" />
            Diseño de tu tienda
            <span className="px-1.5 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-800 text-[10px] font-bold">
              Plan 3
            </span>
          </div>
          <p className="text-[11px] text-slate-500">
            Elegí colores, letra, tarjetas y banners. Lo ves al instante en la vista previa y se publica al guardar.
          </p>
        </div>
        {!locked && value && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Volver al diseño estándar
          </button>
        )}
      </div>

      {locked && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="text-xs text-amber-950 flex items-start gap-1.5">
            <Lock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <span>
              Personalizar el diseño es una función de <strong>Plan 3 · Full</strong>. Podés probar las opciones acá,
              pero tu tienda sigue con el diseño estándar.
            </span>
          </div>
          {onUpgrade && (
            <button
              type="button"
              onClick={onUpgrade}
              className="px-3 py-1.5 rounded-lg bg-[#0B1933] hover:bg-[#13264A] text-white text-xs font-bold cursor-pointer shrink-0 whitespace-nowrap"
            >
              Cambiar a Plan Full
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Opciones */}
        <div className="space-y-3.5">
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-slate-700">Paleta de colores</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {STORE_PALETTES.map((p) => {
                const active = (theme.palette || 'marino') === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => set({ palette: p.key })}
                    className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs font-semibold cursor-pointer ${
                      active ? 'border-slate-900 ring-2 ring-slate-900/15 bg-white' : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <span className="flex -space-x-1 shrink-0" aria-hidden="true">
                      <span className="w-4 h-4 rounded-full border border-white" style={{ backgroundColor: p.primary }} />
                      <span className="w-4 h-4 rounded-full border border-white" style={{ backgroundColor: p.accent }} />
                    </span>
                    {p.label}
                  </button>
                );
              })}
              <button
                type="button"
                aria-pressed={isCustom}
                onClick={() =>
                  set({
                    palette: 'personalizada',
                    primaryColor: isValidHexColor(theme.primaryColor) ? theme.primaryColor : r.primary,
                    accentColor: isValidHexColor(theme.accentColor) ? theme.accentColor : r.accent,
                  })
                }
                className={`col-span-2 sm:col-span-3 px-2.5 py-2 rounded-lg border text-xs font-semibold cursor-pointer ${
                  isCustom ? 'border-slate-900 ring-2 ring-slate-900/15 bg-white' : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                Mis propios colores
              </button>
            </div>
            {isCustom && (
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ['primaryColor', 'Color principal'],
                    ['accentColor', 'Color de acento'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="space-y-1">
                    <span className="block text-[11px] font-semibold text-slate-600">{label}</span>
                    <span className="flex items-center gap-2">
                      <input
                        type="color"
                        value={key === 'primaryColor' ? r.primary : r.accent}
                        onChange={(e) => set({ [key]: e.target.value.toUpperCase() })}
                        className="w-11 h-11 rounded-lg border border-slate-200 bg-white cursor-pointer p-0.5"
                        aria-label={label}
                      />
                      <span className="font-mono text-xs text-slate-700">{key === 'primaryColor' ? r.primary : r.accent}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
            {primaryTooLight && (
              <p className="text-[11px] font-semibold text-amber-800">
                El color principal es muy claro: los textos blancos de los botones no se van a leer bien. Elegí un tono más oscuro.
              </p>
            )}
          </div>

          <label className="block space-y-1">
            <span className="block text-xs font-semibold text-slate-700">Tipo de letra</span>
            <select
              value={r.fontKey}
              onChange={(e) => set({ font: e.target.value as CatalogStoreTheme['font'] })}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 cursor-pointer"
              style={{ fontFamily: r.fontFamily }}
            >
              {STORE_FONTS.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label} · {f.note}
                </option>
              ))}
            </select>
          </label>

          <Segmented
            label="Tamaño de letra"
            value={r.fontSize}
            onChange={(v) => set({ fontSize: v })}
            options={[
              { value: 'normal', label: 'Normal' },
              { value: 'grande', label: 'Grande' },
            ]}
          />
          <Segmented
            label="Estilo de las tarjetas"
            value={r.cardStyle}
            onChange={(v) => set({ cardStyle: v })}
            options={[
              { value: 'borde', label: 'Con borde' },
              { value: 'sombra', label: 'Con sombra' },
              { value: 'plano', label: 'Planas' },
            ]}
          />
          <Segmented
            label="Esquinas"
            value={r.cardCorners}
            onChange={(v) => set({ cardCorners: v })}
            options={[
              { value: 'redondeado', label: 'Redondeadas' },
              { value: 'recto', label: 'Rectas' },
            ]}
          />

          <div className="pt-3 border-t border-slate-200 space-y-3">
            <div className="text-xs font-bold text-slate-800">Banners de promociones</div>
            <Segmented
              label="Colores de los banners"
              value={r.bannerColors}
              onChange={(v) => set({ bannerColors: v })}
              options={[
                { value: 'propios', label: 'El color de cada banner' },
                { value: 'tienda', label: 'Los colores de la tienda' },
              ]}
            />
            {r.bannerColors === 'tienda' && (
              <Segmented
                label="Fondo"
                value={r.bannerBackground}
                onChange={(v) => set({ bannerBackground: v })}
                options={[
                  { value: 'oscuro', label: 'Oscuro' },
                  { value: 'claro', label: 'Claro' },
                ]}
              />
            )}
            <Segmented
              label="Tamaño del título"
              value={r.bannerTitleSize}
              onChange={(v) => set({ bannerTitleSize: v })}
              options={[
                { value: 'normal', label: 'Normal' },
                { value: 'grande', label: 'Grande' },
              ]}
            />
          </div>
        </div>

        {/* Vista previa: usa las mismas reglas que la tienda pública */}
        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-slate-700">Vista previa</div>
          <div
            {...previewProps}
            className={`${previewProps.className} rounded-xl border border-slate-200 bg-[#F8FAFC] overflow-hidden`}
            aria-label="Vista previa del diseño de la tienda"
          >
            <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-white border-b border-slate-200">
              <span className="text-sm font-bold text-slate-900 truncate">{storeName}</span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#0B1933] text-white text-[11px] font-bold">
                <ShoppingCart className="w-3.5 h-3.5" />
                Carrito
              </span>
            </div>
            <div className="p-3 space-y-3">
              <div
                className={`rf-store-round rounded-2xl border p-3.5 flex items-center justify-between gap-3 ${
                  r.bannerColors === 'tienda'
                    ? r.bannerBackground === 'claro'
                      ? 'rf-banner-store-light'
                      : 'rf-banner-store-dark'
                    : 'bg-emerald-900 text-white border-emerald-900'
                }`}
              >
                <div className="min-w-0 space-y-0.5">
                  <div
                    className={`text-[11px] font-bold tracking-wide uppercase ${
                      r.bannerColors === 'tienda' ? 'rf-banner-badge' : 'text-emerald-300'
                    }`}
                  >
                    Solo esta semana
                  </div>
                  <div className="rf-banner-title text-base font-bold leading-snug">20% off en bebidas</div>
                  <p className={`text-xs ${r.bannerColors === 'tienda' && r.bannerBackground === 'claro' ? 'text-slate-700' : 'text-slate-200'}`}>
                    Pagando con transferencia
                  </p>
                </div>
                <span
                  className={`inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold shrink-0 ${
                    r.bannerColors === 'tienda' ? 'rf-banner-cta' : 'bg-white text-slate-900'
                  }`}
                >
                  Ver oferta
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  ['Gaseosa Cola 2,25 L', 1850],
                  ['Agua sin gas 1,5 L', 900],
                ].map(([name, price]) => (
                  <div key={String(name)} className="rf-store-card bg-white border border-slate-200 rounded-2xl overflow-hidden">
                    <div className="aspect-[4/3] bg-slate-100 flex items-center justify-center text-xl font-black text-slate-400">
                      {String(name).charAt(0)}
                    </div>
                    <div className="p-2.5 space-y-1.5">
                      <div className="text-xs font-bold text-slate-900 leading-snug">{name}</div>
                      <div className="text-sm font-black text-[#0B1933]">
                        {currencySymbol} {Number(price).toLocaleString('es-AR')}
                      </div>
                      <span className="block text-center px-2 py-1.5 rounded-lg bg-[#0B1933] text-white text-[11px] font-bold">
                        Agregar
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
