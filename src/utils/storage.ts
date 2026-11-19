import { Client, Salesperson, Administrator, Boleta, DistributorConfig, SalespersonRendicion } from '../types';
import { dbGetItem, dbSetItem, dbRemoveItem } from './localInternalDb';

const STORAGE_KEYS = {
  CONFIG: 'distribuidora_config_v2_zero',
  CLIENTS: 'distribuidora_clients_v2_zero',
  SALESPEOPLE: 'distribuidora_salespeople_v2_zero',
  ADMINS: 'distribuidora_admins_v2_zero',
  BOLETAS: 'distribuidora_boletas_v2_zero',
  PAID_BOLETAS: 'distribuidora_paid_boletas_v2_zero',
  MARKETING_ASSETS: 'distribuidora_marketing_v2_zero',
  BROADCASTS: 'distribuidora_broadcasts_v2_zero',
  DISPATCH_LOGS: 'distribuidora_dispatch_logs_v2_zero',
  RENDICIONES: 'distribuidora_rendiciones_v1',
};

// Purge old mock/demo keys from previous iterations
function purgeLegacyDemoKeys() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const keysToPurge = [
        'distribuidora_config_v1',
        'distribuidora_clients_v1',
        'distribuidora_salespeople_v1',
        'distribuidora_admins_v1',
        'distribuidora_boletas_v1',
        'distribuidora_paid_boletas_v1',
        'distribuidora_marketing_v1',
        'distribuidora_broadcasts_v1',
        'distribuidora_dispatch_logs_v1',
        'saas_distribuidoras_tenants_v1',
        'saas_distribuidoras_users_v1',
        'saas_distribuidoras_session_user_v1',
        'saas_distribuidoras_active_tenant_id_v1',
        'saas_distribuidora_data_dist-bebidas',
        'saas_distribuidora_data_dist-lacteos',
      ];
      for (const k of keysToPurge) {
        dbRemoveItem(k);
      }
    }
  } catch (e) {
    // Ignore storage errors in non-browser envs
  }
}
purgeLegacyDemoKeys();

// Default initial clean config
export const DEFAULT_CONFIG: DistributorConfig = {
  distributorName: 'Mi Empresa',
  distributorPhone: '',
  distributorEmail: '',
  defaultTermDays: 7,
  vendedorReminderDays: 2,
  adminAlertDays: 6,
  overdueAlertDays: 7,
  currencySymbol: '$',
  activeAdminId: '',
  customCobranzaTemplate: 'Hola {vendedor}, soy {adminActual} y necesito que vayas a cobrarle a {cliente} la boleta #{boleta} por un monto de {monto}. La venta fue el {fechaVenta} ({dias} días) y vence el {vencimiento}. Por favor confirmame en cuanto pases por el local.',
  customOverdueTemplate: '🚨 URGENTE {vendedor}: Soy {adminActual}. Hoy tenés que salir a la calle sí o sí a cobrarle a {cliente} la boleta #{boleta} por {monto} que ya está vencida.',
  autoDispatchEnabled: true,
  autoDispatchChannels: 'both',
  autoDispatchTime: '08:00',
  dailyClosingEnabled: true,
  dailyClosingTime: '19:00',
  senderPhone: '',
  senderEmail: '',
  tenantId: '',
  tenantCode: '',
  whatsappProvider: 'server_daemon',
  notifyOwnerOnlyIfPertinent: true,
  boletaRetentionDays: 30,
  totalPurgedBoletasCount: 0,
  defaultExtensionDays: 3,
  overdueGraceDays: 5,
  enableClientWhatsAppReminders: false,
  includeClientsInAutoDispatch: false,
  customClientOverdueTemplate: 'Hola {cliente}, le informamos desde {distribuidora} que la boleta/factura #{boleta} por un monto de {monto} venció el {vencimiento} ({dias} días). Le solicitamos tener preparado el importe para cuando pase nuestro vendedor {vendedor} o coordinar transferencia. ¡Muchas gracias!',
  businessRubro: 'distribuidora',
  enforceSinglePendingBoleta: true,
  merchantPaymentAlias: '',
  merchantPaymentCvu: '',
  merchantPaymentBank: '',
  merchantPaymentHolder: '',
  lateSurchargeEnabled: false,
  lateSurchargePercent: 5,
  lateSurchargeAfterDays: 5,
  defaultInstallmentInterestPercent: 10,
};

// Initial Seed Data - Clean Slate
const INITIAL_ADMINS: Administrator[] = [];

const INITIAL_SALESPEOPLE: Salesperson[] = [];
const INITIAL_CLIENTS: Client[] = [];
const INITIAL_BOLETAS: Boleta[] = [];
const INITIAL_PAID_BOLETAS: Boleta[] = [];

// Helper methods for Internal DB (IndexedDB + cache)
export function loadConfig(): DistributorConfig {
  try {
    const raw = dbGetItem(STORAGE_KEYS.CONFIG);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('Error reading config from internal db', e);
  }
  return DEFAULT_CONFIG;
}

export function saveConfig(config: DistributorConfig): void {
  try {
    dbSetItem(STORAGE_KEYS.CONFIG, JSON.stringify(config));
  } catch (e) {
    console.error('Error saving config to internal db', e);
  }
}

export function loadClients(): Client[] {
  try {
    const raw = dbGetItem(STORAGE_KEYS.CLIENTS);
    if (raw) {
      const parsed: Client[] = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (e) {
    console.warn('Error reading clients from internal db', e);
  }
  return INITIAL_CLIENTS;
}

export function saveClients(clients: Client[]): void {
  try {
    dbSetItem(STORAGE_KEYS.CLIENTS, JSON.stringify(clients));
  } catch (e) {
    console.error('Error saving clients', e);
  }
}

export function loadSalespeople(): Salesperson[] {
  try {
    const raw = dbGetItem(STORAGE_KEYS.SALESPEOPLE);
    if (raw) {
      const parsed: Salesperson[] = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (e) {
    console.warn('Error reading salespeople', e);
  }
  return INITIAL_SALESPEOPLE;
}

export function saveSalespeople(salespeople: Salesperson[]): void {
  try {
    dbSetItem(STORAGE_KEYS.SALESPEOPLE, JSON.stringify(salespeople));
  } catch (e) {
    console.error('Error saving salespeople', e);
  }
}

export function loadAdministrators(): Administrator[] {
  try {
    const raw = dbGetItem(STORAGE_KEYS.ADMINS);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('Error reading administrators', e);
  }
  return INITIAL_ADMINS;
}

export function saveAdministrators(admins: Administrator[]): void {
  try {
    dbSetItem(STORAGE_KEYS.ADMINS, JSON.stringify(admins));
  } catch (e) {
    console.error('Error saving administrators', e);
  }
}

export function loadBoletas(): Boleta[] {
  try {
    const raw = dbGetItem(STORAGE_KEYS.BOLETAS);
    if (raw) {
      const parsed: Boleta[] = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (e) {
    console.warn('Error reading boletas', e);
  }
  return INITIAL_BOLETAS;
}

export function saveBoletas(boletas: Boleta[]): void {
  try {
    dbSetItem(STORAGE_KEYS.BOLETAS, JSON.stringify(boletas));
  } catch (e) {
    console.error('Error saving boletas', e);
  }
}

export function loadPaidBoletas(): Boleta[] {
  try {
    const raw = dbGetItem(STORAGE_KEYS.PAID_BOLETAS);
    if (raw) {
      const parsed: Boleta[] = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (e) {
    console.warn('Error reading paid boletas', e);
  }
  return INITIAL_PAID_BOLETAS;
}

export function savePaidBoletas(paidBoletas: Boleta[]): void {
  try {
    dbSetItem(STORAGE_KEYS.PAID_BOLETAS, JSON.stringify(paidBoletas));
  } catch (e) {
    console.error('Error saving paid boletas', e);
  }
}

export interface MarketingAsset {
  id: string;
  type: 'image' | 'video';
  url: string;
  title: string;
  prompt: string;
  aspectRatio: string;
  resolution?: string; // 1K, 2K, 4K
  createdAt: string;
}

export function loadMarketingAssets(): MarketingAsset[] {
  try {
    const raw = dbGetItem(STORAGE_KEYS.MARKETING_ASSETS);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return [];
}

export function saveMarketingAssets(assets: MarketingAsset[]): void {
  try {
    dbSetItem(STORAGE_KEYS.MARKETING_ASSETS, JSON.stringify(assets));
  } catch (e) {}
}

const INITIAL_BROADCASTS: any[] = [];

export function loadBroadcastMessages() {
  try {
    const raw = dbGetItem(STORAGE_KEYS.BROADCASTS);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return INITIAL_BROADCASTS;
}

export function saveBroadcastMessages(msgs: any[]): void {
  try {
    dbSetItem(STORAGE_KEYS.BROADCASTS, JSON.stringify(msgs));
  } catch (e) {}
}

export function loadAutoDispatchLogs(): any[] {
  try {
    const raw = dbGetItem(STORAGE_KEYS.DISPATCH_LOGS);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return [];
}

export function saveAutoDispatchLogs(logs: any[]): void {
  try {
    dbSetItem(STORAGE_KEYS.DISPATCH_LOGS, JSON.stringify(logs));
  } catch (e) {}
}

export function loadRendiciones(): SalespersonRendicion[] {
  try {
    const raw = dbGetItem(STORAGE_KEYS.RENDICIONES);
    if (raw) {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (e) {}
  return [];
}

export function saveRendiciones(rendiciones: SalespersonRendicion[]): void {
  try {
    dbSetItem(STORAGE_KEYS.RENDICIONES, JSON.stringify(rendiciones));
  } catch (e) {}
}

export function resetOperationalData(): void {
  saveClients([]);
  saveSalespeople([]);
  saveBoletas([]);
  savePaidBoletas([]);
  saveBroadcastMessages([]);
  saveAutoDispatchLogs([]);
  saveRendiciones([]);
}
