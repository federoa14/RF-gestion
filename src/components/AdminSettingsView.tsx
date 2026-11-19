import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Plus,
  Phone,
  Mail,
  Edit2,
  Trash2,
  Settings,
  Bell,
  Clock,
  Building,
  Save,
  RotateCcw,
  CheckCircle,
  MessageCircle,
  UserCheck,
  Edit3,
  Sparkles,
  HelpCircle,
  Database,
  ShieldAlert,
  Flame,
  User,
  Smartphone,
  CheckCircle2,
  XCircle,
  ToggleLeft,
  ToggleRight,
  Wallet,
  Percent,
  Store,
  Download,
  Upload,
  HardDrive,
} from 'lucide-react';
import { Administrator, DistributorConfig, BusinessRubro } from '../types';
import { RUBRO_PROFILES, getRubroProfile, applyRubroProfileToConfig } from '../utils/businessMode';
import {
  getInternalDatabaseStatus,
  downloadInternalDatabaseBackup,
  importInternalDatabaseBackup,
  InternalDbStatus,
} from '../utils/localInternalDb';
import {
  createWhatsAppUrl,
  generateUserSignedReminder,
  generateClientWhatsAppMessage,
} from '../utils/whatsapp';

interface AdminSettingsViewProps {
  admins: Administrator[];
  config: DistributorConfig;
  onSaveAdmin: (admin: Administrator) => void;
  onDeleteAdmin: (adminId: string) => void;
  onSaveConfig: (config: DistributorConfig) => void;
  onResetOperationalData: () => void;
  onExecuteRetentionPurge?: () => void;
}

export const AdminSettingsView: React.FC<AdminSettingsViewProps> = ({
  admins,
  config,
  onSaveAdmin,
  onDeleteAdmin,
  onSaveConfig,
  onResetOperationalData,
  onExecuteRetentionPurge,
}) => {
  const [currentConfig, setCurrentConfig] = useState<DistributorConfig>({ ...config });
  const [configSaved, setConfigSaved] = useState(false);
  const [merchantMpTokenInput, setMerchantMpTokenInput] = useState('');
  const [confirmDeleteAdminId, setConfirmDeleteAdminId] = useState<string | null>(null);
  const [confirmResetData, setConfirmResetData] = useState(false);
  const [internalDbStatus, setInternalDbStatus] = useState<InternalDbStatus | null>(null);
  const [backupFeedback, setBackupFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const backupInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCurrentConfig({ ...config });
  }, [config]);

  useEffect(() => {
    getInternalDatabaseStatus().then(setInternalDbStatus).catch(() => {});
  }, []);

  // Admin modal state
  const [isEditingAdmin, setIsEditingAdmin] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<Partial<Administrator> | null>(null);

  // Active admin in session
  const activeAdmin =
    admins.find((a) => a.id === currentConfig.activeAdminId) ||
    admins.find((a) => a.isGeneralAdmin || a.role === 'dueño') ||
    admins[0];

  const handleOpenNewAdmin = () => {
    setEditingAdmin({
      id: `adm-${Date.now()}`,
      name: '',
      phone: '',
      email: '',
      role: 'administrador',
      receiveAdminAlerts: true,
      isGeneralAdmin: false,
    });
    setIsEditingAdmin(true);
  };

  const handleOpenEditAdmin = (a: Administrator) => {
    setEditingAdmin({ ...a });
    setIsEditingAdmin(true);
  };

  const handleSaveAdminForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAdmin || !editingAdmin.name) return;

    onSaveAdmin(editingAdmin as Administrator);
    setIsEditingAdmin(false);
    setEditingAdmin(null);
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    let updatedCfg = { ...currentConfig };
    if (merchantMpTokenInput.trim()) {
      updatedCfg = {
        ...updatedCfg,
        merchantMpAccessToken: merchantMpTokenInput.trim(),
        hasMerchantMpAccessToken: true,
      };
      setMerchantMpTokenInput('');
    }
    onSaveConfig(updatedCfg);
    setConfigSaved(true);
    setTimeout(() => setConfigSaved(false), 3000);
  };

  const insertTag = (tag: string) => {
    setCurrentConfig((prev) => ({
      ...prev,
      customCobranzaTemplate: (prev.customCobranzaTemplate || '') + ' ' + tag,
    }));
  };

  const insertClientTag = (tag: string) => {
    setCurrentConfig((prev) => ({
      ...prev,
      customClientOverdueTemplate: (prev.customClientOverdueTemplate || '') + ' ' + tag,
    }));
  };

  const defaultSampleBoleta = {
    id: 'demo',
    boletaNumber: '0001-00045231',
    clientId: 'cli-1',
    clientName: 'Almacén Don Juan',
    clientAddress: 'Av. San Martín 1540',
    salespersonId: 'ven-1',
    salespersonName: 'Carlos Méndez',
    saleDate: '2026-10-22',
    amount: 184500,
    termDays: 7,
    dueDate: '2026-10-29',
    isSigned: true,
    status: 'pending' as const,
    remindersLog: [],
    createdAt: '2026-10-22',
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-amber-500" />
          <span>Dueños, Administradores & Redactor de Mensajes de Cobranza</span>
        </h2>
        <p className="text-xs text-slate-500">
          Gestiona los usuarios autorizados, define quién está en sesión activa y personaliza los mensajes automáticos "Soy [Usuario]..."
        </p>
      </div>

      {/* ACTIVE USER SESSION SWITCHER */}
      <div className="bg-[#0B1933] text-white p-5 rounded-xl border border-[#B6C2D2]/25 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8] block">
            Sesión y Firma Actual
          </span>
          <div className="flex items-center gap-2 mt-0.5">
            <UserCheck className="w-5 h-5 text-emerald-400" />
            <h3 className="text-lg font-bold text-white">
              Operando como: {activeAdmin.name} ({activeAdmin.role})
            </h3>
          </div>
          <p className="text-xs text-[#CBD5E1] mt-1">
            Los mensajes de WhatsApp saldrán automáticamente con tu nombre: <em>"Soy {activeAdmin.name} y necesito que vayas a cobrarle..."</em>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-[#CBD5E1] font-medium">Cambiar usuario activo:</span>
          <select
            value={currentConfig.activeAdminId || activeAdmin.id}
            onChange={(e) => {
              const updated = { ...currentConfig, activeAdminId: e.target.value };
              setCurrentConfig(updated);
              onSaveConfig(updated);
            }}
            className="text-xs p-2 rounded-lg bg-[#071021] border border-[#B6C2D2]/30 text-white font-bold"
          >
            {admins.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.role})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* REDACTOR DE MENSAJE DE COBRANZA ("Soy [Usuario] y necesito que vayas a cobrarle...") */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Edit3 className="w-4 h-4 text-emerald-600" />
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              Redactor de Mensaje de Cobro para Vendedores
            </h3>
          </div>
          <button
            type="button"
            onClick={() => {
              setCurrentConfig((prev) => ({
                ...prev,
                customCobranzaTemplate:
                  'Hola {vendedor}, soy {adminActual} y necesito que vayas a cobrarle a {cliente} la boleta #{boleta} por un monto de {monto}. La venta fue el {fechaVenta} ({dias} días) y vence el {vencimiento}. Por favor confirmame en cuanto pases por el local.',
              }));
            }}
            className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 font-semibold"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Restablecer Plantilla Inicial</span>
          </button>
        </div>

        <p className="text-xs text-slate-500">
          Aquí puedes redactar las veces que quieras el mensaje para recordarles que vayan a cobrar. Las etiquetas entre llaves se reemplazarán automáticamente con los datos reales de cada boleta.
        </p>

        {/* Quick Tag Insert Buttons */}
        <div>
          <span className="text-[11px] font-semibold text-slate-400 block mb-1.5">
            Insertar datos dinámicos con un clic:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {[
              { tag: '{adminActual}', label: '👤 Soy [Tu Nombre]' },
              { tag: '{vendedor}', label: '🛵 Nombre Vendedor' },
              { tag: '{cliente}', label: '🏬 Nombre Cliente' },
              { tag: '{monto}', label: '💰 Monto $' },
              { tag: '{boleta}', label: '📄 N° Boleta' },
              { tag: '{dias}', label: '⏱️ Días Transcurridos' },
              { tag: '{vencimiento}', label: '📅 Fecha Vencimiento' },
              { tag: '{direccion}', label: '📍 Dirección' },
            ].map((btn) => (
              <button
                key={btn.tag}
                type="button"
                onClick={() => insertTag(btn.tag)}
                className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-mono transition-colors"
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        {/* Textarea for template */}
        <div>
          <textarea
            value={currentConfig.customCobranzaTemplate || ''}
            onChange={(e) =>
              setCurrentConfig({
                ...currentConfig,
                customCobranzaTemplate: e.target.value,
              })
            }
            rows={4}
            className="w-full text-xs font-mono p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* Live Preview Box */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            Ejemplo real de cómo lo recibirá el vendedor por WhatsApp:
          </span>
          <p className="text-xs font-mono text-slate-800 dark:text-slate-200 whitespace-pre-line leading-relaxed">
            {generateUserSignedReminder(
              defaultSampleBoleta,
              { name: 'Carlos Méndez' } as any,
              activeAdmin.name,
              currentConfig,
              currentConfig.customCobranzaTemplate
            )}
          </p>
        </div>
      </div>

      {/* BOTÓN Y CONTROL: ACTIVAR / DESACTIVAR ENVÍO DE WHATSAPP DIRECTO A CLIENTES */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border-2 border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  Envío de Mensajes de WhatsApp Directamente a los Clientes
                </h3>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    currentConfig.enableClientWhatsAppReminders
                      ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700'
                  }`}
                >
                  {currentConfig.enableClientWhatsAppReminders ? '✓ HABILITADO' : '✕ DESHABILITADO'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Controla si esta empresa tiene permitido enviar recordatorios de facturas vencidas directamente al WhatsApp del cliente.
              </p>
            </div>
          </div>

          {/* INTERACTIVE TOGGLE BUTTON */}
          <div className="flex items-center gap-2 self-start sm:self-center">
            <button
              type="button"
              onClick={() => {
                const newState = !currentConfig.enableClientWhatsAppReminders;
                const updated = {
                  ...currentConfig,
                  enableClientWhatsAppReminders: newState,
                };
                setCurrentConfig(updated);
                onSaveConfig(updated);
              }}
              className={`px-4 py-2 rounded-xl text-xs font-black shadow-md flex items-center gap-2 transition-all cursor-pointer ${
                currentConfig.enableClientWhatsAppReminders
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
                  : 'bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700'
              }`}
              title="Hacé clic para activar o desactivar el envío de WhatsApp a clientes"
            >
              {currentConfig.enableClientWhatsAppReminders ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-white" />
                  <span>Envíos a Clientes: ACTIVADO</span>
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4 text-rose-500" />
                  <span>Envíos a Clientes: DESACTIVADO</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Dynamic state explanation box */}
        <div
          className={`p-4 rounded-xl border text-xs leading-relaxed ${
            currentConfig.enableClientWhatsAppReminders
              ? 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-900 dark:text-emerald-200'
              : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
          }`}
        >
          {currentConfig.enableClientWhatsAppReminders ? (
            <div className="space-y-1">
              <p className="font-bold flex items-center gap-1.5 text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Función Habilitada: Los clientes pueden recibir recordatorios de boletas vencidas</span>
              </p>
              <p className="text-[11px] text-emerald-700 dark:text-emerald-300/80">
                Tanto en las tarjetas de boletas como en el despacho matutino se permitirá notificar al cliente sobre su factura vencida. Puedes personalizar la plantilla de texto a continuación.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="font-bold flex items-center gap-1.5 text-slate-800 dark:text-slate-300">
                <ShieldCheck className="w-4 h-4 text-amber-500 shrink-0" />
                <span>Función Deshabilitada: Trato Comercial Exclusivo con el Vendedor</span>
              </p>
              <p className="text-[11px]">
                Ningún cliente recibirá mensajes automáticos de WhatsApp desde el sistema. Los recordatorios de cobro y mora se enviarán exclusivamente a tus <strong>vendedores y dueños</strong> para que ellos gestionen el cobro personalmente.
              </p>
            </div>
          )}
        </div>

        {/* Custom Template Editor for Clients (visible if enabled or customizable anytime) */}
        {currentConfig.enableClientWhatsAppReminders && (
          <div className="space-y-3.5 pt-1 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Plantilla de Mensaje para el Cliente (Factura Vencida)
                </h4>
                <p className="text-[11px] text-slate-500">
                  Personalizá el mensaje formal que recibirá el cliente para informarle de su factura vencida.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setCurrentConfig((prev) => ({
                    ...prev,
                    customClientOverdueTemplate:
                      'Hola {cliente}, le informamos desde {distribuidora} que la boleta/factura #{boleta} por un monto de {monto} venció el {vencimiento} ({dias} días). Le solicitamos tener preparado el importe para cuando pase nuestro vendedor {vendedor} o coordinar transferencia. ¡Muchas gracias!',
                  }));
                }}
                className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 font-semibold"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Restablecer Plantilla</span>
              </button>
            </div>

            {/* Quick Tag Insert Buttons for Client */}
            <div>
              <span className="text-[11px] font-semibold text-slate-400 block mb-1">
                Insertar datos dinámicos del cliente y factura:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { tag: '{cliente}', label: '🏬 Nombre Cliente' },
                  { tag: '{distribuidora}', label: '🏢 Nombre Empresa' },
                  { tag: '{boleta}', label: '📄 N° Boleta' },
                  { tag: '{monto}', label: '💰 Monto Saldo' },
                  { tag: '{vencimiento}', label: '📅 Vencimiento' },
                  { tag: '{fechaVenta}', label: '📦 Fecha Entrega' },
                  { tag: '{vendedor}', label: '🛵 Vendedor Asignado' },
                  { tag: '{dias}', label: '⏱️ Días Transcurridos' },
                  { tag: '{alias}', label: '💳 Alias / CBU Comercio' },
                ].map((btn) => (
                  <button
                    key={btn.tag}
                    type="button"
                    onClick={() => insertClientTag(btn.tag)}
                    className="text-[11px] px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-mono transition-colors"
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Client Template Textarea */}
            <div>
              <textarea
                value={
                  currentConfig.customClientOverdueTemplate ||
                  'Hola {cliente}, le informamos desde {distribuidora} que la boleta/factura #{boleta} por un monto de {monto} venció el {vencimiento} ({dias} días). Le solicitamos tener preparado el importe para cuando pase nuestro vendedor {vendedor} o coordinar transferencia. ¡Muchas gracias!'
                }
                onChange={(e) =>
                  setCurrentConfig({
                    ...currentConfig,
                    customClientOverdueTemplate: e.target.value,
                  })
                }
                rows={3}
                className="w-full text-xs font-mono p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Checkbox for Automated Dispatch inclusion */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Incluir a clientes en el despacho automático matutino (08:00 AM)
                </p>
                <p className="text-[11px] text-slate-500">
                  Si se activa, el sistema enviará también el mensaje de recordatorio a los clientes con facturas vencidas que tengan teléfono cargado.
                </p>
              </div>
              <input
                type="checkbox"
                checked={Boolean(currentConfig.includeClientsInAutoDispatch)}
                onChange={(e) =>
                  setCurrentConfig({
                    ...currentConfig,
                    includeClientsInAutoDispatch: e.target.checked,
                  })
                }
                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
              />
            </div>

            {/* Preview Box */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Previsualización real de cómo lo leerá el cliente en su WhatsApp:
              </span>
              <p className="text-xs font-mono text-slate-800 dark:text-slate-200 whitespace-pre-line leading-relaxed">
                {generateClientWhatsAppMessage(
                  defaultSampleBoleta,
                  { contactPerson: 'Juan Rodríguez', name: 'Almacén Don Juan' } as any,
                  currentConfig
                )}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* GESTIÓN DE USUARIOS / ADMINISTRADORES */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-500" />
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              Administradores, Dueños & Colaboradores del Sistema
            </h3>
          </div>

          <button
            onClick={handleOpenNewAdmin}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Agregar Usuario / Administrador</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {admins.map((admin) => (
            <div
              key={admin.id}
              className={`p-4 rounded-xl border transition-all ${
                admin.id === activeAdmin.id
                  ? 'border-indigo-400 ring-1 ring-indigo-400/40 bg-indigo-50/20 dark:bg-indigo-950/20'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                      {admin.name}
                    </h4>
                    {admin.isGeneralAdmin && (
                      <span className="text-[10px] font-bold bg-amber-500 text-white px-2 py-0.2 rounded-full shadow-2xs">
                        Admin General / Dueño
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded mt-1 inline-block">
                    {admin.role}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleOpenEditAdmin(admin)}
                    className="p-1.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    title="Editar datos de usuario"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  {admins.length > 1 && (
                    confirmDeleteAdminId === admin.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteAdmin(admin.id);
                            setConfirmDeleteAdminId(null);
                          }}
                          className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold cursor-pointer"
                        >
                          Confirmar
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteAdminId(null)}
                          className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-semibold cursor-pointer"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteAdminId(admin.id)}
                        className="p-1.5 rounded text-slate-400 hover:text-rose-600 cursor-pointer"
                        title="Eliminar administrador"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )
                  )}
                </div>
              </div>

              <div className="space-y-1.5 mt-3 text-xs text-slate-600 dark:text-slate-400">
                {admin.phone && (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-mono">{admin.phone}</span>
                    </span>
                    <a
                      href={createWhatsAppUrl(
                        admin.phone,
                        `Hola ${admin.name}, prueba de alertas de cobranzas de ${currentConfig.distributorName}.`
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-600 hover:text-emerald-500 font-semibold flex items-center gap-1"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>Probar WhatsApp</span>
                    </a>
                  </div>
                )}

                {admin.email && (
                  <div className="flex items-center gap-1.5 truncate">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    <span>{admin.email}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* PARÁMETROS DE DÍAS Y VENCIMIENTO MODIFICABLES */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <Settings className="w-4 h-4 text-blue-500" />
          <h3 className="font-bold text-sm text-slate-900 dark:text-white">
            Plazos de Vencimiento y Días de Alerta (Modificables)
          </h3>
        </div>

        <form onSubmit={handleSaveConfig} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            <div className="p-3.5 rounded-xl border border-yellow-200 dark:border-yellow-900/40 bg-yellow-50/40 dark:bg-yellow-950/20 space-y-1.5">
              <label className="text-xs font-bold text-yellow-900 dark:text-yellow-300 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-yellow-600" />
                <span>Recordatorio Vendedor:</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={currentConfig.vendedorReminderDays}
                  onChange={(e) =>
                    setCurrentConfig({
                      ...currentConfig,
                      vendedorReminderDays: parseInt(e.target.value) || 2,
                    })
                  }
                  className="w-16 text-center font-black text-base p-1.5 rounded-lg border border-yellow-300 dark:border-yellow-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
                <span className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">días venta</span>
              </div>
              <p className="text-[10px] text-slate-500">Recordarle al vendedor.</p>
            </div>

            <div className="p-3.5 rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/20 space-y-1.5">
              <label className="text-xs font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                <Bell className="w-4 h-4 text-amber-600" />
                <span>Alerta a Dueños:</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={currentConfig.adminAlertDays}
                  onChange={(e) =>
                    setCurrentConfig({
                      ...currentConfig,
                      adminAlertDays: parseInt(e.target.value) || 6,
                    })
                  }
                  className="w-16 text-center font-black text-base p-1.5 rounded-lg border border-amber-300 dark:border-amber-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
                <span className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">días venta</span>
              </div>
              <p className="text-[10px] text-slate-500">Aviso a los dueños.</p>
            </div>

            <div className="p-3.5 rounded-xl border border-blue-200 dark:border-blue-900/40 bg-blue-50/40 dark:bg-blue-950/20 space-y-1.5">
              <label className="text-xs font-bold text-blue-900 dark:text-blue-300 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-blue-600" />
                <span>Vencimiento Habitual:</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="90"
                  value={currentConfig.defaultTermDays}
                  onChange={(e) =>
                    setCurrentConfig({
                      ...currentConfig,
                      defaultTermDays: parseInt(e.target.value) || 7,
                    })
                  }
                  className="w-16 text-center font-black text-base p-1.5 rounded-lg border border-blue-300 dark:border-blue-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
                <span className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">días plazo</span>
              </div>
              <p className="text-[10px] text-slate-500">Plazo pactado al fiar.</p>
            </div>

            {/* Configuración de Prórroga por Defecto */}
            <div className="p-3.5 rounded-xl border border-indigo-200 dark:border-indigo-900/40 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-1.5">
              <label className="text-xs font-bold text-indigo-900 dark:text-indigo-300 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-indigo-600" />
                <span>Prórroga Rápida:</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={currentConfig.defaultExtensionDays || 3}
                  onChange={(e) =>
                    setCurrentConfig({
                      ...currentConfig,
                      defaultExtensionDays: parseInt(e.target.value) || 3,
                    })
                  }
                  className="w-16 text-center font-black text-base p-1.5 rounded-lg border border-indigo-300 dark:border-indigo-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
                <span className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">días extra</span>
              </div>
              <p className="text-[10px] text-slate-500">Días al prorrogar.</p>
            </div>

            {/* Días Posteriores para Rojo Crítico */}
            <div className="p-3.5 rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50/40 dark:bg-rose-950/20 space-y-1.5">
              <label className="text-xs font-bold text-rose-900 dark:text-rose-300 flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-rose-600" />
                <span>Rojo Post-Vencimiento:</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={currentConfig.overdueGraceDays !== undefined ? currentConfig.overdueGraceDays : 5}
                  onChange={(e) =>
                    setCurrentConfig({
                      ...currentConfig,
                      overdueGraceDays: parseInt(e.target.value) || 5,
                    })
                  }
                  className="w-16 text-center font-black text-base p-1.5 rounded-lg border border-rose-300 dark:border-rose-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
                <span className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">días post</span>
              </div>
              <p className="text-[10px] text-slate-500">A los 5d en rojo crítico.</p>
            </div>
          </div>

          {/* Tope de Fiado Sugerido para Nuevos Clientes */}
          <div className="p-4 rounded-xl bg-[#F4F6F9] dark:bg-[#091428] border border-[#CBD5E1] dark:border-[#B6C2D2]/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-xs font-bold text-[#0B1933] dark:text-white block">
                Tope de Fiado Sugerido por Defecto (Clientes Nuevos)
              </span>
              <span className="text-[11px] text-slate-500 dark:text-[#94A3B8]">
                Podés definir un tope inicial sugerido para tu comercio (ej. $150.000, $300.000, $1.000.000 o $0 sin límite). Luego cada cliente puede modificarse individualmente en <strong>Clientes y Deudas</strong>.
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-mono font-bold text-slate-500">{currentConfig.currencySymbol}</span>
              <input
                type="number"
                min="0"
                step="1000"
                placeholder="0 = sin tope"
                value={currentConfig.defaultClientCreditLimit || ''}
                onChange={(e) =>
                  setCurrentConfig({
                    ...currentConfig,
                    defaultClientCreditLimit: e.target.value ? Number(e.target.value) : 0,
                  })
                }
                className="w-36 text-xs font-mono font-bold p-2 rounded-lg border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-white dark:bg-[#0B1933] text-[#0B1933] dark:text-white"
              />
            </div>
          </div>

          {/* 1. RUBRO DEL COMERCIO Y PERFIL OPERATIVO COMPLETO */}
          <div className="p-4 rounded-xl bg-[#F4F6F9] dark:bg-[#091428] border border-[#CBD5E1] dark:border-[#B6C2D2]/20 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Store className="w-4 h-4 text-[#0B1933] dark:text-[#CBD5E1]" />
                <h4 className="text-xs font-bold text-[#0B1933] dark:text-white uppercase tracking-wider">
                  Rubro del Negocio y Perfil Operativo
                </h4>
              </div>
              <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-[#94A3B8]">
                Al cambiar de rubro se adaptan plazos, cuotas, alertas y tope sugerido
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {(Object.keys(RUBRO_PROFILES) as BusinessRubro[]).map((rk) => {
                const prof = RUBRO_PROFILES[rk];
                const isSelected = (currentConfig.businessRubro || 'distribuidora') === rk;
                return (
                  <button
                    key={rk}
                    type="button"
                    onClick={() => {
                      setCurrentConfig((prev) => applyRubroProfileToConfig(prev, rk));
                    }}
                    className={`text-left p-3 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#0B1933] text-white border-[#0B1933] dark:bg-[#162E59] dark:border-[#CBD5E1] shadow-sm'
                        : 'bg-white dark:bg-[#0B1933] text-slate-800 dark:text-[#E2E8F0] border-[#CBD5E1] dark:border-[#B6C2D2]/20 hover:border-[#0B1933]/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="text-xs font-bold">{prof.label}</span>
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                    </div>
                    <span
                      className={`inline-block mt-1 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${
                        isSelected
                          ? 'bg-white/15 text-[#E2E8F0]'
                          : 'bg-slate-100 dark:bg-[#071021] text-slate-600 dark:text-[#94A3B8]'
                      }`}
                    >
                      {prof.badgeTag}
                    </span>
                    <ul
                      className={`mt-1.5 space-y-0.5 text-[10px] ${
                        isSelected ? 'text-[#CBD5E1]' : 'text-slate-500 dark:text-[#94A3B8]'
                      }`}
                    >
                      {prof.featureBullets.slice(0, 2).map((b, idx) => (
                        <li key={idx}>• {b}</li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start pt-1">
              <div className="p-3 rounded-lg bg-white dark:bg-[#0B1933] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 text-[11px] space-y-1">
                <div className="font-bold text-[#0B1933] dark:text-white">
                  Perfil activo: {getRubroProfile(currentConfig.businessRubro || 'distribuidora').label}
                </div>
                <p className="text-slate-600 dark:text-[#CBD5E1]">
                  {getRubroProfile(currentConfig.businessRubro || 'distribuidora').description}
                </p>
                <div className="font-mono text-[10px] text-slate-500 dark:text-[#94A3B8] pt-1">
                  Plazo: {currentConfig.defaultTermDays}d · Alertas: {currentConfig.vendedorReminderDays}d /{' '}
                  {currentConfig.adminAlertDays}d · Tope sugerido:{' '}
                  {currentConfig.defaultClientCreditLimit
                    ? `${currentConfig.currencySymbol}${currentConfig.defaultClientCreditLimit.toLocaleString('es-AR')}`
                    : 'Sin tope'}
                </div>
              </div>

              <label className="flex items-start gap-2.5 p-3 rounded-lg bg-white dark:bg-[#0B1933] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 cursor-pointer">
                <input
                  type="checkbox"
                  checked={
                    currentConfig.enforceSinglePendingBoleta ??
                    (currentConfig.businessRubro || 'distribuidora') === 'distribuidora'
                  }
                  onChange={(e) =>
                    setCurrentConfig({
                      ...currentConfig,
                      enforceSinglePendingBoleta: e.target.checked,
                    })
                  }
                  className="mt-0.5 w-4 h-4 rounded text-[#0B1933] cursor-pointer"
                />
                <div>
                  <span className="text-xs font-bold text-[#0B1933] dark:text-white block">
                    Exigir 1 sola boleta pendiente a la vez por cliente
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-[#94A3B8]">
                    Activo en Mayorista / Distribuidora. En Indumentaria, Comercio o Cuenta Corriente se desactiva para permitir múltiples compras/cuotas simultáneas.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* 2. ALIAS Y DATOS BANCARIOS DEL COMERCIO PARA COBRARLE A CLIENTES */}
          <div className="p-4 rounded-xl bg-[#F4F6F9] dark:bg-[#091428] border border-[#CBD5E1] dark:border-[#B6C2D2]/20 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-[#0B1933] dark:text-[#CBD5E1]" />
                <h4 className="text-xs font-bold text-[#0B1933] dark:text-white uppercase tracking-wider">
                  Tu Alias / CBU para Cobrar a Tus Clientes (WhatsApp y Recibos)
                </h4>
              </div>
              <span className="text-[10px] text-slate-500 dark:text-[#94A3B8]">
                Se incluye automáticamente en estados de cuenta y recibos con saldo
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-600 dark:text-[#CBD5E1] block mb-1">
                  Alias de transferencia:
                </label>
                <input
                  type="text"
                  placeholder="ej. mi.comercio.mp"
                  value={currentConfig.merchantPaymentAlias || ''}
                  onChange={(e) =>
                    setCurrentConfig({ ...currentConfig, merchantPaymentAlias: e.target.value })
                  }
                  className="w-full text-xs font-mono font-bold p-2 rounded-lg border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-white dark:bg-[#0B1933] text-[#0B1933] dark:text-white"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-600 dark:text-[#CBD5E1] block mb-1">
                  Titular de la cuenta:
                </label>
                <input
                  type="text"
                  placeholder="ej. Juan Pérez"
                  value={currentConfig.merchantPaymentHolder || ''}
                  onChange={(e) =>
                    setCurrentConfig({ ...currentConfig, merchantPaymentHolder: e.target.value })
                  }
                  className="w-full text-xs p-2 rounded-lg border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-white dark:bg-[#0B1933] text-[#0B1933] dark:text-white"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-600 dark:text-[#CBD5E1] block mb-1">
                  Banco o Billetera:
                </label>
                <input
                  type="text"
                  placeholder="ej. Mercado Pago / Galicia"
                  value={currentConfig.merchantPaymentBank || ''}
                  onChange={(e) =>
                    setCurrentConfig({ ...currentConfig, merchantPaymentBank: e.target.value })
                  }
                  className="w-full text-xs p-2 rounded-lg border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-white dark:bg-[#0B1933] text-[#0B1933] dark:text-white"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-600 dark:text-[#CBD5E1] block mb-1">
                  CBU / CVU (opcional):
                </label>
                <input
                  type="text"
                  placeholder="00000031000..."
                  value={currentConfig.merchantPaymentCvu || ''}
                  onChange={(e) =>
                    setCurrentConfig({ ...currentConfig, merchantPaymentCvu: e.target.value })
                  }
                  className="w-full text-xs font-mono p-2 rounded-lg border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-white dark:bg-[#0B1933] text-[#0B1933] dark:text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-[11px] font-semibold text-slate-600 dark:text-[#CBD5E1] block mb-1">
                  Link fijo de Mercado Pago (opcional, para WhatsApp):
                </label>
                <input
                  type="url"
                  placeholder="https://link.mercadopago.com.ar/..."
                  value={currentConfig.merchantMpCheckoutLink || ''}
                  onChange={(e) =>
                    setCurrentConfig({ ...currentConfig, merchantMpCheckoutLink: e.target.value })
                  }
                  className="w-full text-xs font-mono p-2 rounded-lg border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-white dark:bg-[#0B1933] text-[#0B1933] dark:text-white"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-600 dark:text-[#CBD5E1] block mb-1">
                  Access Token Checkout Pro MP (acreditación automática con crédito/débito):
                </label>
                <input
                  type="password"
                  placeholder={
                    currentConfig.hasMerchantMpAccessToken
                      ? '•••••••• (Token configurado - escribir para reemplazar)'
                      : 'Ingresar credencial Checkout Pro MP (opcional)'
                  }
                  value={merchantMpTokenInput}
                  onChange={(e) => setMerchantMpTokenInput(e.target.value)}
                  className="w-full text-xs font-mono p-2 rounded-lg border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-white dark:bg-[#0B1933] text-[#0B1933] dark:text-white"
                />
              </div>
            </div>
            <p className="text-[10px] text-sky-700 dark:text-sky-300">
              Al abrir la ficha o cuenta de un cliente vas a poder hacer clic en <strong>«Enviar Link de Pago por WhatsApp»</strong>. Cuando pague con dinero en cuenta, crédito o débito, el sistema acredita el saldo y marca sus facturas como PAGADAS automáticamente.
            </p>
          </div>

          {/* 3. CUOTAS PERSONALES (2-6) & RECARGO OPCIONAL EN PLAZOS LARGOS */}
          <div className="p-4 rounded-xl bg-[#F4F6F9] dark:bg-[#091428] border border-[#CBD5E1] dark:border-[#B6C2D2]/20 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Percent className="w-4 h-4 text-[#0B1933] dark:text-[#CBD5E1]" />
                <h4 className="text-xs font-bold text-[#0B1933] dark:text-white uppercase tracking-wider">
                  Cuotas Personales y Recargo Opcional en Plazos Largos
                </h4>
              </div>
              <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                Mismo precio pagando en término (sin descuentos)
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-white dark:bg-[#0B1933] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 space-y-1.5">
                <label className="text-[11px] font-bold text-[#0B1933] dark:text-white block">
                  Interés base de respaldo en cuotas (2 a 12):
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="200"
                    step="0.5"
                    value={currentConfig.defaultInstallmentInterestPercent ?? 10}
                    onChange={(e) =>
                      setCurrentConfig({
                        ...currentConfig,
                        defaultInstallmentInterestPercent:
                          e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)),
                      })
                    }
                    className="w-24 text-xs font-mono font-bold p-2 rounded-lg border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-slate-50 dark:bg-[#071021] text-[#0B1933] dark:text-white"
                  />
                  <span className="text-xs font-bold text-slate-500">%</span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-[#94A3B8]">
                  Al cargar ventas en 2, 3, 4, 5, 6, 9 o 12 cuotas también se sugiere en vivo según la tasa vigente en Argentina (BCRA) y se puede ajustar libremente.
                </p>
              </div>

              <div className="md:col-span-2 p-3 rounded-lg bg-white dark:bg-[#0B1933] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(currentConfig.lateSurchargeEnabled)}
                    onChange={(e) =>
                      setCurrentConfig({
                        ...currentConfig,
                        lateSurchargeEnabled: e.target.checked,
                      })
                    }
                    className="w-4 h-4 rounded text-[#0B1933] cursor-pointer"
                  />
                  <span className="text-xs font-bold text-[#0B1933] dark:text-white">
                    Habilitar recargo opcional por mora en plazos largos o pagos incompletos
                  </span>
                </label>

                <div className="flex flex-wrap items-center gap-4 pl-6">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-600 dark:text-[#CBD5E1]">Recargo sugerido:</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      disabled={!currentConfig.lateSurchargeEnabled}
                      value={currentConfig.lateSurchargePercent ?? 5}
                      onChange={(e) =>
                        setCurrentConfig({
                          ...currentConfig,
                          lateSurchargePercent: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)),
                        })
                      }
                      className="w-16 text-xs font-mono font-bold p-1.5 rounded border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-slate-50 dark:bg-[#071021] text-[#0B1933] dark:text-white disabled:opacity-50"
                    />
                    <span className="text-xs font-bold text-slate-500">%</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-600 dark:text-[#CBD5E1]">Aplicar tras:</span>
                    <input
                      type="number"
                      min="1"
                      max="120"
                      disabled={!currentConfig.lateSurchargeEnabled}
                      value={currentConfig.lateSurchargeAfterDays ?? 15}
                      onChange={(e) =>
                        setCurrentConfig({
                          ...currentConfig,
                          lateSurchargeAfterDays: e.target.value === '' ? 15 : Math.max(1, Number(e.target.value)),
                        })
                      }
                      className="w-16 text-xs font-mono font-bold p-1.5 rounded border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-slate-50 dark:bg-[#071021] text-[#0B1933] dark:text-white disabled:opacity-50"
                    />
                    <span className="text-[11px] text-slate-500">días de vencimiento</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            {configSaved ? (
              <span className="text-xs font-bold text-emerald-600 flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4" />
                <span>¡Cambios guardados con éxito!</span>
              </span>
            ) : <span />}

            <button
              type="submit"
              className="px-6 py-2.5 bg-[#0B1933] hover:bg-[#162E59] dark:bg-[#E2E8F0] dark:hover:bg-white text-white dark:text-[#091428] text-xs font-bold rounded-xl flex items-center gap-2 cursor-pointer transition-colors"
            >
              <Save className="w-4 h-4" />
              <span>Guardar Todos los Ajustes</span>
            </button>
          </div>
        </form>
      </div>

      {/* Regla de Retención de 30 Días para Optimización de Almacenamiento / Base de Datos */}
      <div className="bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-950/60 rounded-2xl p-5 shadow-xs">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 mt-0.5">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Regla de Retención de 30 Días & Purga de Almacenamiento
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                  Activa (Automática)
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
                Para que la base de datos interna del dispositivo (IndexedDB) no acumule espacio ni sature memoria:
                <strong> Las boletas impagas NO se borran nunca</strong> (aunque tengan 45 o 60 días de atraso, asegurando el cobro en la calle).
                El plazo de 30 días corre <strong>exclusivamente desde el momento en que se marcan como pagadas</strong>, momento a partir del cual se depuran del historial.
              </p>
              <div className="mt-2 p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 text-[11px] text-emerald-900 dark:text-emerald-200 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Memoria Permanente de Clientes Problemáticos vs Confiables:</strong> El sistema evalúa continuamente a cada cliente en base a sus boletas activas y pagos tardíos, manteniendo su ficha de riesgo y calificación actualizada sin importar las depuraciones de espacio.
                </span>
              </div>
              <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
                <span>
                  Boletas purgadas históricamente: <strong className="text-indigo-600 font-bold">{config.totalPurgedBoletasCount || 0}</strong>
                </span>
                {config.lastRetentionPurgeDate && (
                  <span>
                    Última depuración: <strong className="text-slate-700 dark:text-slate-300">{config.lastRetentionPurgeDate}</strong>
                  </span>
                )}
              </div>
            </div>
          </div>

          {onExecuteRetentionPurge && (
            <button
              type="button"
              onClick={onExecuteRetentionPurge}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-xs shrink-0 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Database className="w-3.5 h-3.5" />
              <span>Ejecutar Depuración Ahora</span>
            </button>
          )}
        </div>
      </div>

      {/* Base de Datos Interna del Dispositivo (IndexedDB) y Copia de Seguridad Local */}
      <div className="bg-white dark:bg-[#0B1933] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 rounded-2xl p-5 shadow-2xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-[#0B1933] dark:bg-[#162E59] text-white shrink-0">
              <HardDrive className="w-5 h-5 text-sky-300" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-[#0B1933] dark:text-white">
                  Base de Datos Interna Local ({internalDbStatus?.engine || 'IndexedDB'})
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                  100% EN TU DISPOSITIVO · SIN NUBE
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-[#CBD5E1] max-w-2xl">
                Tu usuario, empresa, clientes, boletas y rendiciones se guardan en una base interna dentro de este navegador/dispositivo. Podés descargar un archivo de respaldo para guardarlo en tu PC o pasarlo a otro equipo.
              </p>
              {internalDbStatus && (
                <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] font-mono tabular-nums text-slate-500 dark:text-[#94A3B8]">
                  <span>Base: {internalDbStatus.dbName}</span>
                  <span>·</span>
                  <span>Registros: {internalDbStatus.recordCount}</span>
                  <span>·</span>
                  <span>Ocupado: {(internalDbStatus.usedBytes / 1024).toFixed(1)} KB</span>
                  {internalDbStatus.persisted && (
                    <>
                      <span>·</span>
                      <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                        Almacenamiento protegido
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                const info = downloadInternalDatabaseBackup('Respaldo_Cobranzas');
                setBackupFeedback({
                  type: 'ok',
                  text: `Copia descargada (${info.filename} · ${info.recordCount} registros).`,
                });
                getInternalDatabaseStatus().then(setInternalDbStatus).catch(() => {});
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0B1933] hover:bg-[#162E59] dark:bg-[#E2E8F0] dark:hover:bg-white text-white dark:text-[#091428] text-xs font-bold transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar Respaldo (.json)</span>
            </button>

            <input
              ref={backupInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                const content = await file.text();
                const res = await importInternalDatabaseBackup(content);
                if (res.success) {
                  setBackupFeedback({
                    type: 'ok',
                    text: `Base interna restaurada (${res.importedCount} registros, ${res.tenantsCount} empresa(s)). Recargando...`,
                  });
                  setTimeout(() => window.location.reload(), 900);
                } else {
                  setBackupFeedback({
                    type: 'err',
                    text: res.error || 'No se pudo importar el archivo.',
                  });
                }
              }}
            />
            <button
              type="button"
              onClick={() => backupInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#F4F6F9] hover:bg-[#E2E8F0] dark:bg-[#13264A] dark:hover:bg-[#1B3566] text-[#0B1933] dark:text-[#E2E8F0] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 text-xs font-bold transition-colors cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Restaurar Respaldo</span>
            </button>
          </div>
        </div>

        {backupFeedback && (
          <div
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold border ${
              backupFeedback.type === 'ok'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700/50 text-emerald-800 dark:text-emerald-300'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-700/50 text-rose-800 dark:text-rose-300'
            }`}
          >
            {backupFeedback.text}
          </div>
        )}
      </div>

      {/* Danger Zone */}
      <div className="p-4 rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50/30 dark:bg-rose-950/20 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h4 className="text-xs font-bold text-rose-900 dark:text-rose-300">
            Vaciar Registros Operativos
          </h4>
          <p className="text-[11px] text-slate-500">
            Elimina boletas, clientes, vendedores e historial de esta empresa manteniendo tu configuración
          </p>
        </div>
        {confirmResetData ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                onResetOperationalData();
                setConfirmResetData(false);
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white cursor-pointer"
            >
              Confirmar Vaciado
            </button>
            <button
              type="button"
              onClick={() => setConfirmResetData(false)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmResetData(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-rose-700 hover:bg-rose-100 border border-rose-300 dark:text-rose-300 dark:border-rose-800 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Vaciar Registros</span>
          </button>
        )}
      </div>

      {/* MODAL EDIT / CREATE ADMIN */}
      {isEditingAdmin && editingAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <h3 className="font-bold text-slate-900 dark:text-white text-base mb-4 border-b pb-2">
              {editingAdmin.name ? 'Editar Administrador / Usuario' : 'Nuevo Administrador / Usuario'}
            </h3>

            <form onSubmit={handleSaveAdminForm} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Nombre Completo:
                </label>
                <input
                  type="text"
                  placeholder="Ej. Federico Roa"
                  value={editingAdmin.name || ''}
                  onChange={(e) => setEditingAdmin({ ...editingAdmin, name: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Teléfono / WhatsApp para recibir alertas:
                </label>
                <input
                  type="text"
                  placeholder="+54 9 11 3290-8811"
                  value={editingAdmin.phone || ''}
                  onChange={(e) => setEditingAdmin({ ...editingAdmin, phone: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Correo Electrónico:
                </label>
                <input
                  type="email"
                  placeholder="admin@distribuidora.com"
                  value={editingAdmin.email || ''}
                  onChange={(e) => setEditingAdmin({ ...editingAdmin, email: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Rol:
                  </label>
                  <select
                    value={editingAdmin.role || 'administrador'}
                    onChange={(e) => setEditingAdmin({ ...editingAdmin, role: e.target.value as any })}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-medium"
                  >
                    <option value="dueño">Dueño / Titular</option>
                    <option value="administrador">Administrador</option>
                    <option value="finanzas">Finanzas / Caja</option>
                  </select>
                </div>

                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={Boolean(editingAdmin.isGeneralAdmin)}
                      onChange={(e) =>
                        setEditingAdmin({ ...editingAdmin, isGeneralAdmin: e.target.checked })
                      }
                      className="rounded text-amber-600"
                    />
                    <span>Admin General</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsEditingAdmin(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-lg"
                >
                  Guardar Administrador
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
