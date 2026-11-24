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
import { purgeExpiredBoletas } from './retentionPurge';
import { dbGetItem, dbSetItem, dbRemoveItem, syncKeysFromCloud } from './localInternalDb';
import { flushSupabaseSync, isCloudHydrated } from './supabaseSync';
import {
  deletePlatformAnnouncementFromSupabaseTable,
  mirrorPlatformAnnouncementToSupabaseTable,
  mirrorPlatformBillingToSupabaseTable,
  mirrorPlatformSupportToSupabaseTable,
  savePlatformMpAccessTokenSecret,
} from './supabaseServices';
import { getSupabaseClient } from './supabaseClient';

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

// INITIAL USERS - ONLY SYSTEM SUPERADMINS (NO DEMO TENANT USERS)
export const INITIAL_USERS: PlatformUser[] = [
  {
    id: 'usr-superadmin',
    username: 'admin',
    password: 'admin123',
    fullName: 'Federico Roa',
    email: 'federoa14@gmail.com',
    phone: '+54 9 11 3290-8811',
    role: 'superadmin',
    tenantId: 'all',
    tenantCode: 'MASTER',
    createdAt: new Date().toISOString().split('T')[0],
    active: true,
  },
  {
    id: 'usr-federoa',
    username: 'federoa',
    password: '123456',
    fullName: 'Federico Roa (Maestro)',
    email: 'federoa14@gmail.com',
    phone: '+54 9 11 3290-8811',
    role: 'superadmin',
    tenantId: 'all',
    tenantCode: 'MASTER',
    createdAt: new Date().toISOString().split('T')[0],
    active: true,
  },
];

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
  await syncKeysFromCloud([STORAGE_KEYS.PLATFORM_BILLING]);
  const current = loadPlatformBillingConfig();
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data } = await supabase
        .from('platform_billing_config')
        .select(
          'alias, cvu, account_holder_name, bank_or_wallet_name, default_monthly_fee, annual_discount_percent, mp_checkout_link, mp_public_key, has_mp_access_token, updated_at'
        )
        .eq('id', 'default')
        .maybeSingle();
      if (data) {
        const srvUpdated = String(data.updated_at || '');
        const curUpdated = current.updatedAt || '';
        if (!curUpdated || (srvUpdated && srvUpdated > curUpdated)) {
          const merged: PlatformBillingConfig = {
            ...current,
            alias: data.alias ?? current.alias,
            cvu: data.cvu ?? current.cvu,
            accountHolderName: data.account_holder_name ?? current.accountHolderName,
            bankOrWalletName: data.bank_or_wallet_name ?? current.bankOrWalletName,
            defaultMonthlyFee: Number(data.default_monthly_fee ?? current.defaultMonthlyFee),
            annualDiscountPercent: Number(data.annual_discount_percent ?? current.annualDiscountPercent ?? 0),
            mpCheckoutLink: data.mp_checkout_link ?? current.mpCheckoutLink,
            mpPublicKey: data.mp_public_key ?? current.mpPublicKey,
            hasMpAccessToken: Boolean(data.has_mp_access_token ?? current.hasMpAccessToken),
            updatedAt: srvUpdated || current.updatedAt,
          };
          savePlatformBillingConfig(merged);
          return merged;
        }
      }
    } catch {
      // app_cloud_store remains authoritative
    }
  }
  return current;
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
    mirrorPlatformBillingToSupabaseTable(nextConfig),
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
  await syncKeysFromCloud([STORAGE_KEYS.PLATFORM_SUPPORT]);
  const current = loadPlatformSupportConfig();
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data } = await supabase
        .from('platform_support_config')
        .select('contact_name, whatsapp_phone, email, attention_hours, welcome_message, updated_at')
        .eq('id', 'default')
        .maybeSingle();
      if (data) {
        const srvUpdated = String(data.updated_at || '');
        const curUpdated = current.updatedAt || '';
        if (!curUpdated || (srvUpdated && srvUpdated > curUpdated)) {
          const merged: PlatformSupportConfig = {
            ...current,
            contactName: data.contact_name ?? current.contactName,
            whatsappPhone: data.whatsapp_phone ?? current.whatsappPhone,
            email: data.email ?? current.email,
            attentionHours: data.attention_hours ?? current.attentionHours,
            welcomeMessage: data.welcome_message ?? current.welcomeMessage,
            updatedAt: srvUpdated || current.updatedAt,
          };
          savePlatformSupportConfig(merged);
          return merged;
        }
      }
    } catch {
      // app_cloud_store remains authoritative
    }
  }
  return current;
}

export async function persistPlatformSupportConfigToServer(
  config: PlatformSupportConfig
): Promise<PlatformSupportConfig> {
  savePlatformSupportConfig(config);
  await Promise.all([flushSupabaseSync(), mirrorPlatformSupportToSupabaseTable(config)]);
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
  await syncKeysFromCloud([STORAGE_KEYS.PLATFORM_ANNOUNCEMENTS]);
  let local = loadPlatformAnnouncements();

  const supabase = getSupabaseClient();
  if (supabase && local.length === 0) {
    try {
      const { data } = await supabase
        .from('platform_announcements')
        .select('id, title, message, category, audience, cta_type, cta_label, cta_url, active, created_at, expires_at, author_name')
        .order('created_at', { ascending: false });
      if (Array.isArray(data) && data.length > 0) {
        local = data.map((row) => ({
          id: String(row.id),
          title: String(row.title || ''),
          message: String(row.message || ''),
          category: row.category || 'novedad',
          audience: row.audience || 'all',
          ctaType: row.cta_type || 'none',
          ctaLabel: row.cta_label || '',
          ctaUrl: row.cta_url || '',
          active: Boolean(row.active),
          createdAt: String(row.created_at || new Date().toISOString()),
          expiresAt: row.expires_at || undefined,
          authorName: row.author_name || undefined,
        }));
        savePlatformAnnouncements(local);
      }
    } catch {
      // app_cloud_store remains authoritative
    }
  }

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
  await Promise.all([
    flushSupabaseSync(),
    mirrorPlatformAnnouncementToSupabaseTable(newItem),
  ]);
  return updated;
}

export async function togglePlatformAnnouncementOnServer(
  id: string,
  active: boolean
): Promise<PlatformAnnouncement[]> {
  const updated = loadPlatformAnnouncements().map((x) => (x.id === id ? { ...x, active } : x));
  savePlatformAnnouncements(updated);
  const target = updated.find((x) => x.id === id);
  await Promise.all([
    flushSupabaseSync(),
    target ? mirrorPlatformAnnouncementToSupabaseTable(target) : Promise.resolve(),
  ]);
  return updated;
}

export async function deletePlatformAnnouncementFromServer(id: string): Promise<PlatformAnnouncement[]> {
  const updated = loadPlatformAnnouncements().filter((x) => x.id !== id);
  savePlatformAnnouncements(updated);
  await Promise.all([
    flushSupabaseSync(),
    deletePlatformAnnouncementFromSupabaseTable(id),
  ]);
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
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
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
      dbSetItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
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

  // REGLA DE RETENCIÓN DE 30 DÍAS:
  // Purgar boletas mayores a 30 días y preservar el perfil crediticio permanente de los clientes
  if (data && isCloudHydrated()) {
    const purgeResult = purgeExpiredBoletas(data.boletas || [], data.paidBoletas || [], data.clients || []);
    if (purgeResult.totalPurged > 0) {
      data.boletas = purgeResult.survivingBoletas;
      data.paidBoletas = purgeResult.survivingPaidBoletas;
      data.clients = purgeResult.updatedClients;
      data.config = {
        ...data.config,
        totalPurgedBoletasCount: (data.config.totalPurgedBoletasCount || 0) + purgeResult.totalPurged,
        lastRetentionPurgeDate: new Date().toISOString().split('T')[0],
      };
      saveTenantData(tenantId, data);
      console.log(`[RETENCIÓN 30 DÍAS] Purgadas ${purgeResult.totalPurged} boletas (>30 días) para distribuidora ${tenantId}. Clientes problemáticos actualizados.`);
    }
  }

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

// USER AUTHENTICATION & MULTI-TENANT RESOLVER
export function authenticateUser(
  usernameOrEmail: string,
  pass: string,
  tenantCodeInput?: string
): { success: boolean; user?: PlatformUser; tenant?: Tenant; error?: string } {
  const users = loadPlatformUsers();
  const tenants = loadTenants();

  const cleanUser = usernameOrEmail.trim().toLowerCase();
  const cleanPass = pass.trim();
  const cleanCode = tenantCodeInput?.trim().toUpperCase();

  const matchedUser = users.find(
    (u) =>
      u.active &&
      (u.username.toLowerCase() === cleanUser || u.email.toLowerCase() === cleanUser) &&
      u.password === cleanPass
  );

  if (!matchedUser) {
    return { success: false, error: 'Usuario o contraseña incorrectos.' };
  }

  // Superadmin doesn't need tenant code
  if (matchedUser.role === 'superadmin') {
    return { success: true, user: matchedUser };
  }

  // Find tenant by user's assigned tenantId or tenantCode
  let tenant = tenants.find((t) => t.id === matchedUser.tenantId || t.tenantCode === matchedUser.tenantCode);

  // If user provided a specific tenant code, verify it matches
  if (cleanCode && tenant && tenant.tenantCode !== cleanCode) {
    return { success: false, error: `El usuario no pertenece a la distribuidora ${cleanCode}.` };
  }

  if (!tenant && cleanCode) {
    tenant = tenants.find((t) => t.tenantCode === cleanCode);
  }

  if (!tenant) {
    return { success: false, error: 'Distribuidora no encontrada o inactiva.' };
  }

  // Permitimos iniciar sesión aunque esté pausada para que App.tsx muestre la pantalla de Cuenta Pausada con botón de Pago/Reactivación
  return { success: true, user: matchedUser, tenant };
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
export function registerSelfServiceTrialTenant(
  input: SelfTrialRegistrationInput
): { success: boolean; user?: PlatformUser; tenant?: Tenant; error?: string } {
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

  if (cleanPassword.length < 4) {
    return {
      success: false,
      error: 'La contraseña debe tener al menos 4 caracteres.',
    };
  }

  if (cleanEmail && !cleanEmail.includes('@')) {
    return {
      success: false,
      error: 'El correo electrónico ingresado no es válido.',
    };
  }

  const users = loadPlatformUsers();
  const tenants = loadTenants();

  if (users.some((u) => u.username.toLowerCase() === cleanUsername)) {
    return {
      success: false,
      error: `El usuario "${cleanUsername}" ya está registrado. Elegí otro nombre de usuario.`,
    };
  }

  if (cleanEmail && users.some((u) => u.email && u.email.toLowerCase() === cleanEmail)) {
    return {
      success: false,
      error: `El correo "${cleanEmail}" ya tiene una cuenta asociada. Probá iniciar sesión o recuperar tu clave.`,
    };
  }

  let tenantCode = (input.optionalTenantCode || '').trim().toUpperCase();
  if (!tenantCode) {
    // Generar próximo código secuencial DIST-00X disponible
    let seq = tenants.length + 1;
    do {
      tenantCode = `DIST-${String(seq).padStart(3, '0')}`;
      seq++;
    } while (tenants.some((t) => t.tenantCode.toUpperCase() === tenantCode));
  } else if (tenants.some((t) => t.tenantCode.toUpperCase() === tenantCode)) {
    return {
      success: false,
      error: `El código de empresa "${tenantCode}" ya está en uso.`,
    };
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

  // Inicializar espacio privado limpio con el dueño cargado para cierres del día y alertas
  saveTenantData(newTenantId, {
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
  });

  saveTenants([...tenants, newTenant]);
  savePlatformUsers([...users, newUser]);

  return { success: true, user: newUser, tenant: newTenant };
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

// FIND USER BY EMAIL (FOR PASSWORD RECOVERY)
export function findUserByEmail(email: string): PlatformUser | undefined {
  const users = loadPlatformUsers();
  const cleanEmail = email.trim().toLowerCase();
  return users.find((u) => u.email.toLowerCase() === cleanEmail && u.active);
}

// RESET PASSWORD BY EMAIL
export function resetUserPasswordByEmail(email: string, newPassword: string): boolean {
  const users = loadPlatformUsers();
  const cleanEmail = email.trim().toLowerCase();
  const user = users.find((u) => u.email.toLowerCase() === cleanEmail && u.active);
  if (!user) return false;

  user.password = newPassword.trim();
  savePlatformUsers(users);

  // If currently logged in, update session too
  const current = getCurrentSessionUser();
  if (current && current.id === user.id) {
    setCurrentSessionUser(user);
  }

  return true;
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

