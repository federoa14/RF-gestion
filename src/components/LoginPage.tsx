import React, { useState } from 'react';
import {
  Lock,
  User,
  KeyRound,
  Eye,
  EyeOff,
  Building2,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Mail,
  X,
  Send,
  Phone,
  MapPin,
  UserPlus,
  Calendar,
  Headphones,
  Database,
  Upload,
  FileText,
  ShieldCheck,
} from 'lucide-react';
import { PlatformUser, Tenant, BusinessRubro } from '../types';
import { RUBRO_PROFILES } from '../utils/businessMode';
import { ContactChannelsModal } from './ContactChannelsModal';
import { TermsConditionsModal, TermsConditionsScrollBox } from './TermsConditionsModal';
import { TERMS_VERSION } from '../utils/termsAndConditions';
import {
  authenticateUser,
  requestPasswordReset,
  completePasswordReset,
  registerSelfServiceTrialTenant,
} from '../utils/multiTenantStorage';

interface LoginPageProps {
  onLoginSuccess: (user: PlatformUser, tenant?: Tenant) => void;
}

const PROVINCIAS_ARG = [
  'Buenos Aires',
  'Ciudad Autónoma de Buenos Aires',
  'Catamarca',
  'Chaco',
  'Chubut',
  'Córdoba',
  'Corrientes',
  'Entre Ríos',
  'Formosa',
  'Jujuy',
  'La Pampa',
  'La Rioja',
  'Mendoza',
  'Misiones',
  'Neuquén',
  'Río Negro',
  'Salta',
  'San Juan',
  'San Luis',
  'Santa Cruz',
  'Santa Fe',
  'Santiago del Estero',
  'Tierra del Fuego',
  'Tucumán',
  'Otra / Internacional',
];

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [authMode, setAuthMode] = useState<'login' | 'register'>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('trial') === '1' || params.get('register') === '1') {
        return 'register';
      }
    }
    return 'login';
  });

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [tenantCode, setTenantCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 30-Day Free Trial Self-Registration State
  const [regBusinessRubro, setRegBusinessRubro] = useState<BusinessRubro>('distribuidora');
  const [regCompanyName, setRegCompanyName] = useState('');
  const [regOwnerName, setRegOwnerName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regCity, setRegCity] = useState('');
  const [regProvince, setRegProvince] = useState('Buenos Aires');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [regAcceptedTerms, setRegAcceptedTerms] = useState(false);
  const [showInlineTermsPreview, setShowInlineTermsPreview] = useState(false);
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);

  // Password Recovery Modal State
  // Si el usuario vuelve desde el link del email de recuperación, se abre directo el paso 2
  const cameFromRecoveryLink =
    typeof window !== 'undefined' &&
    (window.location.hash.includes('type=recovery') || new URLSearchParams(window.location.search).has('recuperar'));
  const [isRecoveryOpen, setIsRecoveryOpen] = useState(cameFromRecoveryLink);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryStep, setRecoveryStep] = useState<1 | 2>(cameFromRecoveryLink ? 2 : 1);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoverySuccess, setRecoverySuccess] = useState<string | null>(null);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isContactChannelsOpen, setIsContactChannelsOpen] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!username.trim()) {
      setErrorMsg('Por favor ingrese su nombre de usuario o correo.');
      return;
    }
    if (!password.trim()) {
      setErrorMsg('Por favor ingrese su clave o contraseña.');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await authenticateUser(username, password, tenantCode);
      setIsSubmitting(false);

      if (result.success && result.user) {
        onLoginSuccess(result.user, result.tenant);
      } else {
        setErrorMsg(result.error || 'Credenciales inválidas.');
      }
    } catch {
      setIsSubmitting(false);
      setErrorMsg('No se pudo verificar las credenciales. Intentá nuevamente.');
    }
  };

  const handleRegisterTrialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError(null);

    if (!regCompanyName.trim()) {
      setRegError('Ingresá el nombre de tu distribuidora o empresa.');
      return;
    }
    if (!regOwnerName.trim()) {
      setRegError('Ingresá el nombre del titular o responsable.');
      return;
    }
    if (!regUsername.trim() || regUsername.trim().length < 3) {
      setRegError('El usuario de acceso debe tener al menos 3 caracteres.');
      return;
    }
    if (!regPassword.trim() || regPassword.trim().length < 6) {
      setRegError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (!regEmail.trim() || !regEmail.includes('@')) {
      setRegError('Ingresá un correo electrónico válido: lo vas a necesitar para confirmar la cuenta y recuperar tu clave.');
      return;
    }
    if (!regAcceptedTerms) {
      setRegError('Debés leer y aceptar los Términos y Condiciones de Uso y Manejo para crear tu cuenta.');
      return;
    }

    setIsRegistering(true);
    try {
      const res = await registerSelfServiceTrialTenant({
        companyName: regCompanyName,
        ownerName: regOwnerName,
        phone: regPhone,
        email: regEmail,
        username: regUsername,
        password: regPassword,
        city: regCity,
        province: regProvince,
        businessRubro: regBusinessRubro,
        acceptedTerms: true,
        termsAcceptedAt: new Date().toISOString(),
        termsVersion: TERMS_VERSION,
      });

      if (!res.success || !res.user || !res.tenant) {
        setIsRegistering(false);
        setRegError(res.error || 'No se pudo completar el alta de prueba.');
        return;
      }

      setIsRegistering(false);
      onLoginSuccess(res.user, res.tenant);
    } catch {
      setIsRegistering(false);
      setRegError('No se pudo completar el alta de prueba.');
    }
  };

  // Paso 1: enviar el email con el link de recuperación (Supabase Auth)
  const handleRequestRecoveryCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryError(null);
    setRecoverySuccess(null);

    const cleanEmail = recoveryEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setRecoveryError('Ingresá un correo electrónico válido.');
      return;
    }

    setIsSendingCode(true);
    const res = await requestPasswordReset(cleanEmail);
    setIsSendingCode(false);
    if (!res.success) {
      setRecoveryError(res.error || 'No se pudo enviar el correo de recuperación.');
      return;
    }
    // Por seguridad no se informa si el email existe o no
    setRecoverySuccess(
      `Si ${cleanEmail} tiene una cuenta, te llega un correo con un link para crear una nueva contraseña. Revisá también la carpeta de spam.`
    );
  };

  // Paso 2: el usuario volvió desde el link del correo y elige la nueva contraseña
  const handleConfirmPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryError(null);

    if (newPassword.trim().length < 6) {
      setRecoveryError('La nueva contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setRecoveryError('Las contraseñas no coinciden.');
      return;
    }

    const res = await completePasswordReset(newPassword.trim());
    if (res.success) {
      setRecoverySuccess('Contraseña actualizada. Ya podés iniciar sesión con la nueva clave.');
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
      setTimeout(() => {
        setIsRecoveryOpen(false);
        setRecoveryStep(1);
        setRecoveryEmail('');
        setNewPassword('');
        setConfirmPassword('');
        setRecoverySuccess(null);
      }, 2200);
    } else {
      setRecoveryError(res.error || 'El link de recuperación venció. Pedí uno nuevo.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#060E1D] via-[#0A172E] to-[#071021] flex flex-col justify-center items-center px-4 py-8 relative overflow-hidden">
      {/* Main Container */}
      <div className={`w-full relative z-10 transition-all ${authMode === 'register' ? 'max-w-lg' : 'max-w-md'}`}>
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex mb-3.5">
            <div className="w-20 h-20 rounded-[20px] overflow-hidden border border-[#B6C2D2]/50 shadow-2xl bg-[#071021] flex items-center justify-center">
              <img
                src="/assets/aistudio/file_0000000080a8820e83e95938baa4fbe8_5866e787.png"
                alt="Logo de la Empresa"
                className="w-full h-full object-cover scale-[1.06]"
              />
            </div>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">
            Gestión Comercial Pro
          </h1>
          <p className="text-xs sm:text-sm text-[#94A3B8] mt-1">
            Control de Boletas Fiadas, Prórrogas y Cobranzas para Distribuidoras
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-[#0B1933]/95 border border-[#B6C2D2]/25 rounded-2xl p-6 sm:p-7 shadow-2xl">
          {/* Mode Switcher: Login vs 30-Day Free Trial */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#071021] border border-[#B6C2D2]/20 rounded-xl mb-5">
            <button
              type="button"
              onClick={() => {
                setAuthMode('login');
                setRegError(null);
              }}
              className={`py-2 px-3 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                authMode === 'login'
                  ? 'bg-[#E2E8F0] text-[#091428]'
                  : 'text-[#94A3B8] hover:text-white'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Iniciar Sesión</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setAuthMode('register');
                setErrorMsg(null);
              }}
              className={`py-2 px-3 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                authMode === 'register'
                  ? 'bg-[#E2E8F0] text-[#091428]'
                  : 'text-[#94A3B8] hover:text-white'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Prueba 30 Días Gratis</span>
            </button>
          </div>

          {authMode === 'login' ? (
            <>
              <div className="mb-5 pb-4 border-b border-[#B6C2D2]/15">
                <h2 className="text-base font-bold text-white">Iniciar Sesión</h2>
                <p className="text-xs text-[#94A3B8] mt-0.5">
                  Ingresá con tu usuario o correo para acceder al panel privado de tu distribuidora
                </p>
              </div>

              {errorMsg && (
                <div className="mb-4 p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{errorMsg}</span>
                </div>
              )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username / Email */}
            <div>
              <label className="text-xs font-semibold text-[#CBD5E1] block mb-1.5">
                Usuario o Correo Electrónico
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#8D9CB0]">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Usuario o correo electrónico"
                  required
                  className="w-full pl-10 pr-3.5 py-2.5 bg-[#071021] border border-[#B6C2D2]/25 rounded-xl text-sm text-white placeholder-[#64748B] focus:outline-hidden focus:ring-2 focus:ring-[#CBD5E1]/60 focus:border-[#CBD5E1] transition-all"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-[#CBD5E1] block">
                  Contraseña
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setIsRecoveryOpen(true);
                    setRecoveryEmail(username.includes('@') ? username : '');
                    setRecoveryStep(1);
                    setRecoveryError(null);
                    setRecoverySuccess(null);
                  }}
                  className="text-[11px] text-[#CBD5E1] hover:text-white hover:underline transition-colors cursor-pointer"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#8D9CB0]">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-10 pr-10 py-2.5 bg-[#071021] border border-[#B6C2D2]/25 rounded-xl text-sm text-white placeholder-[#64748B] focus:outline-hidden focus:ring-2 focus:ring-[#CBD5E1]/60 focus:border-[#CBD5E1] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#8D9CB0] hover:text-white transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Optional Tenant Code / ID */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-[#CBD5E1] flex items-center gap-1.5">
                  <span>Código de Distribuidora</span>
                  <span className="text-[11px] text-[#8D9CB0] font-normal">(Opcional)</span>
                </label>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#8D9CB0]">
                  <Building2 className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={tenantCode}
                  onChange={(e) => setTenantCode(e.target.value.toUpperCase())}
                  placeholder="Código de empresa (opcional)"
                  className="w-full pl-10 pr-3.5 py-2.5 bg-[#071021] border border-[#B6C2D2]/25 rounded-xl text-sm text-white placeholder-[#64748B] uppercase tracking-wider focus:outline-hidden focus:ring-2 focus:ring-[#CBD5E1]/60 focus:border-[#CBD5E1] transition-all font-mono"
                />
              </div>
              <p className="text-[11px] text-[#8D9CB0] mt-1">
                Si entrás con tu usuario (sin email), completá el código de tu empresa.
              </p>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 px-4 rounded-xl bg-[#E2E8F0] hover:bg-white text-[#091428] font-bold text-sm shadow-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50 mt-2 cursor-pointer"
            >
              <span>{isSubmitting ? 'Verificando acceso...' : 'Ingresar al Sistema'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
            </>
          ) : (
            <>
              <div className="mb-4 pb-3.5 border-b border-[#B6C2D2]/15">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h2 className="text-base font-bold text-white">Crear Cuenta · 30 Días Gratis</h2>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-500/35">
                    30 DÍAS DE PRUEBA
                  </span>
                </div>
                <p className="text-xs text-[#94A3B8] mt-1">
                  Creá tu perfil al instante y usá el Plan 2 (gestión + página web con hasta 5 rubros y 50 artículos) durante 30 días sin cargo. Al cumplirse los 30 días podés bajar al Plan 1, mantener el Plan 2 o subir al Plan 3, o pausar la cuenta.
                </p>
              </div>

              <div className="mb-4 p-3 rounded-xl bg-[#0F2142] border border-[#B6C2D2]/25 flex items-center gap-2.5 text-xs text-[#E2E8F0]">
                <Calendar className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  Activación inmediata: tu cuenta figura como <strong>A Prueba (30 días)</strong> y al vencer podrás generar el pago por Mercado Pago o transferencia.
                </span>
              </div>

              {regError && (
                <div className="mb-4 p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{regError}</span>
                </div>
              )}

              <form onSubmit={handleRegisterTrialSubmit} className="space-y-3.5">
                {/* Selector de Rubro Comercial */}
                <div>
                  <label className="text-xs font-semibold text-[#CBD5E1] block mb-1.5">
                    ¿Cuál es el rubro de tu negocio? *
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(Object.keys(RUBRO_PROFILES) as BusinessRubro[]).map((rubroKey) => {
                      const prof = RUBRO_PROFILES[rubroKey];
                      const isSelected = regBusinessRubro === rubroKey;
                      return (
                        <button
                          key={rubroKey}
                          type="button"
                          onClick={() => setRegBusinessRubro(rubroKey)}
                          className={`text-left p-2.5 rounded-xl border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-[#12264D] border-[#CBD5E1] ring-1 ring-[#CBD5E1]/40'
                              : 'bg-[#071021]/80 border-[#B6C2D2]/20 hover:border-[#CBD5E1]/45'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="text-xs font-bold text-white">{prof.label}</span>
                            {isSelected && (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            )}
                          </div>
                          <span className="inline-block mt-1 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-[#091428] text-[#CBD5E1] border border-[#B6C2D2]/20">
                            {prof.badgeTag}
                          </span>
                          <p className="text-[10px] text-[#94A3B8] mt-1 leading-snug">
                            {prof.featureBullets[0]}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-2 p-2.5 rounded-xl bg-[#071021]/90 border border-[#B6C2D2]/20 text-[10px] text-[#CBD5E1] space-y-0.5">
                    <div className="font-bold text-white">
                      Tu perfil «{RUBRO_PROFILES[regBusinessRubro].shortLabel}» incluye:
                    </div>
                    {RUBRO_PROFILES[regBusinessRubro].featureBullets.map((b, i) => (
                      <div key={i}>• {b}</div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-[#CBD5E1] block mb-1">
                      Nombre de tu {RUBRO_PROFILES[regBusinessRubro].shortLabel} / Empresa *
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#8D9CB0]">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        value={regCompanyName}
                        onChange={(e) => setRegCompanyName(e.target.value)}
                        placeholder="Nombre comercial de tu empresa"
                        required
                        className="w-full pl-9 pr-3 py-2 bg-[#071021] border border-[#B6C2D2]/25 rounded-xl text-xs text-white placeholder-[#64748B] focus:outline-hidden focus:ring-2 focus:ring-[#CBD5E1]/60"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[#CBD5E1] block mb-1">
                      Nombre del Titular / Dueño *
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#8D9CB0]">
                        <User className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        value={regOwnerName}
                        onChange={(e) => setRegOwnerName(e.target.value)}
                        placeholder="Nombre y apellido del titular"
                        required
                        className="w-full pl-9 pr-3 py-2 bg-[#071021] border border-[#B6C2D2]/25 rounded-xl text-xs text-white placeholder-[#64748B] focus:outline-hidden focus:ring-2 focus:ring-[#CBD5E1]/60"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-[#CBD5E1] block mb-1">
                      WhatsApp / Teléfono (Cierres del día)
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#8D9CB0]">
                        <Phone className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        value={regPhone}
                        onChange={(e) => setRegPhone(e.target.value)}
                        placeholder="+54 9 ..."
                        className="w-full pl-9 pr-3 py-2 bg-[#071021] border border-[#B6C2D2]/25 rounded-xl text-xs text-white placeholder-[#64748B] focus:outline-hidden focus:ring-2 focus:ring-[#CBD5E1]/60"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[#CBD5E1] block mb-1">
                      Correo Electrónico
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#8D9CB0]">
                        <Mail className="w-4 h-4" />
                      </div>
                      <input
                        type="email"
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        placeholder="correo@tuempresa.com"
                        className="w-full pl-9 pr-3 py-2 bg-[#071021] border border-[#B6C2D2]/25 rounded-xl text-xs text-white placeholder-[#64748B] focus:outline-hidden focus:ring-2 focus:ring-[#CBD5E1]/60"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-[#CBD5E1] block mb-1">
                      Localidad / Ciudad
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#8D9CB0]">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        value={regCity}
                        onChange={(e) => setRegCity(e.target.value)}
                        placeholder="Ciudad o localidad"
                        className="w-full pl-9 pr-3 py-2 bg-[#071021] border border-[#B6C2D2]/25 rounded-xl text-xs text-white placeholder-[#64748B] focus:outline-hidden focus:ring-2 focus:ring-[#CBD5E1]/60"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[#CBD5E1] block mb-1">
                      Provincia
                    </label>
                    <select
                      value={regProvince}
                      onChange={(e) => setRegProvince(e.target.value)}
                      className="w-full px-3 py-2 bg-[#071021] border border-[#B6C2D2]/25 rounded-xl text-xs text-white focus:outline-hidden focus:ring-2 focus:ring-[#CBD5E1]/60"
                    >
                      {PROVINCIAS_ARG.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#071021] border border-[#B6C2D2]/20 space-y-3">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
                    Credenciales para Ingresar
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-[#CBD5E1] block mb-1">
                        Usuario *
                      </label>
                      <input
                        type="text"
                        value={regUsername}
                        onChange={(e) => setRegUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                        placeholder="Nombre de usuario"
                        required
                        className="w-full px-3 py-2 bg-[#0B1933] border border-[#B6C2D2]/25 rounded-xl text-xs text-white font-mono placeholder-[#64748B] focus:outline-hidden focus:ring-2 focus:ring-[#CBD5E1]/60"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-[#CBD5E1] block mb-1">
                        Contraseña *
                      </label>
                      <div className="relative">
                        <input
                          type={showRegPassword ? 'text' : 'password'}
                          value={regPassword}
                          onChange={(e) => setRegPassword(e.target.value)}
                          placeholder="Mín. 6 caracteres"
                          required
                          className="w-full pl-3 pr-9 py-2 bg-[#0B1933] border border-[#B6C2D2]/25 rounded-xl text-xs text-white font-mono placeholder-[#64748B] focus:outline-hidden focus:ring-2 focus:ring-[#CBD5E1]/60"
                        />
                        <button
                          type="button"
                          onClick={() => setShowRegPassword(!showRegPassword)}
                          className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-[#8D9CB0] hover:text-white cursor-pointer"
                        >
                          {showRegPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Términos y Condiciones de Uso y Manejo obligatorios al crear la cuenta */}
                <div className="p-3.5 rounded-xl bg-[#071021] border border-[#B6C2D2]/25 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                      <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0" />
                      <span>Términos y Condiciones de Uso y Manejo</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowInlineTermsPreview((prev) => !prev)}
                        className="text-[11px] font-semibold text-sky-300 hover:text-sky-200 underline cursor-pointer"
                      >
                        {showInlineTermsPreview ? 'Ocultar resumen' : 'Ver aquí'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsTermsModalOpen(true)}
                        className="px-2 py-1 rounded-lg bg-[#13264A] hover:bg-[#1B3566] border border-sky-400/30 text-[11px] font-bold text-sky-200 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <FileText className="w-3 h-3" />
                        <span>Leer completos</span>
                      </button>
                    </div>
                  </div>

                  {showInlineTermsPreview && (
                    <TermsConditionsScrollBox variant="dark" maxHeightClass="max-h-44" />
                  )}

                  <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-[#0B1933] border border-[#B6C2D2]/20 cursor-pointer hover:border-sky-400/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={regAcceptedTerms}
                      onChange={(e) => {
                        setRegAcceptedTerms(e.target.checked);
                        if (e.target.checked && regError?.includes('Términos')) {
                          setRegError(null);
                        }
                      }}
                      className="mt-0.5 rounded border-slate-500 text-emerald-500"
                    />
                    <span className="text-[11px] text-[#E2E8F0] leading-snug">
                      He leído y acepto los{' '}
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.preventDefault();
                          setIsTermsModalOpen(true);
                        }}
                        className="font-bold text-sky-300 underline cursor-pointer"
                      >
                        Términos y Condiciones de Uso y Manejo
                      </button>{' '}
                      del sistema (v{TERMS_VERSION}), incluyendo la prueba gratuita de 30 días y las reglas de cambio entre planes.
                    </span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={isRegistering || !regAcceptedTerms}
                  className="w-full py-3 px-4 rounded-xl bg-[#E2E8F0] hover:bg-white text-[#091428] font-bold text-sm shadow-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>{isRegistering ? 'Creando cuenta de 30 días...' : 'Aceptar y Comenzar Prueba Gratis (30 Días)'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </>
          )}
        </div>

        {/* Feature Highlights & Support Channels Footer */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-center text-xs text-[#94A3B8]">
          <div className="sm:col-span-2 bg-[#0B1933]/80 border border-[#B6C2D2]/15 rounded-xl p-2.5 flex items-center gap-2 justify-center">
            <Database className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Tus datos guardados en la nube, en todos tus dispositivos</span>
          </div>

          <button
            type="button"
            onClick={() => setIsContactChannelsOpen(true)}
            className="bg-[#0B1933] hover:bg-[#13264A] border border-sky-400/30 rounded-xl p-2.5 flex items-center gap-2 justify-center text-sky-300 hover:text-white font-semibold transition-colors cursor-pointer"
          >
            <Headphones className="w-4 h-4 text-sky-400 shrink-0" />
            <span>Canales de Contacto</span>
          </button>
        </div>

      </div>

      <ContactChannelsModal
        isOpen={isContactChannelsOpen}
        onClose={() => setIsContactChannelsOpen(false)}
      />

      {/* MODAL DE RECUPERACIÓN DE CONTRASEÑA */}
      {isRecoveryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#050C18]/80 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-[#0B1933] border border-[#B6C2D2]/25 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#B6C2D2]/15 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#13264A] text-[#E2E8F0] border border-[#B6C2D2]/25 flex items-center justify-center">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Recuperar Contraseña</h3>
                  <p className="text-xs text-[#94A3B8]">Restablecé tu clave mediante tu correo registrado</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRecoveryOpen(false)}
                className="p-1.5 rounded-lg text-[#94A3B8] hover:text-white hover:bg-[#13264A] transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {recoveryError && (
              <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{recoveryError}</span>
              </div>
            )}

            {recoverySuccess && (
              <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>{recoverySuccess}</span>
              </div>
            )}

            {recoveryStep === 1 ? (
              <form onSubmit={handleRequestRecoveryCode} className="space-y-4">
                <p className="text-xs text-[#CBD5E1] leading-relaxed">
                  Ingresá el correo electrónico de tu cuenta y te enviamos un link para crear una nueva contraseña.
                  Si tu usuario no tiene email, pedile al dueño o al administrador que te cambie la clave.
                </p>

                <div>
                  <label className="text-xs font-semibold text-[#CBD5E1] block mb-1">
                    Correo Electrónico Registrado
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#8D9CB0]">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      type="email"
                      value={recoveryEmail}
                      onChange={(e) => setRecoveryEmail(e.target.value)}
                      placeholder="tucorreo@distribuidora.com"
                      required
                      className="w-full pl-9 pr-3.5 py-2.5 bg-[#071021] border border-[#B6C2D2]/25 rounded-xl text-sm text-white placeholder-[#64748B] focus:outline-hidden focus:ring-2 focus:ring-[#CBD5E1]/60"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsRecoveryOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-[#94A3B8] hover:text-white cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSendingCode}
                    className="px-5 py-2.5 bg-[#E2E8F0] hover:bg-white text-[#091428] font-bold text-xs rounded-xl transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>{isSendingCode ? 'Enviando…' : 'Enviar link'}</span>
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleConfirmPasswordReset} className="space-y-4">
                <p className="text-xs text-[#CBD5E1] leading-relaxed">Elegí tu nueva contraseña (mínimo 6 caracteres).</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-[#CBD5E1] block mb-1">
                      Nueva Contraseña
                    </label>
                    <div className="relative">
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Mín. 6 caracteres"
                        required
                        className="w-full text-xs pl-3 pr-8 py-2.5 bg-[#071021] border border-[#B6C2D2]/25 rounded-xl text-white font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-[#8D9CB0] cursor-pointer"
                      >
                        {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[#CBD5E1] block mb-1">
                      Repetir Contraseña
                    </label>
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repetir clave"
                      required
                      className="w-full text-xs p-2.5 bg-[#071021] border border-[#B6C2D2]/25 rounded-xl text-white font-mono"
                    />
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2">
                  <button
                    type="button"
                    onClick={() => setRecoveryStep(1)}
                    className="text-xs text-[#94A3B8] hover:text-white cursor-pointer"
                  >
                    ← Pedir otro link
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Guardar Contraseña</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      <TermsConditionsModal
        isOpen={isTermsModalOpen}
        onClose={() => setIsTermsModalOpen(false)}
        contextTitle="Términos y Condiciones · Alta de Cuenta (30 Días Gratis)"
        onAcceptAndClose={() => setRegAcceptedTerms(true)}
      />
    </div>
  );
};
