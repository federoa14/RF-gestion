import React, { useEffect, useState } from 'react';
import { Lock, Palette, RotateCcw, Save, Store, LayoutDashboard } from 'lucide-react';
import type { CatalogStoreTheme } from '../types';
import { StoreDesignEditor } from './StoreDesignEditor';
import {
  STORE_FONTS,
  STORE_PALETTES,
  isTooLightForWhiteText,
  isValidHexColor,
  resolveStoreTheme,
} from '../utils/storeTheme';

interface DesignPageEditorProps {
  storeTheme: CatalogStoreTheme | undefined;
  panelTheme: CatalogStoreTheme | undefined;
  onSaveStoreTheme: (next: CatalogStoreTheme | undefined) => void;
  onSavePanelTheme?: (next: CatalogStoreTheme | undefined) => void;
  storeName: string;
  currencySymbol: string;
  locked: boolean;
  onUpgrade?: () => void;
  showToast: (message: string) => void;
}

type Target = 'tienda' | 'panel';

const sig = (t: CatalogStoreTheme | undefined) => JSON.stringify(t || null);

/**
 * "Diseño de página": cada comercio elige los colores y la letra de su tienda online
 * o de su panel de gestión. Se guarda con su propio botón, sin depender de la
 * configuración de envíos y cobros.
 */
export const DesignPageEditor: React.FC<DesignPageEditorProps> = ({
  storeTheme,
  panelTheme,
  onSaveStoreTheme,
  onSavePanelTheme,
  storeName,
  currencySymbol,
  locked,
  onUpgrade,
  showToast,
}) => {
  const [target, setTarget] = useState<Target>('tienda');
  const [draftStore, setDraftStore] = useState<CatalogStoreTheme | undefined>(storeTheme);
  const [draftPanel, setDraftPanel] = useState<CatalogStoreTheme | undefined>(panelTheme);

  // Solo se recarga el borrador cuando cambia lo guardado (no por sincronizaciones en segundo plano)
  useEffect(() => setDraftStore(storeTheme), [sig(storeTheme)]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setDraftPanel(panelTheme), [sig(panelTheme)]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty =
    target === 'tienda' ? sig(draftStore) !== sig(storeTheme) : sig(draftPanel) !== sig(panelTheme);

  const handleSave = () => {
    if (locked) return; // solo Plan 3
    if (target === 'tienda') {
      onSaveStoreTheme(draftStore);
      showToast('Diseño de la tienda guardado y publicado.');
    } else {
      onSavePanelTheme?.(draftPanel);
      showToast('Diseño del panel guardado.');
    }
  };

  const setPanel = (patch: Partial<CatalogStoreTheme>) => setDraftPanel({ ...(draftPanel || {}), ...patch });
  const pr = resolveStoreTheme(draftPanel);
  const isCustom = draftPanel?.palette === 'personalizada';

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-3">
        <div>
          <div className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
            <Palette className="w-4 h-4 text-[#0B1933]" />
            Diseño de página
          </div>
          <p className="text-[11px] text-slate-500">
            Elegí qué querés personalizar: la tienda que ven tus compradores o el panel donde trabajás vos.
          </p>
        </div>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Qué diseñar">
          {(
            [
              ['tienda', 'Tienda online', Store],
              ['panel', 'Panel de gestión', LayoutDashboard],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={target === key}
              onClick={() => setTarget(key)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold border cursor-pointer ${
                target === key
                  ? 'bg-[#0B1933] text-white border-[#0B1933]'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {locked && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="text-xs text-amber-950 flex items-start gap-1.5">
            <Lock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <span>
              Personalizar el diseño es una función exclusiva de <strong>Plan 3 · Full</strong>. Con tu plan actual
              no se puede modificar.
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

      <fieldset disabled={locked} className={`min-w-0 border-0 p-0 m-0 ${locked ? 'opacity-60' : ''}`}>
      {target === 'tienda' ? (
        <StoreDesignEditor
          value={draftStore}
          onChange={setDraftStore}
          storeName={storeName}
          currencySymbol={currencySymbol}
          locked={false}
        />
      ) : (
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-[11px] text-slate-500">
              Cambia el color principal y la letra de tu panel de gestión (botones, títulos y menú).
            </p>
            {!locked && draftPanel && (
              <button
                type="button"
                onClick={() => setDraftPanel(undefined)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Volver al diseño estándar
              </button>
            )}
          </div>


          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-slate-700">Paleta de colores</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {STORE_PALETTES.map((p) => {
                const active = (draftPanel?.palette || 'marino') === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setPanel({ palette: p.key })}
                    className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs font-semibold cursor-pointer ${
                      active ? 'border-slate-900 ring-2 ring-slate-900/15 bg-white' : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <span className="w-4 h-4 rounded-full border border-white" style={{ backgroundColor: p.primary }} aria-hidden="true" />
                    {p.label}
                  </button>
                );
              })}
              <button
                type="button"
                aria-pressed={isCustom}
                onClick={() =>
                  setPanel({
                    palette: 'personalizada',
                    primaryColor: isValidHexColor(draftPanel?.primaryColor) ? draftPanel?.primaryColor : pr.primary,
                    accentColor: isValidHexColor(draftPanel?.accentColor) ? draftPanel?.accentColor : pr.accent,
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
              <label className="flex items-center gap-2">
                <input
                  type="color"
                  value={pr.primary}
                  onChange={(e) => setPanel({ primaryColor: e.target.value.toUpperCase() })}
                  className="w-11 h-11 rounded-lg border border-slate-200 bg-white cursor-pointer p-0.5"
                  aria-label="Color principal"
                />
                <span className="text-[11px] font-semibold text-slate-600">
                  Color principal <span className="font-mono text-slate-700">{pr.primary}</span>
                </span>
              </label>
            )}
            {isTooLightForWhiteText(pr.primary) && (
              <p className="text-[11px] font-semibold text-amber-800">
                El color principal es muy claro: los textos blancos de los botones no se van a leer bien.
              </p>
            )}
          </div>

          <label className="block space-y-1">
            <span className="block text-xs font-semibold text-slate-700">Tipo de letra</span>
            <select
              value={pr.fontKey}
              onChange={(e) => setPanel({ font: e.target.value as CatalogStoreTheme['font'] })}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 cursor-pointer"
              style={{ fontFamily: pr.fontFamily }}
            >
              {STORE_FONTS.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label} · {f.note}
                </option>
              ))}
            </select>
          </label>

          <div
            className="rounded-lg p-3 text-white text-xs font-bold"
            style={{ backgroundColor: pr.primary, fontFamily: pr.fontFamily }}
          >
            Así se verán tus botones y títulos
          </div>
        </div>
      )}
      </fieldset>

      <div className="flex items-center justify-end gap-3">
        {dirty && <span className="text-[11px] font-semibold text-amber-700">Tenés cambios sin guardar</span>}
        <button
          type="button"
          onClick={handleSave}
          disabled={locked || !dirty}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-[#0B1933] hover:bg-[#13264A] disabled:opacity-50 disabled:cursor-not-allowed text-white cursor-pointer"
        >
          <Save className="w-3.5 h-3.5" />
          Guardar diseño
        </button>
      </div>
    </div>
  );
};
