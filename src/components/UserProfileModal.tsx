import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  Mail,
  Phone,
  Eye,
  EyeOff,
  CheckCircle2,
  KeyRound,
  ShieldCheck,
  Sparkles,
  Store,
  Check,
  Wallet,
  Link2,
  Lock,
} from 'lucide-react';
import { BusinessRubro, DistributorConfig, PlatformUser } from '../types';
import { updatePlatformUser } from '../utils/multiTenantStorage';
import { RUBRO_PROFILES, getRubroProfile } from '../utils/businessMode';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: PlatformUser | null;
  config?: DistributorConfig;
  onUpdateUser: (updated: PlatformUser) => void;
  onChangeBusinessRubro?: (nextRubro: BusinessRubro) => void;
  onUpdatePaymentConfig?: (patch: Partial<DistributorConfig>) => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  config,
  onUpdateUser,
  onChangeBusinessRubro,
  onUpdatePaymentConfig,
}) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [selectedRubro, setSelectedRubro] = useState<BusinessRubro>(
    config?.businessRubro || 'distribuidora'
  );

  // Merchant bank / Mercado Pago receiving account fields
  const [merchantAlias, setMerchantAlias] = useState('');
  const [merchantCvu, setMerchantCvu] = useState('');
  const [merchantBank, setMerchantBank] = useState('Mercado Pago');
  const [merchantHolder, setMerchantHolder] = useState('');
  const [merchantMpCheckoutLink, setMerchantMpCheckoutLink] = useState('');
  const [merchantMpTokenInput, setMerchantMpTokenInput] = useState('');

  // Password change fields
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPass, setShowNewPass] = useState(false);

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSwitchRubro = Boolean(
    currentUser &&
      currentUser.role !== 'superadmin' &&
      onChangeBusinessRubro &&
      config
  );
  const canEditMerchantBanking = Boolean(
    currentUser && currentUser.role !== 'superadmin' && config && onUpdatePaymentConfig
  );

  useEffect(() => {
    if (currentUser) {
      setFullName(currentUser.fullName || '');
      setEmail(currentUser.email || '');
      setPhone(currentUser.phone || '');
      setUsername(currentUser.username || '');
      setSelectedRubro(config?.businessRubro || 'distribuidora');
      setMerchantAlias(config?.merchantPaymentAlias || '');
      setMerchantCvu(config?.merchantPaymentCvu || '');
      setMerchantBank(config?.merchantPaymentBank || 'Mercado Pago');
      setMerchantHolder(config?.merchantPaymentHolder || currentUser.fullName || '');
      setMerchantMpCheckoutLink(config?.merchantMpCheckoutLink || '');
      setMerchantMpTokenInput('');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setFeedback(null);
    }
  }, [currentUser, config?.businessRubro, config?.merchantPaymentAlias, isOpen]);

  if (!isOpen || !currentUser) return null;

  const activeRubroProfile = getRubroProfile(selectedRubro);
  const initialRubro = config?.businessRubro || 'distribuidora';
  const rubroChanged = canSwitchRubro && selectedRubro !== initialRubro;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!fullName.trim()) {
      setFeedback({ type: 'error', message: 'El nombre completo es requerido.' });
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setFeedback({ type: 'error', message: 'Por favor ingrese un correo electrónico válido.' });
      return;
    }
    if (!phone.trim()) {
      setFeedback({ type: 'error', message: 'Por favor ingrese un teléfono o WhatsApp de contacto.' });
      return;
    }

    const wantsToChangePassword = newPassword.trim().length > 0;
    if (wantsToChangePassword) {
      if (newPassword.length < 4) {
        setFeedback({ type: 'error', message: 'La nueva contraseña debe tener al menos 4 caracteres.' });
        return;
      }
      if (newPassword !== confirmPassword) {
        setFeedback({ type: 'error', message: 'La nueva contraseña y su confirmación no coinciden.' });
        return;
      }
      if (currentPassword && currentPassword !== currentUser.password) {
        setFeedback({ type: 'error', message: 'La contraseña actual ingresada es incorrecta.' });
        return;
      }
    }

    setIsSubmitting(true);

    const updates: Partial<Omit<PlatformUser, 'id'>> = {
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      username: username.trim(),
    };

    if (wantsToChangePassword) {
      updates.password = newPassword.trim();
    }

    const updated = updatePlatformUser(currentUser.id, updates);

    if (canEditMerchantBanking && onUpdatePaymentConfig) {
      let hasToken = Boolean(config?.hasMerchantMpAccessToken);
      if (merchantMpTokenInput.trim()) {
        try {
          const tokRes = await fetch('/api/merchant/mp-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tenantId: config?.tenantId || currentUser.tenantId || 'default-tenant',
              mpAccessToken: merchantMpTokenInput.trim(),
            }),
          });
          const tokData = await tokRes.json();
          if (tokData.success) {
            hasToken = Boolean(tokData.hasMerchantMpAccessToken);
          }
        } catch {
          // ignore network error gracefully
        }
      }

      onUpdatePaymentConfig({
        merchantPaymentAlias: merchantAlias.trim(),
        merchantPaymentCvu: merchantCvu.trim(),
        merchantPaymentBank: merchantBank.trim() || 'Mercado Pago',
        merchantPaymentHolder: merchantHolder.trim() || fullName.trim(),
        merchantMpCheckoutLink: merchantMpCheckoutLink.trim(),
        hasMerchantMpAccessToken: hasToken,
      });
    }

    if (rubroChanged && onChangeBusinessRubro) {
      onChangeBusinessRubro(selectedRubro);
    }

    setIsSubmitting(false);

    if (updated) {
      onUpdateUser(updated);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMerchantMpTokenInput('');
      if (rubroChanged) {
        onClose();
        return;
      }
      setFeedback({
        type: 'success',
        message: wantsToChangePassword
          ? '¡Perfil y contraseña actualizados exitosamente!'
          : '¡Datos, cuenta de cobro y perfil guardados correctamente!',
      });
      setTimeout(() => {
        onClose();
      }, 1300);
    } else {
      setFeedback({ type: 'error', message: 'No se pudo actualizar el perfil.' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white dark:bg-[#0B1933] rounded-3xl shadow-2xl border border-slate-200 dark:border-[#B6C2D2]/25 overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 dark:border-[#B6C2D2]/15 flex items-center justify-between bg-slate-50/70 dark:bg-[#091428]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#0B1933] dark:bg-[#162E59] text-white flex items-center justify-center font-bold border border-[#B6C2D2]/25">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-base text-slate-900 dark:text-white flex items-center gap-2">
                <span>Mi Perfil, Rubro y Seguridad</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-[#94A3B8]">
                Editá tus datos, contraseña o cambiá el rubro operativo de tu cuenta sobre la marcha
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
          {feedback && (
            <div
              className={`p-3.5 rounded-2xl text-xs font-semibold flex items-center gap-2.5 ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800'
                  : 'bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-800'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{feedback.message}</span>
            </div>
          )}

          {/* User role & tenant badge */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl bg-slate-50 dark:bg-[#091428] border border-slate-200/70 dark:border-[#B6C2D2]/20 text-xs">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span className="font-bold text-slate-700 dark:text-[#E2E8F0] capitalize">
                Rol: {currentUser.role}
              </span>
              {canSwitchRubro && (
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-[#E9EEF5] dark:bg-[#162E59] text-[#0B1933] dark:text-[#CBD5E1]">
                  Rubro: {activeRubroProfile.shortLabel}
                </span>
              )}
            </div>
            {currentUser.tenantCode && (
              <span className="font-mono font-bold px-2 py-0.5 rounded bg-slate-200 dark:bg-[#13264A] text-slate-800 dark:text-slate-200 text-[11px]">
                ID: {currentUser.tenantCode}
              </span>
            )}
          </div>

          {/* Section 0: Rubro / Perfil Operativo (Sobre la marcha) */}
          {canSwitchRubro && (
            <div className="space-y-3 p-4 rounded-2xl bg-[#F4F6F9] dark:bg-[#091428] border border-[#CBD5E1] dark:border-[#B6C2D2]/25">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h4 className="text-xs font-black uppercase text-[#0B1933] dark:text-white tracking-wider flex items-center gap-1.5">
                  <Store className="w-4 h-4 text-[#162E59] dark:text-[#CBD5E1]" />
                  <span>Rubro y Perfil Operativo (Cambio sobre la marcha)</span>
                </h4>
                {rubroChanged && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-700/50">
                    Nuevo perfil seleccionado · Guardar para aplicar
                  </span>
                )}
              </div>

              <p className="text-[11px] text-slate-600 dark:text-[#94A3B8] leading-relaxed">
                Cada rubro cambia por completo cómo trabaja el sistema: regla de 1 factura por persona vs múltiples compras, cuotas con interés, señas, canasto por producto, plazos y tope en pesos.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(Object.keys(RUBRO_PROFILES) as BusinessRubro[]).map((rubroKey) => {
                  const prof = RUBRO_PROFILES[rubroKey];
                  const isSel = selectedRubro === rubroKey;
                  return (
                    <button
                      key={rubroKey}
                      type="button"
                      onClick={() => setSelectedRubro(rubroKey)}
                      className={`text-left p-3 rounded-xl border transition-all cursor-pointer ${
                        isSel
                          ? 'bg-[#0B1933] text-white border-[#0B1933] dark:bg-[#162E59] dark:border-[#CBD5E1] shadow-sm'
                          : 'bg-white dark:bg-[#071021] text-slate-800 dark:text-[#E2E8F0] border-slate-200 dark:border-[#B6C2D2]/20 hover:border-slate-400 dark:hover:border-[#CBD5E1]/50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-xs font-bold leading-tight">{prof.label}</span>
                        {isSel && (
                          <span className="w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
                            <Check className="w-2.5 h-2.5" />
                          </span>
                        )}
                      </div>
                      <span
                        className={`inline-block mt-1 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${
                          isSel
                            ? 'bg-white/15 text-[#E2E8F0]'
                            : 'bg-slate-100 dark:bg-[#0B1933] text-slate-600 dark:text-[#94A3B8]'
                        }`}
                      >
                        {prof.badgeTag}
                      </span>
                      <p
                        className={`text-[10px] mt-1 leading-snug ${
                          isSel ? 'text-[#CBD5E1]' : 'text-slate-500 dark:text-[#94A3B8]'
                        }`}
                      >
                        {prof.featureBullets[0]}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Active selected profile live spec */}
              <div className="p-3 rounded-xl bg-white dark:bg-[#0B1933] border border-[#CBD5E1] dark:border-[#B6C2D2]/20 space-y-1.5 text-[11px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-[#0B1933] dark:text-white">
                    Reglas del perfil «{activeRubroProfile.shortLabel}»:
                  </span>
                  <span className="font-mono text-[10px] text-slate-500 dark:text-[#94A3B8] tabular-nums">
                    Plazo habitual: {activeRubroProfile.defaultTermDays}d · Alertas:{' '}
                    {activeRubroProfile.defaultVendedorReminderDays}d / {activeRubroProfile.defaultAdminAlertDays}d
                  </span>
                </div>
                <ul className="space-y-0.5 text-slate-600 dark:text-[#CBD5E1]">
                  {activeRubroProfile.featureBullets.map((bullet, i) => (
                    <li key={i} className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Section 1: Datos Personales */}
          <div className="space-y-3.5">
            <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-indigo-500" />
              <span>Datos Personales y de Contacto</span>
            </h4>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Nombre y Apellido Completo:
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ej. Roberto Gómez"
                required
                className="w-full text-xs p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071021] text-slate-900 dark:text-white font-medium"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Correo Electrónico (Para Recuperación):
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Mail className="w-3.5 h-3.5" />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="micorreo@gmail.com"
                    required
                    className="w-full text-xs pl-9 pr-3 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071021] text-slate-900 dark:text-white font-medium"
                  />
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Con este mail podrás recuperar tu acceso en caso de olvido.
                </span>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Teléfono / WhatsApp Personal:
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Phone className="w-3.5 h-3.5" />
                  </div>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+54 9 11 1234-5678"
                    required
                    className="w-full text-xs pl-9 pr-3 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071021] text-slate-900 dark:text-white font-mono"
                  />
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Línea para alertas de cobranzas y códigos de seguridad.
                </span>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Nombre de Usuario (Para Iniciar Sesión):
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="ej. roberto_central"
                required
                className="w-full text-xs p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071021] text-slate-900 dark:text-white font-mono"
              />
            </div>
          </div>

          {/* Section 1B: Alias / Cuenta Bancaria / Mercado Pago para Links de Pago a Clientes */}
          {canEditMerchantBanking && (
            <div className="space-y-3 p-4 rounded-2xl bg-[#F4F6F9] dark:bg-[#091428] border border-sky-200 dark:border-sky-500/30">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h4 className="text-xs font-black uppercase text-[#0B1933] dark:text-white tracking-wider flex items-center gap-1.5">
                  <Wallet className="w-4 h-4 text-[#009EE3]" />
                  <span>Cuenta Bancaria / Mercado Pago (Links de Cobro a Clientes)</span>
                </h4>
                <span className="text-[10px] font-semibold text-sky-700 dark:text-sky-300">
                  Acreditación inmediata + marcado automático como PAGA
                </span>
              </div>

              <p className="text-[11px] text-slate-600 dark:text-[#94A3B8] leading-relaxed">
                Cargá tu Alias (ideal Mercado Pago) y CVU para enviar Links de Pago por WhatsApp desde la cuenta de cualquier cliente. Tus clientes podrán pagarte con dinero en cuenta, crédito o débito, y al acreditarse la factura se marca como pagada automáticamente.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-[#CBD5E1] block mb-1">
                    Alias de Mercado Pago / Banco:
                  </label>
                  <input
                    type="text"
                    value={merchantAlias}
                    onChange={(e) => setMerchantAlias(e.target.value)}
                    placeholder="ej. mi.comercio.mp"
                    className="w-full text-xs font-mono font-bold p-2.5 rounded-xl border border-slate-300 dark:border-[#B6C2D2]/25 bg-white dark:bg-[#071021] text-[#0B1933] dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-[#CBD5E1] block mb-1">
                    CVU / CBU:
                  </label>
                  <input
                    type="text"
                    value={merchantCvu}
                    onChange={(e) => setMerchantCvu(e.target.value)}
                    placeholder="00000031000..."
                    className="w-full text-xs font-mono p-2.5 rounded-xl border border-slate-300 dark:border-[#B6C2D2]/25 bg-white dark:bg-[#071021] text-[#0B1933] dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-[#CBD5E1] block mb-1">
                    Billetera / Banco receptor:
                  </label>
                  <input
                    type="text"
                    value={merchantBank}
                    onChange={(e) => setMerchantBank(e.target.value)}
                    placeholder="Mercado Pago"
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 dark:border-[#B6C2D2]/25 bg-white dark:bg-[#071021] text-[#0B1933] dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-[#CBD5E1] block mb-1">
                    Titular de la cuenta:
                  </label>
                  <input
                    type="text"
                    value={merchantHolder}
                    onChange={(e) => setMerchantHolder(e.target.value)}
                    placeholder="Nombre y Apellido"
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 dark:border-[#B6C2D2]/25 bg-white dark:bg-[#071021] text-[#0B1933] dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-[#CBD5E1] mb-1 flex items-center gap-1">
                    <Link2 className="w-3 h-3 text-[#009EE3]" />
                    <span>Link fijo de Mercado Pago (opcional):</span>
                  </label>
                  <input
                    type="url"
                    value={merchantMpCheckoutLink}
                    onChange={(e) => setMerchantMpCheckoutLink(e.target.value)}
                    placeholder="https://link.mercadopago.com.ar/..."
                    className="w-full text-xs font-mono p-2.5 rounded-xl border border-slate-300 dark:border-[#B6C2D2]/25 bg-white dark:bg-[#071021] text-[#0B1933] dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-[#CBD5E1] mb-1 flex items-center gap-1">
                    <Lock className="w-3 h-3 text-amber-500" />
                    <span>Access Token Checkout Pro MP (opcional):</span>
                  </label>
                  <input
                    type="password"
                    value={merchantMpTokenInput}
                    onChange={(e) => setMerchantMpTokenInput(e.target.value)}
                    placeholder={
                      config?.hasMerchantMpAccessToken
                        ? '•••••••• (Configurado - escribir para cambiar)'
                        : 'Credencial Checkout Pro (para links MP dinámicos)'
                    }
                    className="w-full text-xs font-mono p-2.5 rounded-xl border border-slate-300 dark:border-[#B6C2D2]/25 bg-white dark:bg-[#071021] text-[#0B1933] dark:text-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Section 2: Cambiar Contraseña */}
          <div className="space-y-3.5 pt-3 border-t border-slate-100 dark:border-[#B6C2D2]/15">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-amber-500" />
                <span>Cambiar Contraseña</span>
              </h4>
              <span className="text-[11px] text-slate-400">Dejar en blanco si no desea cambiarla</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Nueva Contraseña:
                </label>
                <div className="relative">
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo 4 caracteres"
                    className="w-full text-xs pl-3 pr-9 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071021] text-slate-900 dark:text-white font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass(!showNewPass)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200"
                  >
                    {showNewPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Confirmar Nueva Contraseña:
                </label>
                <input
                  type={showNewPass ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repetir nueva clave"
                  className="w-full text-xs p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071021] text-slate-900 dark:text-white font-mono"
                />
              </div>
            </div>

            {newPassword && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-900/40 text-[11px] text-amber-800 dark:text-amber-300 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span>
                  Tu nueva contraseña se guardará de inmediato y podrás cambiarla cuantas veces lo requieras.
                </span>
              </div>
            )}
          </div>

          {/* Submit */}
          <div className="pt-3 border-t border-slate-100 dark:border-[#B6C2D2]/15 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-xl bg-[#0B1933] dark:bg-white text-white dark:text-[#091428] text-xs font-black shadow-md hover:opacity-90 active:scale-98 transition-all disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting
                ? 'Guardando...'
                : rubroChanged
                ? 'Guardar Cambios y Aplicar Rubro'
                : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
