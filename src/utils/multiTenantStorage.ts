import {
  Tenant,
  PlatformUser,
  DistributorConfig,
  Client,
  Salesperson,
  Administrator,
  Boleta,
  BroadcastMessage,
  AutoDispatchLog,
  PlatformBillingConfig,
  PlatformSupportConfig,
  PlatformAnnouncement,
  SalespersonRendicion,
  BusinessRubro,
  OnlineCatalogSettings,
  CatalogProduct,
  CatalogPickupOrder,
  CatalogStockAlertRequest,
  CatalogPromoSubscriber,
  CatalogLoyaltyAccount,
  CatalogAbandonedCart,
  CatalogGiftCard,
} from '../types';
import { applyRubroProfileToConfig, getRubroProfile } from './businessMode';
import { getCatalogRubroPreset } from './catalogRubros';
import {
  DEFAULT_CONFIG,
  loadClients,
  saveClients,
  loadSalespeople,
  loadAdministrators,
  loadBoletas,
  saveBoletas,
  loadPaidBoletas,
  savePaidBoletas,
  loadBroadcastMessages,
  loadAutoDispatchLogs,
  loadRendiciones,
} from './storage';
import {
  dbGetItem,
  dbSetItem,
  dbRemoveItem,
  syncKeysFromCloud,
  applyExternalSyncedRecord,
  loadProfileForUser,
  startCloudSession,
  endCloudSession,
} from './localInternalDb';
import { flushSupabaseSync, describeCloudError, getCloudSession, getAuthUserIdForPlatformUser } from './supabaseSync';
import { savePlatformMpAccessTokenSecret } from './supabaseServices';
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';
import { syntheticEmailFor } from './authEmail';

export { flushSupabaseSync };

const STORAGE_KEYS = {
  TENANTS: 'saas_distribuidoras_tenants_v2_zero',
  USERS: 'saas_distribuidoras_users_v2_zero',
  CURRENT_USER: 'saas_distribuidoras_session_user_v2_zero',
  ACTIVE_TENANT_ID: 'saas_distribuidoras_active_tenant_id_v2_zero',
  TENANT_DATA_PREFIX: 'saas_distribuidora_data_v2_',
  PLATFORM_BILLING: 'saas_platform_billing_config_v1',
  PLATFORM_SUPPORT: 'saas_platform_support_config_v1',
  PLATFORM_ANNOUNCEMENTS: 'saas_platform_announcements_v1',
  DISMISSED_ANNOUNCEMENTS: 'saas_dismissed_announcements_v1',
};

export const DEFAULT_PLATFORM_BILLING_CONFIG: PlatformBillingConfig = {
  alias: 'cobranzas.gestion.mp',
  cvu: '',
  accountHolderName: 'Federico Roa',
  bankOrWalletName: 'Mercado Pago',
  defaultMonthlyFee: 28000,
  planPrices: {
    basico: 18000,
    web: 28000,
    full: 42000,
  },
  annualDiscountPercent: 0,
  mpCheckoutLink: '',
  mpPublicKey: '',
  hasMpAccessToken: false,
};

export const DEFAULT_PLATFORM_SUPPORT_CONFIG: PlatformSupportConfig = {
  contactName: 'Federico Roa · Asistencia Técnica',
  whatsappPhone: '',
  email: 'federoa14@gmail.com',
  attentionHours: 'Lunes a Viernes de 9:00 a 19:00 hs',
  welcomeMessage:
    'Comunicate de forma directa por WhatsApp o correo electrónico para evacuar dudas, recibir asistencia técnica o consultar sobre tu cuenta.',
};

// Purge old mock/demo keys and previously seeded demo records
function purgeLegacyTenantKeys() {
  try {
    const keys = [
      'saas_distribuidoras_tenants_v1',
      'saas_distribuidoras_users_v1',
      'saas_distribuidoras_session_user_v1',
      'saas_distribuidoras_active_tenant_id_v1',
      'saas_distribuidora_data_dist-bebidas',
      'saas_distribuidora_data_dist-lacteos',
      'saas_distribuidora_data_v2_dist-central',
    ];
    for (const k of keys) {
      dbRemoveItem(k);
    }

    const demoPurgedFlag = 'saas_demo_seeds_purged_v1';
    if (!dbGetItem(demoPurgedFlag)) {
      const rawTenants = dbGetItem(STORAGE_KEYS.TENANTS);
      if (rawTenants) {
        try {
          const parsedTenants = JSON.parse(rawTenants);
          if (Array.isArray(parsedTenants)) {
            const filteredTenants = parsedTenants.filter(
              (t) => !(t?.id === 'dist-central' && t?.name === 'Distribuidora Central & Logística')
            );
            dbSetItem(STORAGE_KEYS.TENANTS, JSON.stringify(filteredTenants));
          }
        } catch {}
      }

      const rawUsers = dbGetItem(STORAGE_KEYS.USERS);
      if (rawUsers) {
        try {
          const parsedUsers = JSON.parse(rawUsers);
          if (Array.isArray(parsedUsers)) {
            const filteredUsers = parsedUsers.filter(
              (u) => !(u?.id === 'usr-dueno-central' && u?.username === 'dueno1')
            );
            dbSetItem(STORAGE_KEYS.USERS, JSON.stringify(filteredUsers));
          }
        } catch {}
      }

      const rawSession = dbGetItem(STORAGE_KEYS.CURRENT_USER);
      if (rawSession) {
        try {
          const sessionUser = JSON.parse(rawSession);
          if (sessionUser?.id === 'usr-dueno-central' && sessionUser?.username === 'dueno1') {
            dbRemoveItem(STORAGE_KEYS.CURRENT_USER);
            dbRemoveItem(STORAGE_KEYS.ACTIVE_TENANT_ID);
          }
        } catch {}
      }

      dbSetItem(demoPurgedFlag, '1');
    }
  } catch (e) {}
}
purgeLegacyTenantKeys();

// INITIAL TENANTS - CLEAN EMPTY LIST (NO DEMO COMPANIES)
export const INITIAL_TENANTS: Tenant[] = [];

// Los usuarios viven en Supabase Auth: no hay usuarios ni contraseñas escritos en el código.
export const INITIAL_USERS: PlatformUser[] = [];

// Complete Tenant Data structure for isolation
export interface TenantData {
  config: DistributorConfig;
  clients: Client[];
  salespeople: Salesperson[];
  admins: Administrator[];
  boletas: Boleta[];
  paidBoletas: Boleta[];
  broadcasts: BroadcastMessage[];
  autoLogs: AutoDispatchLog[];
  rendiciones?: SalespersonRendicion[];
  catalogSettings?: OnlineCatalogSettings;
  catalogProducts?: CatalogProduct[];
  catalogOrders?: CatalogPickupOrder[];
  catalogStockAlerts?: CatalogStockAlertRequest[];
  catalogPromoSubscribers?: CatalogPromoSubscriber[];
  catalogLoyaltyAccounts?: CatalogLoyaltyAccount[];
  catalogAbandonedCarts?: CatalogAbandonedCart[];
  catalogGiftCards?: CatalogGiftCard[];
}

// TENANTS STORAGE
export function loadTenants(): Tenant[] {
  try {
    const raw = dbGetItem(STORAGE_KEYS.TENANTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('Error reading tenants from internal db', e);
  }
  return INITIAL_TENANTS;
}

export function saveTenants(tenants: Tenant[]): void {
  try {
    dbSetItem(STORAGE_KEYS.TENANTS, JSON.stringify(tenants));
  } catch (e) {
    console.error('Error saving tenants', e);
  }
}

// PLATFORM BILLING CONFIG (ALIAS + MERCADO PAGO - CONFIGURED BY SUPERADMIN)
export function loadPlatformBillingConfig(): PlatformBillingConfig {
  try {
    const raw = dbGetItem(STORAGE_KEYS.PLATFORM_BILLING);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_PLATFORM_BILLING_CONFIG,
        ...parsed,
        planPrices: {
          basico: Number(parsed?.planPrices?.basico ?? DEFAULT_PLATFORM_BILLING_CONFIG.planPrices!.basico),
          web: Number(parsed?.planPrices?.web ?? parsed?.defaultMonthlyFee ?? DEFAULT_PLATFORM_BILLING_CONFIG.planPrices!.web),
          full: Number(parsed?.planPrices?.full ?? DEFAULT_PLATFORM_BILLING_CONFIG.planPrices!.full),
        },
      };
    }
  } catch (e) {
    console.warn('Error reading platform billing config', e);
  }
  return DEFAULT_PLATFORM_BILLING_CONFIG;
}

export function savePlatformBillingConfig(config: PlatformBillingConfig): void {
  try {
    dbSetItem(
      STORAGE_KEYS.PLATFORM_BILLING,
      JSON.stringify({
        ...config,
        updatedAt: new Date().toISOString(),
      })
    );
  } catch (e) {
    console.error('Error saving platform billing config', e);
  }
}

export async function syncAuthCatalogFromSupabase(): Promise<void> {
  await syncKeysFromCloud([
    STORAGE_KEYS.TENANTS,
    STORAGE_KEYS.USERS,
    STORAGE_KEYS.PLATFORM_BILLING,
    STORAGE_KEYS.PLATFORM_SUPPORT,
    STORAGE_KEYS.PLATFORM_ANNOUNCEMENTS,
  ]);
}

export async function syncTenantDataFromSupabase(tenantId: string): Promise<boolean> {
  if (!tenantId) return false;
  const key = `${STORAGE_KEYS.TENANT_DATA_PREFIX}${tenantId}`;
  const updated = await syncKeysFromCloud([key, STORAGE_KEYS.TENANTS]);
  return updated.length > 0;
}

export async function fetchPlatformBillingConfigFromServer(): Promise<PlatformBillingConfig> {
  // Lectura pública (también sirve en la pantalla de login y en los links de pago)
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data } = await supabase.from('platform_settings').select('value').eq('key', 'billing').maybeSingle();
      if (data?.value) applyExternalSyncedRecord(STORAGE_KEYS.PLATFORM_BILLING, JSON.stringify(data.value));
    } catch {
      // Sin conexión: se usa lo último cargado
    }
  }
  return loadPlatformBillingConfig();
}

export async function persistPlatformBillingConfigToServer(
  config: PlatformBillingConfig & { mpAccessToken?: string }
): Promise<PlatformBillingConfig> {
  const { mpAccessToken, ...cleanConfig } = config;
  const nextConfig: PlatformBillingConfig = {
    ...cleanConfig,
    hasMpAccessToken: Boolean(mpAccessToken?.trim() || cleanConfig.hasMpAccessToken),
    updatedAt: new Date().toISOString(),
  };
  savePlatformBillingConfig(nextConfig);
  await Promise.all([
    mpAccessToken?.trim() ? savePlatformMpAccessTokenSecret(mpAccessToken.trim()) : Promise.resolve(false),
    flushSupabaseSync(),
  ]);
  return loadPlatformBillingConfig();
}

// PLATFORM SUPPORT / CONTACT CHANNELS CONFIG (CONFIGURED BY SUPERADMIN)
export function loadPlatformSupportConfig(): PlatformSupportConfig {
  try {
    const raw = dbGetItem(STORAGE_KEYS.PLATFORM_SUPPORT);
    if (raw) {
      return {
        ...DEFAULT_PLATFORM_SUPPORT_CONFIG,
        ...JSON.parse(raw),
      };
    }
  } catch (e) {
    console.warn('Error reading platform support config', e);
  }
  return DEFAULT_PLATFORM_SUPPORT_CONFIG;
}

export function savePlatformSupportConfig(config: PlatformSupportConfig): void {
  try {
    dbSetItem(
      STORAGE_KEYS.PLATFORM_SUPPORT,
      JSON.stringify({
        ...config,
        updatedAt: new Date().toISOString(),
      })
    );
  } catch (e) {
    console.error('Error saving platform support config', e);
  }
}

export async function fetchPlatformSupportConfigFromServer(): Promise<PlatformSupportConfig> {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data } = await supabase.from('platform_settings').select('value').eq('key', 'support').maybeSingle();
      if (data?.value) applyExternalSyncedRecord(STORAGE_KEYS.PLATFORM_SUPPORT, JSON.stringify(data.value));
    } catch {
      // Sin conexión: se usa lo último cargado
    }
  }
  return loadPlatformSupportConfig();
}

export async function persistPlatformSupportConfigToServer(
  config: PlatformSupportConfig
): Promise<PlatformSupportConfig> {
  savePlatformSupportConfig(config);
  await flushSupabaseSync();
  return loadPlatformSupportConfig();
}

// PLATFORM ANNOUNCEMENTS (COMUNICADOS Y NOVEDADES DEL SUPERADMINISTRADOR)
export function loadPlatformAnnouncements(): PlatformAnnouncement[] {
  try {
    const raw = dbGetItem(STORAGE_KEYS.PLATFORM_ANNOUNCEMENTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('Error reading platform announcements', e);
  }
  return [];
}

export function savePlatformAnnouncements(list: PlatformAnnouncement[]): void {
  try {
    dbSetItem(STORAGE_KEYS.PLATFORM_ANNOUNCEMENTS, JSON.stringify(list));
  } catch (e) {
    console.error('Error saving platform announcements', e);
  }
}

export async function fetchPlatformAnnouncementsFromServer(params?: {
  onlyActive?: boolean;
  audience?: string;
}): Promise<PlatformAnnouncement[]> {
  if (getCloudSession()) await syncKeysFromCloud([STORAGE_KEYS.PLATFORM_ANNOUNCEMENTS]);
  const local = loadPlatformAnnouncements();

  if (!params?.onlyActive && !params?.audience) return local;
  const today = new Date().toISOString().split('T')[0];
  return local.filter((a) => {
    if (params?.onlyActive && (!a.active || (a.expiresAt && a.expiresAt < today))) return false;
    if (params?.audience && params.audience !== 'all' && a.audience !== 'all' && a.audience !== params.audience) {
      return false;
    }
    return true;
  });
}

export async function savePlatformAnnouncementToServer(
  announcement: Omit<PlatformAnnouncement, 'id' | 'createdAt'> & { id?: string; createdAt?: string }
): Promise<PlatformAnnouncement[]> {
  const current = loadPlatformAnnouncements();
  const newItem: PlatformAnnouncement = {
    ...announcement,
    id: announcement.id || `ann-${Date.now()}`,
    createdAt: announcement.createdAt || new Date().toISOString(),
  };
  const updated = current.some((x) => x.id === newItem.id)
    ? current.map((x) => (x.id === newItem.id ? newItem : x))
    : [newItem, ...current];
  savePlatformAnnouncements(updated);
  await flushSupabaseSync();
  return updated;
}

export async function togglePlatformAnnouncementOnServer(
  id: string,
  active: boolean
): Promise<PlatformAnnouncement[]> {
  const updated = loadPlatformAnnouncements().map((x) => (x.id === id ? { ...x, active } : x));
  savePlatformAnnouncements(updated);
  await flushSupabaseSync();
  return updated;
}

export async function deletePlatformAnnouncementFromServer(id: string): Promise<PlatformAnnouncement[]> {
  const updated = loadPlatformAnnouncements().filter((x) => x.id !== id);
  savePlatformAnnouncements(updated);
  await flushSupabaseSync();
  return updated;
}

export function loadDismissedAnnouncementIds(tenantId?: string): string[] {
  try {
    const key = tenantId
      ? `${STORAGE_KEYS.DISMISSED_ANNOUNCEMENTS}_${tenantId}`
      : STORAGE_KEYS.DISMISSED_ANNOUNCEMENTS;
    const raw = dbGetItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore
  }
  return [];
}

export function dismissAnnouncementId(id: string, tenantId?: string): string[] {
  const existing = loadDismissedAnnouncementIds(tenantId);
  if (existing.includes(id)) return existing;
  const next = [...existing, id];
  try {
    const key = tenantId
      ? `${STORAGE_KEYS.DISMISSED_ANNOUNCEMENTS}_${tenantId}`
      : STORAGE_KEYS.DISMISSED_ANNOUNCEMENTS;
    dbSetItem(key, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

// PLATFORM USERS STORAGE
export function loadPlatformUsers(): PlatformUser[] {
  try {
    const raw = dbGetItem(STORAGE_KEYS.USERS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('Error reading users from internal db', e);
  }
  return INITIAL_USERS;
}

export function savePlatformUsers(users: PlatformUser[]): void {
  try {
    dbSetItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  } catch (e) {
    console.error('Error saving users', e);
  }
}

// SESSION USER STORAGE
export function getCurrentSessionUser(): PlatformUser | null {
  try {
    const raw = dbGetItem(STORAGE_KEYS.CURRENT_USER);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Error reading current session user', e);
  }
  return null;
}

export function setCurrentSessionUser(user: PlatformUser | null): void {
  try {
    if (user) {
      // Nunca se guarda la contraseña en el dispositivo
      dbSetItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify({ ...user, password: '' }));
    } else {
      dbRemoveItem(STORAGE_KEYS.CURRENT_USER);
    }
  } catch (e) {
    console.error('Error saving session user', e);
  }
}

// ACTIVE TENANT ID STORAGE
export function getActiveTenantId(): string {
  try {
    const raw = dbGetItem(STORAGE_KEYS.ACTIVE_TENANT_ID);
    if (raw) return raw;
  } catch (e) {}
  return '';
}

export function setActiveTenantId(tenantId: string): void {
  try {
    dbSetItem(STORAGE_KEYS.ACTIVE_TENANT_ID, tenantId);
  } catch (e) {}
}

// PARTITIONED TENANT DATA
export function loadTenantData(tenantId: string): TenantData {
  const key = `${STORAGE_KEYS.TENANT_DATA_PREFIX}${tenantId}`;
  let data: TenantData | null = null;

  try {
    const raw = dbGetItem(key);
    if (raw) {
      data = JSON.parse(raw);
    }
  } catch (e) {
    console.warn(`Error reading data for tenant ${tenantId}`, e);
  }

  if (!data) {
    const tenants = loadTenants();
    const currentTenant = tenants.find((t) => t.id === tenantId);

    data = {
      config: currentTenant?.config || {
        ...DEFAULT_CONFIG,
        distributorName: currentTenant?.name || 'Mi Empresa',
        tenantId,
        tenantCode: currentTenant?.tenantCode || '',
      },
      clients: [],
      salespeople: [],
      admins: [],
      boletas: [],
      paidBoletas: [],
      broadcasts: [],
      autoLogs: [],
      rendiciones: [],
      catalogSettings: {
        published: true,
        storeName: currentTenant?.name || 'Mi Empresa',
        tagline: 'Elegí tus productos, armá tu carrito y envianos tu pedido por WhatsApp.',
        whatsappPhone: currentTenant?.phone || '',
        allowPickup: true,
        allowDelivery: true,
        deliveryNote: 'Coordinamos envío a domicilio y medio de pago por WhatsApp.',
        pickupAddress: currentTenant?.address || (currentTenant?.city ? `${currentTenant.city}${currentTenant.province ? `, ${currentTenant.province}` : ''}` : ''),
        pickupHours: 'Lunes a Sábado · 9:00 a 19:00 hs',
        pickupInstructions: 'Coordinamos por WhatsApp cuando tu pedido esté preparado para retirar.',
        paymentNote: 'Efectivo, transferencia o link de pago',
        currencySymbol: '$',
      },
      catalogProducts: [],
      catalogOrders: [],
      catalogStockAlerts: [],
      catalogPromoSubscribers: [],
      catalogLoyaltyAccounts: [],
      catalogAbandonedCarts: [],
      catalogGiftCards: [],
    };
  }

  if (!data.catalogProducts) data.catalogProducts = [];
  if (!data.catalogOrders) data.catalogOrders = [];
  if (!data.catalogStockAlerts) data.catalogStockAlerts = [];
  if (!data.catalogPromoSubscribers) data.catalogPromoSubscribers = [];
  if (!data.catalogLoyaltyAccounts) data.catalogLoyaltyAccounts = [];
  if (!data.catalogAbandonedCarts) data.catalogAbandonedCarts = [];
  if (!data.catalogGiftCards) data.catalogGiftCards = [];
  if (!data.catalogSettings) {
    const tenants = loadTenants();
    const currentTenant = tenants.find((t) => t.id === tenantId);
    data.catalogSettings = {
      published: true,
      storeName: data.config?.distributorName || currentTenant?.name || 'Mi Empresa',
      tagline: 'Elegí tus productos, armá tu carrito y envianos tu pedido por WhatsApp.',
      whatsappPhone: data.config?.senderPhone || data.config?.distributorPhone || currentTenant?.phone || '',
      allowPickup: true,
      allowDelivery: true,
      deliveryNote: 'Coordinamos envío a domicilio y medio de pago por WhatsApp.',
      pickupAddress: currentTenant?.address || (currentTenant?.city ? `${currentTenant.city}${currentTenant.province ? `, ${currentTenant.province}` : ''}` : ''),
      pickupHours: 'Lunes a Sábado · 9:00 a 19:00 hs',
      pickupInstructions: 'Coordinamos por WhatsApp cuando tu pedido esté preparado para retirar.',
      paymentNote: 'Efectivo, transferencia o link de pago',
      currencySymbol: data.config?.currencySymbol || '$',
    };
  }

  // La regla de retención de 30 días ahora corre en el servidor (run_retention_purge en Supabase).

  return data;
}

export function saveTenantData(tenantId: string, data: TenantData): void {
  const key = `${STORAGE_KEYS.TENANT_DATA_PREFIX}${tenantId}`;
  try {
    dbSetItem(key, JSON.stringify(data));
  } catch (e) {
    console.error(`Error saving data for tenant ${tenantId}`, e);
  }
}

// USER AUTHENTICATION & MULTI-TENANT RESOLVER (Supabase Auth)
export interface AuthResult {
  success: boolean;
  user?: PlatformUser;
  tenant?: Tenant;
  error?: string;
  pendingConfirmation?: boolean;
}

const PENDING_REGISTRATION_PREFIX = 'rf_pending_registration_';

function translateAuthError(message?: string): string {
  const m = (message || '').toLowerCase();
  if (m.includes('invalid login') || m.includes('invalid credentials')) return 'Usuario o contraseña incorrectos.';
  if (m.includes('email not confirmed')) return 'Todavía no confirmaste tu email. Revisá tu correo (y la carpeta de spam).';
  if (m.includes('already registered') || m.includes('already been registered') || m.includes('user already exists')) {
    return 'Ese email ya tiene una cuenta. Probá iniciar sesión o recuperar tu clave.';
  }
  if (m.includes('password') && (m.includes('6') || m.includes('short') || m.includes('weak'))) {
    return 'La contraseña es muy corta: usá al menos 6 caracteres.';
  }
  if (m.includes('rate limit') || m.includes('too many')) return 'Demasiados intentos. Esperá unos minutos y volvé a probar.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Sin conexión a internet. Revisá tu conexión y volvé a intentar.';
  return message ? `No se pudo iniciar sesión: ${message}` : 'No se pudo iniciar sesión. Intentá nuevamente.';
}

/** Después de autenticar en Supabase: carga perfil y datos, y devuelve usuario + comercio */
async function finishLogin(userId: string, email: string | null, tenantCodeInput?: string): Promise<AuthResult> {
  const supabase = getSupabaseClient()!;
  let profile = await loadProfileForUser(userId);

  // Alta de prueba que quedó esperando la confirmación del email
  if (!profile && email) {
    const pendingRaw = dbGetItem(`${PENDING_REGISTRATION_PREFIX}${email.toLowerCase()}`);
    if (pendingRaw) {
      const pending = JSON.parse(pendingRaw);
      await createTrialBusinessOnServer(pending);
      dbRemoveItem(`${PENDING_REGISTRATION_PREFIX}${email.toLowerCase()}`);
      profile = await loadProfileForUser(userId);
      if (profile) {
        await startCloudSession(profile);
        if (pending.tenantData && profile.businessId) saveTenantData(profile.businessId, pending.tenantData);
        await flushSupabaseSync();
        return buildLoginResult(profile);
      }
    }
  }

  if (!profile) {
    await supabase.auth.signOut().catch(() => null);
    return { success: false, error: 'Tu usuario no tiene un comercio asignado. Contactá al administrador.' };
  }
  if (!profile.active) {
    await supabase.auth.signOut().catch(() => null);
    return { success: false, error: 'Tu usuario está desactivado. Contactá al dueño o al administrador.' };
  }

  await startCloudSession(profile);
  const result = buildLoginResult(profile);
  const cleanCode = tenantCodeInput?.trim().toUpperCase();
  if (result.success && cleanCode && profile.role !== 'superadmin' && result.tenant?.tenantCode?.toUpperCase() !== cleanCode) {
    await endCloudSession();
    return { success: false, error: `El usuario no pertenece a la empresa ${cleanCode}.` };
  }
  return result;
}

function buildLoginResult(profile: { userId: string; role: PlatformUser['role']; businessId: string | null; legacyUserId: string | null; fullName: string; email: string | null; username: string | null; phone: string | null }): AuthResult {
  const visibleId = profile.legacyUserId || profile.userId;
  const user =
    loadPlatformUsers().find((u) => u.id === visibleId) ||
    ({
      id: visibleId,
      username: profile.username || '',
      password: '',
      fullName: profile.fullName,
      email: profile.email || '',
      phone: profile.phone || '',
      role: profile.role,
      tenantId: profile.businessId || 'all',
      createdAt: new Date().toISOString().slice(0, 10),
      active: true,
    } as PlatformUser);
  if (profile.role === 'superadmin') return { success: true, user };
  const tenant = loadTenants().find((t) => t.id === profile.businessId);
  if (!tenant) return { success: false, error: 'No encontramos la empresa asignada a tu usuario.' };
  return { success: true, user, tenant };
}

/**
 * Inicio de sesión: con email, o con usuario + código de empresa.
 * (Permite entrar aunque la empresa esté pausada para que App muestre la pantalla de reactivación.)
 */
export async function authenticateUser(
  usernameOrEmail: string,
  pass: string,
  tenantCodeInput?: string
): Promise<AuthResult> {
  const supabase = getSupabaseClient();
  if (!supabase || !isSupabaseConfigured()) {
    return { success: false, error: 'La app no está conectada a Supabase. Revisá las variables VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.' };
  }
  const identifier = usernameOrEmail.trim();
  const password = pass.trim();
  try {
    let userId: string | undefined;
    let email: string | null = null;
    if (identifier.includes('@')) {
      const { data, error } = await supabase.auth.signInWithPassword({ email: identifier.toLowerCase(), password });
      if (error) return { success: false, error: translateAuthError(error.message) };
      userId = data.user?.id;
      email = data.user?.email || null;
    } else {
      // Usuario + código de empresa: lo resuelve el servidor sin exponer emails
      const { data, error } = await supabase.functions.invoke('auth-login', {
        body: { username: identifier, tenantCode: tenantCodeInput?.trim() || '', password },
      });
      if (error || !data?.access_token) {
        let message = data?.error;
        try {
          const ctx = (error as any)?.context;
          if (!message && ctx && typeof ctx.json === 'function') message = (await ctx.json())?.error;
        } catch {
          // ignore
        }
        return { success: false, error: message || translateAuthError(error?.message) };
      }
      const { data: sess, error: sessErr } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });
      if (sessErr) return { success: false, error: translateAuthError(sessErr.message) };
      userId = sess.user?.id;
      email = sess.user?.email || null;
    }
    if (!userId) return { success: false, error: 'No se pudo iniciar sesión. Intentá nuevamente.' };
    return await finishLogin(userId, email, tenantCodeInput);
  } catch (err) {
    return { success: false, error: describeCloudError(err) };
  }
}

/**
 * Al abrir la app con una sesión de Supabase ya guardada: deja el usuario de la app
 * alineado con el perfil real (o lo borra si no hay sesión).
 */
export function restoreSessionUserFromCloud(): void {
  const cloud = getCloudSession();
  if (!cloud) {
    setCurrentSessionUser(null);
    return;
  }
  const visible = loadPlatformUsers().find((u) => u.id === (getAuthUserVisibleId(cloud.userId) || cloud.userId));
  if (visible) {
    setCurrentSessionUser(visible);
    if (cloud.businessId) setActiveTenantId(cloud.businessId);
  }
}

function getAuthUserVisibleId(authId: string): string | undefined {
  // El id visible es el legacy_user_id si existe; se busca en la lista cargada
  const users = loadPlatformUsers();
  for (const u of users) {
    if (getAuthUserIdForPlatformUser(u.id) === authId) return u.id;
  }
  return undefined;
}

/** Cierra sesión en Supabase y limpia los datos de la memoria */
export async function logoutUser(): Promise<void> {
  setCurrentSessionUser(null);
  await endCloudSession();
}

/** Envía el email de recuperación de contraseña (Supabase Auth) */
export async function requestPasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { success: false, error: 'La app no está conectada a Supabase.' };
  const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/?recuperar=1` : undefined;
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo });
  if (error) return { success: false, error: translateAuthError(error.message) };
  return { success: true };
}

/** Guarda la nueva contraseña cuando el usuario vuelve desde el link del email */
export async function completePasswordReset(newPassword: string): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { success: false, error: 'La app no está conectada a Supabase.' };
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { success: false, error: translateAuthError(error.message) };
  await supabase.auth.signOut().catch(() => null);
  return { success: true };
}

export interface SelfTrialRegistrationInput {
  companyName: string;
  ownerName: string;
  username: string;
  password: string;
  email: string;
  phone: string;
  city?: string;
  province?: string;
  businessCategory?: string;
  businessRubro?: BusinessRubro;
  optionalTenantCode?: string;
  acceptedTerms?: boolean;
  termsAcceptedAt?: string;
  termsVersion?: string;
}

/**
 * Autoregistro público de una nueva distribuidora con prueba gratuita de 30 días.
 * Se incorpora instantáneamente a la gestión del SuperAdmin en la pestaña "A Prueba".
 */
function buildTrialRegistration(
  input: SelfTrialRegistrationInput
): { success: boolean; user?: PlatformUser; tenant?: Tenant; tenantData?: TenantData; error?: string } {
  const companyName = input.companyName.trim();
  const ownerName = input.ownerName.trim();
  const cleanUsername = input.username.trim().toLowerCase();
  const cleanPassword = input.password.trim();
  const cleanEmail = input.email.trim().toLowerCase();
  const cleanPhone = input.phone.trim();

  if (input.acceptedTerms !== true) {
    return {
      success: false,
      error: 'Debés leer y aceptar los Términos y Condiciones de Uso y Manejo para crear tu cuenta.',
    };
  }

  if (!companyName || !ownerName || !cleanUsername || !cleanPassword) {
    return {
      success: false,
      error: 'Completá nombre de la empresa, titular, usuario y contraseña.',
    };
  }

  if (cleanPassword.length < 6) {
    return {
      success: false,
      error: 'La contraseña debe tener al menos 6 caracteres.',
    };
  }

  if (!cleanEmail || !cleanEmail.includes('@')) {
    return {
      success: false,
      error: 'Ingresá un correo electrónico válido: lo vas a necesitar para confirmar la cuenta y recuperar tu clave.',
    };
  }

  // El código de empresa lo valida el servidor (único); si no se eligió, se genera uno al azar.
  let tenantCode = (input.optionalTenantCode || '').trim().toUpperCase();
  if (!tenantCode) {
    tenantCode = `EMP-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  }

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const trialEndDate = new Date(now.getTime());
  trialEndDate.setDate(trialEndDate.getDate() + 30);
  const trialEndsStr = trialEndDate.toISOString().split('T')[0];

  const billingCfg = loadPlatformBillingConfig();
  const profile = getRubroProfile(input.businessRubro);
  const newTenantId = `dist-trial-${Date.now()}`;
  const newUserId = `usr-${Date.now()}`;
  const newAdminId = `adm-${Date.now()}`;

  const newConfig: DistributorConfig = applyRubroProfileToConfig(
    {
      ...DEFAULT_CONFIG,
      distributorName: companyName,
      distributorPhone: cleanPhone,
      distributorEmail: cleanEmail,
      senderPhone: cleanPhone,
      senderEmail: cleanEmail,
      activeAdminId: newAdminId,
      tenantId: newTenantId,
      tenantCode,
      distributorIcon:
        profile.id === 'indumentaria' || profile.id === 'ecommerce_kiosco'
          ? 'shopping-bag'
          : 'building',
      dailyClosingEnabled: true,
      dailyClosingTime: '19:00',
      lateSurchargeEnabled: false,
      lateSurchargePercent: 5,
      lateSurchargeAfterDays: 5,
    },
    profile.id
  );

  const newTenant: Tenant = {
    id: newTenantId,
    tenantCode,
    name: companyName,
    businessCategory: input.businessCategory?.trim() || profile.label,
    businessRubro: profile.id,
    phone: cleanPhone,
    email: cleanEmail,
    city: input.city?.trim() || '',
    province: input.province?.trim() || 'Buenos Aires',
    status: 'trial',
    icon:
      profile.id === 'indumentaria' || profile.id === 'ecommerce_kiosco'
        ? 'shopping-bag'
        : 'building',
    createdAt: todayStr,
    notes: `Registro autónomo (${profile.shortLabel}) con prueba gratuita de 30 días (vence el ${trialEndsStr}).`,
    config: newConfig,
    catalogEnabled: true,
    catalogRubro: profile.id,
    subscription: {
      monthlyFee: billingCfg.defaultMonthlyFee || 25000,
      currency: '$',
      paymentWindowStartDay: 1,
      paymentWindowEndDay: 5,
      isPaused: false,
      trialStartedAt: todayStr,
      trialEndsAt: trialEndsStr,
      trialDays: 30,
      selfRegistered: true,
      termsAccepted: true,
      termsAcceptedAt: input.termsAcceptedAt || now.toISOString(),
      termsVersion: input.termsVersion || '2026.1',
      paymentHistory: [],
    },
  };

  const newUser: PlatformUser = {
    id: newUserId,
    username: cleanUsername,
    password: cleanPassword,
    fullName: ownerName,
    email: cleanEmail,
    phone: cleanPhone,
    role: 'dueño',
    tenantId: newTenantId,
    tenantCode,
    createdAt: todayStr,
    active: true,
  };

  const initialSalespeople: Salesperson[] =
    profile.id !== 'distribuidora'
      ? [
          {
            id: `sal-mostrador-${Date.now()}`,
            name: 'Caja / Mostrador',
            phone: cleanPhone,
            email: cleanEmail,
            address: companyName,
            birthDate: '1990-01-01',
            zone: 'Local Principal',
            active: true,
          },
        ]
      : [];

  // Espacio privado inicial con el dueño cargado para cierres del día y alertas
  const tenantData: TenantData = {
    config: newConfig,
    clients: [],
    salespeople: initialSalespeople,
    admins: [
      {
        id: newAdminId,
        name: ownerName,
        phone: cleanPhone,
        email: cleanEmail,
        role: 'dueño',
        receiveAdminAlerts: true,
        isGeneralAdmin: true,
      },
    ],
    boletas: [],
    paidBoletas: [],
    broadcasts: [],
    autoLogs: [],
    catalogSettings: {
      published: true,
      catalogRubro: profile.id,
      rubroFilters: getCatalogRubroPreset(profile.id).defaultFilters,
      customSubfilters: [],
      storeName: companyName,
      tagline: 'Elegí tus productos, armá tu carrito y envianos tu pedido por WhatsApp.',
      whatsappPhone: cleanPhone,
      allowPickup: true,
      allowDelivery: true,
      deliveryNote: 'Coordinamos envío a domicilio y medio de pago por WhatsApp.',
      pickupAddress: input.city?.trim()
        ? `${input.city.trim()}${input.province ? `, ${input.province}` : ''}`
        : '',
      pickupHours: 'Lunes a Sábado · 9:00 a 19:00 hs',
      pickupInstructions: 'Coordinamos por WhatsApp cuando tu pedido esté preparado para retirar.',
      paymentNote: 'Efectivo, transferencia o link de pago',
      currencySymbol: '$',
    },
    catalogProducts: [],
    catalogOrders: [],
    catalogStockAlerts: [],
    catalogPromoSubscribers: [],
    catalogLoyaltyAccounts: [],
    catalogAbandonedCarts: [],
    catalogGiftCards: [],
  };

  return { success: true, user: newUser, tenant: newTenant, tenantData };
}

async function createTrialBusinessOnServer(payload: {
  tenant: Tenant;
  tenantData: TenantData;
  user: PlatformUser;
}): Promise<string> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('La app no está conectada a Supabase.');
  const { data, error } = await supabase.rpc('register_trial_business', {
    p_business: payload.tenant,
    p_settings: { config: payload.tenantData.config, catalogSettings: payload.tenantData.catalogSettings },
    p_profile: { username: payload.user.username, fullName: payload.user.fullName, phone: payload.user.phone },
  });
  if (error) throw error;
  return String(data);
}

/**
 * Autoregistro público de una nueva empresa con prueba gratuita de 30 días.
 * Crea la cuenta en Supabase Auth y el comercio en el servidor.
 * Si Supabase pide confirmar el email, el comercio se crea en el primer inicio de sesión.
 */
export async function registerSelfServiceTrialTenant(input: SelfTrialRegistrationInput): Promise<AuthResult> {
  const supabase = getSupabaseClient();
  if (!supabase || !isSupabaseConfigured()) {
    return { success: false, error: 'La app no está conectada a Supabase.' };
  }
  const built = buildTrialRegistration(input);
  if (!built.success || !built.tenant || !built.user || !built.tenantData) {
    return { success: false, error: built.error };
  }
  const email = built.user.email.toLowerCase();
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password: input.password.trim(),
      options: {
        emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
        data: { username: built.user.username, full_name: built.user.fullName },
      },
    });
    if (error) return { success: false, error: translateAuthError(error.message) };

    const payload = { tenant: built.tenant, tenantData: built.tenantData, user: built.user };
    if (!data.session || !data.user) {
      dbSetItem(`${PENDING_REGISTRATION_PREFIX}${email}`, JSON.stringify(payload));
      return {
        success: false,
        pendingConfirmation: true,
        error: `Te enviamos un correo a ${email}. Confirmá tu email y después iniciá sesión: tu empresa se crea en ese momento.`,
      };
    }

    let attempts = 0;
    for (;;) {
      try {
        await createTrialBusinessOnServer(payload);
        break;
      } catch (err: any) {
        attempts += 1;
        const msg = String(err?.message || '');
        if (attempts < 3 && msg.includes('código de empresa') && !input.optionalTenantCode) {
          payload.tenant = { ...payload.tenant, tenantCode: `EMP-${Math.random().toString(36).slice(2, 7).toUpperCase()}` };
          continue;
        }
        return { success: false, error: msg || 'No se pudo crear la empresa.' };
      }
    }
    return await finishLoginAfterRegistration(data.user.id, payload.tenantData);
  } catch (err) {
    return { success: false, error: describeCloudError(err) };
  }
}

async function finishLoginAfterRegistration(userId: string, tenantData: TenantData): Promise<AuthResult> {
  const profile = await loadProfileForUser(userId);
  if (!profile) return { success: false, error: 'La cuenta se creó, pero no se pudo cargar el perfil. Iniciá sesión.' };
  await startCloudSession(profile);
  if (profile.businessId) {
    saveTenantData(profile.businessId, { ...tenantData, config: { ...tenantData.config, tenantId: profile.businessId } });
    await flushSupabaseSync();
  }
  return buildLoginResult(profile);
}

// UPDATE USER PROFILE & CREDENTIALS
export function updatePlatformUser(
  userId: string,
  updates: Partial<Omit<PlatformUser, 'id'>>
): PlatformUser | null {
  const users = loadPlatformUsers();
  const index = users.findIndex((u) => u.id === userId);
  if (index === -1) return null;

  const updatedUser: PlatformUser = {
    ...users[index],
    ...updates,
  };
  users[index] = updatedUser;
  savePlatformUsers(users);

  // If this is the current active session user, update session
  const current = getCurrentSessionUser();
  if (current && current.id === userId) {
    setCurrentSessionUser(updatedUser);
  }

  // Also sync with the tenant's admin profile so WhatsApp alert signatures match
  if (updatedUser.tenantId && updatedUser.tenantId !== 'all') {
    syncUserProfileWithTenantAdmins(updatedUser);
  }

  return updatedUser;
}

// SYNC WITH TENANT ADMIN PROFILE
export function syncUserProfileWithTenantAdmins(user: PlatformUser): void {
  if (!user.tenantId || user.tenantId === 'all') return;
  try {
    const tenantData = loadTenantData(user.tenantId);
    let modified = false;

    // Check if an admin with the same email or id exists
    const adminIdx = tenantData.admins.findIndex(
      (a) => a.id === user.id || a.email.toLowerCase() === user.email.toLowerCase()
    );

    if (adminIdx !== -1) {
      tenantData.admins[adminIdx] = {
        ...tenantData.admins[adminIdx],
        name: user.fullName,
        email: user.email,
        phone: user.phone,
      };
      modified = true;
    } else if (user.role === 'dueño' || user.role === 'administrador') {
      // Add or update admin
      tenantData.admins.push({
        id: user.id,
        name: user.fullName,
        email: user.email,
        phone: user.phone,
        role: user.role === 'dueño' ? 'dueño' : 'administrador',
        receiveAdminAlerts: true,
        isGeneralAdmin: true,
      });
      modified = true;
    }

    if (modified) {
      saveTenantData(user.tenantId, tenantData);
    }
  } catch (e) {
    console.error('Error syncing user with tenant admins:', e);
  }
}

/**
 * Cambia el rubro completo de una empresa sobre la marcha, transformando su perfil operativo
 * en el registro Tenant y en su partición privada de configuración.
 */
export function updateTenantBusinessRubro(
  tenantId: string,
  nextRubro: BusinessRubro
): { tenant?: Tenant; config: DistributorConfig } {
  const profile = getRubroProfile(nextRubro);
  const tenantData = loadTenantData(tenantId);
  const nextConfig = applyRubroProfileToConfig(tenantData.config, profile.id);

  // Si pasa a un rubro sin preventista obligatorio y no hay vendedores cargados, aseguramos Mostrador
  if (!profile.requireSalesperson && tenantData.salespeople.length === 0) {
    tenantData.salespeople = [
      {
        id: `sal-mostrador-${Date.now()}`,
        name: 'Caja / Mostrador',
        phone: tenantData.config.distributorPhone || '',
        email: tenantData.config.distributorEmail || '',
        address: tenantData.config.distributorName || '',
        birthDate: '',
        zone: 'Local Comercial',
        active: true,
      },
    ];
  }

  tenantData.config = nextConfig;
  saveTenantData(tenantId, tenantData);

  const tenants = loadTenants();
  let updatedTenant: Tenant | undefined;
  const nextTenants = tenants.map((t) => {
    if (t.id !== tenantId) return t;
    updatedTenant = {
      ...t,
      businessRubro: profile.id,
      businessCategory: profile.label,
      config: nextConfig,
    };
    return updatedTenant;
  });
  saveTenants(nextTenants);

  return { tenant: updatedTenant, config: nextConfig };
}

