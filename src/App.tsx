import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import {
  Search,
  PlusCircle,
  Flame,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Calendar,
  RotateCcw,
  DollarSign,
  FileText,
  Database,
  ShieldAlert,
  CreditCard,
  LayoutGrid,
  List,
  Download,
  Receipt,
  MessageCircle,
  Pause,
  Snowflake,
  Megaphone,
  X,
  ExternalLink,
  ShoppingBag,
  Eye,
} from 'lucide-react';
import {
  Boleta,
  Client,
  Salesperson,
  Administrator,
  DistributorConfig,
  BroadcastMessage,
  AutoDispatchLog,
  PartialPayment,
  BoletaExtension,
  BoletaCreditNote,
  BoletaCreditNoteReason,
  CollectionVisitStatus,
  CollectionVisitLog,
  BusinessRubro,
  ClientPaymentOrder,
  PlatformAnnouncement,
  SalespersonRendicion,
  RendicionRouteItem,
  OnlineCatalogSettings,
  CatalogProduct,
  CatalogPickupOrder,
  CatalogPromoSubscriber,
  CatalogStockAlertRequest,
  CatalogLoyaltyAccount,
  CatalogAbandonedCart,
  CatalogGiftCard,
  SubscriptionPlanTier,
  PlatformBillingConfig,
  PublishedPublicCatalog,
  SaleLineItem,
  TenantPlanChangeRecord,
} from './types';
import {
  loadConfig,
  saveConfig,
  loadClients,
  saveClients,
  loadSalespeople,
  saveSalespeople,
  loadAdministrators,
  saveAdministrators,
  loadBoletas,
  saveBoletas,
  loadPaidBoletas,
  savePaidBoletas,
  loadBroadcastMessages,
  saveBroadcastMessages,
  loadAutoDispatchLogs,
  saveAutoDispatchLogs,
  loadRendiciones,
  saveRendiciones,
  resetOperationalData,
} from './utils/storage';
import { purgeExpiredBoletas, ensureClientCreditHistory, getDaysElapsed } from './utils/retentionPurge';
import { calculateAlertStatus, formatCurrency, addDaysToDate, formatDateEs, getBoletaBalance } from './utils/alerts';
import { createWhatsAppUrl, generateUserSignedReminder } from './utils/whatsapp';
import {
  ExcessPaymentAllocationPlan,
  CreditNoteAllocationPlan,
  applyRubroProfileToConfig,
  getRubroProfile,
  calculateExcessPaymentAllocation,
} from './utils/businessMode';
import { analyzeColdClientsForIndumentaria } from './utils/coldClientsRadar';
import { applyOrderStockDeltaToProducts, normalizeDni } from './utils/catalogStock';
import { Header } from './components/Header';
import { SidebarNav } from './components/SidebarNav';
import { QuickGuideModal } from './components/QuickGuideModal';
import { EditBrandModal } from './components/EditBrandModal';
import { BoletaCard } from './components/BoletaCard';
import type { BasketCheckoutPayload } from './components/NewBoletaModal';
import { MarkAsPaidModal } from './components/MarkAsPaidModal';
import { PartialPaymentModal } from './components/PartialPaymentModal';
import { AlertsCenterModal } from './components/AlertsCenterModal';
import { ExtendBoletaModal } from './components/ExtendBoletaModal';
import { CollectionVisitModal, getVisitOutcomeMeta } from './components/CollectionVisitModal';
import { CriticalOverdueBubbleModal } from './components/CriticalOverdueBubbleModal';
import { LoginPage } from './components/LoginPage';
import { UserProfileModal } from './components/UserProfileModal';
import { RubroClientMigrationModal } from './components/RubroClientMigrationModal';
import { TenantSubscriptionPayModal } from './components/TenantSubscriptionPayModal';
import { PaymentReceiptModal, ReceiptModalData } from './components/PaymentReceiptModal';
import { ReturnCreditNoteModal } from './components/ReturnCreditNoteModal';
import { ContactChannelsModal } from './components/ContactChannelsModal';
import { ClientStatementQuickShareModal } from './components/ClientStatementQuickShareModal';
import { WebOrderDetailModal } from './components/WebOrderDetailModal';
import {
  WebOrderReturnModal,
  WebOrderReturnConfirmPayload,
} from './components/WebOrderReturnModal';
import { PlanUpgradeModal, PlanUpgradeTriggerContext } from './components/PlanUpgradeModal';
import { TermsConditionsScrollBox } from './components/TermsConditionsModal';
import { getPlanTransitionImpactSummary, TERMS_VERSION } from './utils/termsAndConditions';

const NewBoletaModal = lazy(() =>
  import('./components/NewBoletaModal').then((m) => ({ default: m.NewBoletaModal }))
);
const UnpaidBoletasView = lazy(() =>
  import('./components/UnpaidBoletasView').then((m) => ({ default: m.UnpaidBoletasView }))
);
const QuickCollectionAgendaView = lazy(() =>
  import('./components/QuickCollectionAgendaView').then((m) => ({ default: m.QuickCollectionAgendaView }))
);
const PaymentHistoryView = lazy(() =>
  import('./components/PaymentHistoryView').then((m) => ({ default: m.PaymentHistoryView }))
);
const CreditAuditManager = lazy(() =>
  import('./components/CreditAuditManager').then((m) => ({ default: m.CreditAuditManager }))
);
const ClientsManager = lazy(() =>
  import('./components/ClientsManager').then((m) => ({ default: m.ClientsManager }))
);
const SalespeopleManager = lazy(() =>
  import('./components/SalespeopleManager').then((m) => ({ default: m.SalespeopleManager }))
);
const AdminSettingsView = lazy(() =>
  import('./components/AdminSettingsView').then((m) => ({ default: m.AdminSettingsView }))
);
const MarketingStudio = lazy(() =>
  import('./components/MarketingStudio').then((m) => ({ default: m.MarketingStudio }))
);
const BroadcastManager = lazy(() =>
  import('./components/BroadcastManager').then((m) => ({ default: m.BroadcastManager }))
);
const AutomatedDispatchManager = lazy(() =>
  import('./components/AutomatedDispatchManager').then((m) => ({ default: m.AutomatedDispatchManager }))
);
const SuperAdminPanel = lazy(() =>
  import('./components/SuperAdminPanel').then((m) => ({ default: m.SuperAdminPanel }))
);
const PublicClientPayView = lazy(() =>
  import('./components/PublicClientPayView').then((m) => ({ default: m.PublicClientPayView }))
);
const PublicTenantSubPayView = lazy(() =>
  import('./components/PublicTenantSubPayView').then((m) => ({ default: m.PublicTenantSubPayView }))
);
const SalespersonRendicionView = lazy(() =>
  import('./components/SalespersonRendicionView').then((m) => ({ default: m.SalespersonRendicionView }))
);
const CatalogManager = lazy(() =>
  import('./components/CatalogManager').then((m) => ({ default: m.CatalogManager }))
);
const PublicCatalogView = lazy(() =>
  import('./components/PublicCatalogView').then((m) => ({ default: m.PublicCatalogView }))
);
const WebSalesHistoryView = lazy(() =>
  import('./components/WebSalesHistoryView').then((m) => ({ default: m.WebSalesHistoryView }))
);

const LazyViewFallback = () => (
  <div className="flex items-center justify-center py-16 text-xs font-semibold text-slate-500 dark:text-slate-400">
    Cargando módulo...
  </div>
);
import {
  getCurrentSessionUser,
  setCurrentSessionUser,
  loadTenants,
  saveTenants,
  loadTenantData,
  saveTenantData,
  getActiveTenantId,
  setActiveTenantId,
  fetchPlatformAnnouncementsFromServer,
  loadDismissedAnnouncementIds,
  dismissAnnouncementId,
  syncTenantDataFromSupabase,
  syncAuthCatalogFromSupabase,
  loadPlatformBillingConfig,
  fetchPlatformBillingConfigFromServer,
} from './utils/multiTenantStorage';
import { SUPABASE_SYNC_EVENT } from './utils/supabaseSync';
import { ensureCloudHydrated } from './utils/localInternalDb';
import {
  fetchCatalogAbandonedCartsForTenantFromSupabase,
  fetchCatalogGiftCardsForTenantFromSupabase,
  fetchCatalogLoyaltyAccountsForTenantFromSupabase,
  fetchCatalogOrdersForTenantFromSupabase,
  fetchCatalogPromoSubscribersForTenantFromSupabase,
  fetchCatalogStockAlertsForTenantFromSupabase,
  fetchPendingReconciliationOrdersFromSupabase,
  fetchVerifiedTenantPaymentStatusFromSupabase,
  markClientPaymentOrderReconciledInSupabase,
  publishPublicCatalogToSupabase,
  saveMerchantMpAccessTokenSecret,
  setPublicCatalogSuperAdminEnabledInSupabase,
  syncCatalogOrderToSupabase,
  upsertCatalogGiftCardToSupabase,
  upsertCatalogLoyaltyAccountToSupabase,
  upsertPublicAbandonedCartToSupabase,
  verifyAndRecordTenantPaymentInSupabase,
  verifyCatalogTransferReceiptViaServer,
} from './utils/supabaseServices';
import {
  executeBlockedChargeAlertDirect,
  executeDailyAlertsDirect,
  executeDailyClosingDirect,
} from './utils/clientDispatchEngine';
import {
  getTenantSubscriptionStatus,
  getCurrentMonthInfo,
  toggleTenantMonthlyPayment,
  setTenantPausedState,
  ensureTenantSubscription,
  getSubscriptionPlanDefinitions,
  getPlanDefinitionByTier,
  getTenantEffectiveFeatureAccess,
  resolveTenantPlanTier,
} from './utils/tenantSubscription';
import { PlatformUser, Tenant } from './types';

export default function App() {
  // Public Client Payment Link mode (?pay_client=token) - No login required for client checkout
  const [clientPayToken, setClientPayToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const token = new URLSearchParams(window.location.search).get('pay_client');
    return token && token.trim() ? token.trim() : null;
  });

  // Public Online Catalog mode (?catalog=handle) - No login required for buyers
  const [publicCatalogHandle, setPublicCatalogHandle] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const handle = new URLSearchParams(window.location.search).get('catalog');
    return handle && handle.trim() ? handle.trim() : null;
  });

  // Public Tenant Subscription Payment mode (?sub_pay=token)
  const [tenantSubPayToken, setTenantSubPayToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const token = new URLSearchParams(window.location.search).get('sub_pay');
    return token && token.trim() ? token.trim() : null;
  });

  // User Session & Multi-Tenant Platform State
  const [currentUser, setCurrentUser] = useState<PlatformUser | null>(getCurrentSessionUser);
  const [allTenants, setAllTenants] = useState<Tenant[]>(loadTenants);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(() => {
    const user = getCurrentSessionUser();
    if (!user) return null;
    const tenantsList = loadTenants();
    if (user.role === 'superadmin') {
      return null;
    }
    return tenantsList.find((t) => t.id === user.tenantId) || tenantsList[0] || null;
  });

  // Global State (Tenant-partitioned data)
  const [config, setConfig] = useState<DistributorConfig>(() => {
    const user = getCurrentSessionUser();
    if (user && user.role !== 'superadmin') {
      const t = loadTenants().find((x) => x.id === user.tenantId);
      if (t) return loadTenantData(t.id).config;
    }
    return loadConfig();
  });
  const [clients, setClients] = useState<Client[]>(loadClients);
  const [salespeople, setSalespeople] = useState<Salesperson[]>(loadSalespeople);
  const [admins, setAdmins] = useState<Administrator[]>(loadAdministrators);
  const [boletas, setBoletas] = useState<Boleta[]>(loadBoletas);
  const [paidBoletas, setPaidBoletas] = useState<Boleta[]>(loadPaidBoletas);
  const [broadcasts, setBroadcasts] = useState<BroadcastMessage[]>(loadBroadcastMessages);
  const [autoLogs, setAutoLogs] = useState<AutoDispatchLog[]>(loadAutoDispatchLogs);
  const [rendiciones, setRendiciones] = useState<SalespersonRendicion[]>(loadRendiciones);
  const [catalogSettings, setCatalogSettings] = useState<OnlineCatalogSettings>(() => {
    const user = getCurrentSessionUser();
    if (user && user.role !== 'superadmin' && user.tenantId) {
      return loadTenantData(user.tenantId).catalogSettings || { published: true };
    }
    return { published: true };
  });
  const [catalogProducts, setCatalogProducts] = useState<CatalogProduct[]>(() => {
    const user = getCurrentSessionUser();
    if (user && user.role !== 'superadmin' && user.tenantId) {
      return loadTenantData(user.tenantId).catalogProducts || [];
    }
    return [];
  });
  const [catalogOrders, setCatalogOrders] = useState<CatalogPickupOrder[]>(() => {
    const user = getCurrentSessionUser();
    if (user && user.role !== 'superadmin' && user.tenantId) {
      return loadTenantData(user.tenantId).catalogOrders || [];
    }
    return [];
  });
  const [catalogStockAlerts, setCatalogStockAlerts] = useState<CatalogStockAlertRequest[]>(() => {
    const user = getCurrentSessionUser();
    if (user && user.role !== 'superadmin' && user.tenantId) {
      return loadTenantData(user.tenantId).catalogStockAlerts || [];
    }
    return [];
  });
  const [catalogPromoSubscribers, setCatalogPromoSubscribers] = useState<CatalogPromoSubscriber[]>(
    () => {
      const user = getCurrentSessionUser();
      if (user && user.role !== 'superadmin' && user.tenantId) {
        return loadTenantData(user.tenantId).catalogPromoSubscribers || [];
      }
      return [];
    }
  );
  const [catalogLoyaltyAccounts, setCatalogLoyaltyAccounts] = useState<CatalogLoyaltyAccount[]>(() => {
    const user = getCurrentSessionUser();
    if (user && user.role !== 'superadmin' && user.tenantId) {
      return loadTenantData(user.tenantId).catalogLoyaltyAccounts || [];
    }
    return [];
  });
  const [catalogAbandonedCarts, setCatalogAbandonedCarts] = useState<CatalogAbandonedCart[]>(() => {
    const user = getCurrentSessionUser();
    if (user && user.role !== 'superadmin' && user.tenantId) {
      return loadTenantData(user.tenantId).catalogAbandonedCarts || [];
    }
    return [];
  });
  const [catalogGiftCards, setCatalogGiftCards] = useState<CatalogGiftCard[]>(() => {
    const user = getCurrentSessionUser();
    if (user && user.role !== 'superadmin' && user.tenantId) {
      return loadTenantData(user.tenantId).catalogGiftCards || [];
    }
    return [];
  });
  const [platformBillingCfg, setPlatformBillingCfg] = useState<PlatformBillingConfig>(loadPlatformBillingConfig);

  useEffect(() => {
    fetchPlatformBillingConfigFromServer()
      .then((cfg) => setPlatformBillingCfg(cfg))
      .catch(() => {});
  }, []);

  // Helper to load complete dataset for a specific tenant
  const loadDataForTenant = (tenantId: string) => {
    const data = loadTenantData(tenantId);
    const tenantMeta = loadTenants().find((t) => t.id === tenantId);
    const syncedConfig =
      tenantMeta && !data.config.distributorLogoUrl && tenantMeta.logoUrl
        ? { ...data.config, distributorLogoUrl: tenantMeta.logoUrl }
        : data.config;
    setConfig(syncedConfig);
    setClients(data.clients);
    setSalespeople(data.salespeople);
    setAdmins(data.admins);
    setBoletas(data.boletas);
    setPaidBoletas(data.paidBoletas);
    setBroadcasts(data.broadcasts);
    setAutoLogs(data.autoLogs);
    setRendiciones(data.rendiciones || []);
    const baseCatalogSettings = data.catalogSettings || { published: true };
    setCatalogSettings(
      tenantMeta?.catalogRubro
        ? { ...baseCatalogSettings, catalogRubro: tenantMeta.catalogRubro }
        : baseCatalogSettings
    );
    setCatalogProducts(data.catalogProducts || []);
    setCatalogOrders(data.catalogOrders || []);
    setCatalogStockAlerts(data.catalogStockAlerts || []);
    setCatalogPromoSubscribers(data.catalogPromoSubscribers || []);
    setCatalogLoyaltyAccounts(data.catalogLoyaltyAccounts || []);
    setCatalogAbandonedCarts(data.catalogAbandonedCarts || []);
    setCatalogGiftCards(data.catalogGiftCards || []);
  };

  // Sync data whenever selected tenant changes (local cache + Supabase cloud refresh)
  useEffect(() => {
    if (!selectedTenant) return;
    let active = true;
    loadDataForTenant(selectedTenant.id);
    syncTenantDataFromSupabase(selectedTenant.id).then((updated) => {
      if (active && updated) {
        loadDataForTenant(selectedTenant.id);
        const freshList = loadTenants();
        setAllTenants(freshList);
        const updatedSelf = freshList.find((t) => t.id === selectedTenant.id);
        if (updatedSelf) setSelectedTenant(updatedSelf);
      }
    });
    return () => {
      active = false;
    };
  }, [selectedTenant?.id]);

  // Listen for Realtime Supabase changes and periodic window focus refreshes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let lastFocusSync = 0;

    const handleCloudUpdate = (ev: Event) => {
      const detail = (ev as CustomEvent<{ keys?: string[] }>).detail;
      const keys = detail?.keys || [];
      const freshList = loadTenants();
      setAllTenants(freshList);

      if (selectedTenant) {
        const tenantKey = `saas_distribuidora_data_v2_${selectedTenant.id}`;
        if (keys.length === 0 || keys.includes(tenantKey)) {
          loadDataForTenant(selectedTenant.id);
        }
        const updatedSelf = freshList.find((t) => t.id === selectedTenant.id);
        if (updatedSelf) setSelectedTenant(updatedSelf);
      }
    };

    const handleWindowFocus = () => {
      const now = Date.now();
      if (now - lastFocusSync < 15000) return;
      lastFocusSync = now;
      if (selectedTenant) {
        syncTenantDataFromSupabase(selectedTenant.id).then((updated) => {
          if (updated) {
            loadDataForTenant(selectedTenant.id);
            const freshList = loadTenants();
            setAllTenants(freshList);
          }
        });
      } else if (currentUser?.role === 'superadmin') {
        syncAuthCatalogFromSupabase().then(() => {
          setAllTenants(loadTenants());
        });
      }
    };

    window.addEventListener(SUPABASE_SYNC_EVENT, handleCloudUpdate);
    window.addEventListener('focus', handleWindowFocus);
    return () => {
      window.removeEventListener(SUPABASE_SYNC_EVENT, handleCloudUpdate);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [selectedTenant?.id, currentUser?.role]);

  // Active Navigation Tab
  const [activeTab, setActiveTab] = useState<string>('boletas');

  // Si cambia a un rubro distinto de Distribuidora/Mayorista mientras estaba en Rendición, volver a Boletas
  useEffect(() => {
    const effectiveRubro = config.businessRubro || 'distribuidora';
    if (activeTab === 'rendicion' && effectiveRubro !== 'distribuidora') {
      setActiveTab('boletas');
    }
    const webAllowed = selectedTenant
      ? getTenantEffectiveFeatureAccess(selectedTenant).canAccessWebCatalog
      : true;
    if ((activeTab === 'catalogo' || activeTab === 'ventas_web') && !webAllowed) {
      setActiveTab('boletas');
    }
  }, [
    config.businessRubro,
    activeTab,
    selectedTenant?.catalogEnabled,
    selectedTenant?.subscription?.planTier,
    selectedTenant?.status,
  ]);

  useEffect(() => {
    if (
      (activeTab === 'catalogo' ||
        activeTab === 'ventas_web' ||
        activeTab === 'boletas' ||
        (activeTab === 'clientes' && selectedTenant?.catalogEnabled !== false)) &&
      selectedTenant
    ) {
      void handleRefreshCatalogOrders();
      if (
        activeTab === 'catalogo' ||
        activeTab === 'ventas_web' ||
        activeTab === 'clientes'
      ) {
        void handleRefreshCatalogLoyaltyAccounts();
      }
      if (activeTab === 'catalogo' || activeTab === 'ventas_web') {
        void handleRefreshCatalogAbandonedCarts();
        void handleRefreshCatalogGiftCards();
      }
      if (activeTab === 'catalogo' || activeTab === 'boletas') {
        void handleRefreshCatalogStockAlerts();
      }
    }
  }, [activeTab, selectedTenant?.id]);

  // Modal States
  const [isNewBoletaOpen, setIsNewBoletaOpen] = useState(false);
  const [preselectedClientForNewBoleta, setPreselectedClientForNewBoleta] = useState<string | null>(null);
  const [rubroMigrationRequest, setRubroMigrationRequest] = useState<{
    targetRubro: BusinessRubro;
    pendingConfig?: DistributorConfig;
  } | null>(null);
  const [isAlertsCenterOpen, setIsAlertsCenterOpen] = useState(false);
  const [selectedBoletaForPayment, setSelectedBoletaForPayment] = useState<Boleta | null>(null);
  const [selectedBoletaForPartial, setSelectedBoletaForPartial] = useState<Boleta | null>(null);
  const [selectedBoletaForExtend, setSelectedBoletaForExtend] = useState<Boleta | null>(null);
  const [selectedBoletaForVisit, setSelectedBoletaForVisit] = useState<Boleta | null>(null);
  const [selectedBoletaForCreditNote, setSelectedBoletaForCreditNote] = useState<Boleta | null>(null);
  const [clientsInitialSection, setClientsInitialSection] = useState<'directory' | 'cold_radar'>('directory');
  const [isExtendModalOpen, setIsExtendModalOpen] = useState(false);
  const [isCriticalBubbleOpen, setIsCriticalBubbleOpen] = useState(false);
  const [isUserProfileOpen, setIsUserProfileOpen] = useState(false);
  const [isSubscriptionPayOpen, setIsSubscriptionPayOpen] = useState(false);
  const [chosenPlanTierForPayModal, setChosenPlanTierForPayModal] = useState<
    SubscriptionPlanTier | undefined
  >(undefined);
  const [autoGenSubPayLink, setAutoGenSubPayLink] = useState(false);
  const [planUpgradePrompt, setPlanUpgradePrompt] =
    useState<PlanUpgradeTriggerContext | null>(null);
  const [pendingGatePlanTier, setPendingGatePlanTier] =
    useState<SubscriptionPlanTier | null>(null);
  const [gatePlanTermsAccepted, setGatePlanTermsAccepted] = useState(false);
  const promptedTrialExpiredTenantRef = useRef<string | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isQuickGuideOpen, setIsQuickGuideOpen] = useState(false);
  const [isEditBrandModalOpen, setIsEditBrandModalOpen] = useState(false);
  const [isContactChannelsOpen, setIsContactChannelsOpen] = useState(false);
  const [activeReceiptData, setActiveReceiptData] = useState<ReceiptModalData | null>(null);
  const [selectedWebOrderDetail, setSelectedWebOrderDetail] = useState<CatalogPickupOrder | null>(null);
  const [selectedWebOrderForReturn, setSelectedWebOrderForReturn] =
    useState<CatalogPickupOrder | null>(null);
  const [statementShareTarget, setStatementShareTarget] = useState<{
    client: Client;
    sourceBoletaNumber?: string;
  } | null>(null);
  const [platformAnnouncements, setPlatformAnnouncements] = useState<PlatformAnnouncement[]>([]);
  const [dismissedAnnouncementIds, setDismissedAnnouncementIds] = useState<string[]>([]);

  // Filter and Sort states for pending boletas
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'urgent_10d' | 'overdue' | 'admin_alert' | 'vendedor_3dias' | 'normal'>('all');
  const [selectedSalespersonFilter, setSelectedSalespersonFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'days_desc' | 'due_asc' | 'amount_desc'>('days_desc');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // Confirmation UI for voluntary pause during trial
  const [confirmTrialPauseInline, setConfirmTrialPauseInline] = useState(false);
  const lastAutoClosingAttemptRef = useRef<string>('');

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Cargar comunicados y novedades globales del SuperAdministrador para esta cuenta
  useEffect(() => {
    if (!selectedTenant || currentUser?.role === 'superadmin') return;
    setDismissedAnnouncementIds(loadDismissedAnnouncementIds(selectedTenant.id));
    const subStatus = getTenantSubscriptionStatus(selectedTenant);
    const audienceKey = selectedTenant.subscription?.isPaused
      ? 'paused'
      : subStatus.status === 'trial_active'
      ? 'trial'
      : 'active';
    fetchPlatformAnnouncementsFromServer({ onlyActive: true, audience: audienceKey }).then((list) => {
      setPlatformAnnouncements(list);
    });
  }, [selectedTenant?.id, selectedTenant?.subscription?.isPaused, currentUser?.role]);

  const handleDismissAnnouncement = (annId: string) => {
    const next = dismissAnnouncementId(annId, selectedTenant?.id);
    setDismissedAnnouncementIds(next);
  };

  const openQuickStatementForClient = (client: Client, sourceBoletaNumber?: string) => {
    setStatementShareTarget({ client, sourceBoletaNumber });
  };

  const openQuickStatementForBoleta = (boleta: Boleta) => {
    const matchedClient =
      clients.find((c) => c.id === boleta.clientId) ||
      clients.find((c) => c.name.trim().toLowerCase() === boleta.clientName.trim().toLowerCase());

    const resolvedClient: Client = matchedClient || {
      id: boleta.clientId || `temp-${boleta.id}`,
      clientNumber: 'S/N',
      name: boleta.clientName,
      contactPerson: boleta.clientName,
      phone: boleta.clientPhone || '',
      email: '',
      address: boleta.clientAddress || '',
      zone: '',
      assignedSalespersonId: boleta.salespersonId || '',
      createdAt: boleta.saleDate || new Date().toISOString().split('T')[0],
    };

    openQuickStatementForClient(resolvedClient, boleta.boletaNumber);
  };

  const handleAddAutoLogs = (newLogs: AutoDispatchLog[]) => {
    const updated = [...newLogs, ...autoLogs];
    setAutoLogs(updated);
    if (selectedTenant) {
      const cur = loadTenantData(selectedTenant.id);
      cur.autoLogs = updated;
      saveTenantData(selectedTenant.id, cur);
    }
    saveAutoDispatchLogs(updated);
  };

  const handleClearAutoLogs = () => {
    setAutoLogs([]);
    if (selectedTenant) {
      const cur = loadTenantData(selectedTenant.id);
      cur.autoLogs = [];
      saveTenantData(selectedTenant.id, cur);
    }
    saveAutoDispatchLogs([]);
    showToast('Historial de despachos automáticos limpiado.');
  };

  // Tenant state persistence is synced directly to Supabase via saveBoletas / saveTenantData.

  // Helper to classify tenant into Plan 1, Plan 2 or Plan 3 with accepted Terms & Conditions
  const handleSelectTenantPlanTier = (
    targetTenantId: string,
    tier: SubscriptionPlanTier,
    termsMeta?: { acceptedTermsAt: string; termsVersion: string }
  ) => {
    const planDef = getPlanDefinitionByTier(tier, platformBillingCfg);
    const nextCatalogEnabled = tier !== 'basico';
    const freshList = loadTenants();
    const targetBefore = freshList.find((t) => t.id === targetTenantId) || null;
    let updatedTargetForCloud: Tenant | null = null;
    if (targetBefore) {
      const sub = ensureTenantSubscription(targetBefore);
      const prevTier = resolveTenantPlanTier(targetBefore);
      const prevDef = prevTier ? getPlanDefinitionByTier(prevTier, platformBillingCfg) : null;
      const nowIso = termsMeta?.acceptedTermsAt || new Date().toISOString();
      const usedTermsVersion = termsMeta?.termsVersion || TERMS_VERSION;
      const changeRec: TenantPlanChangeRecord | undefined =
        prevTier !== tier
          ? {
              id: `pchange-${Date.now()}`,
              fromTier: prevTier,
              toTier: tier,
              fromLabel: prevDef ? `${prevDef.sectionBadge} · ${prevDef.shortName}` : 'Prueba / Sin Plan',
              toLabel: `${planDef.sectionBadge} · ${planDef.shortName}`,
              previousMonthlyFee: sub.monthlyFee,
              newMonthlyFee: planDef.monthlyPrice,
              changedAt: nowIso,
              changedBy: 'tenant_self_upgrade',
              triggerReason: prevTier
                ? `Cambio de plan (${prevDef?.sectionBadge || prevTier} → ${planDef.sectionBadge})`
                : `Selección inicial de plan (${planDef.sectionBadge})`,
              acceptedTerms: true,
              acceptedTermsAt: nowIso,
              termsVersion: usedTermsVersion,
            }
          : sub.lastPlanChange;
      updatedTargetForCloud = {
        ...targetBefore,
        catalogEnabled: nextCatalogEnabled,
        subscription: {
          ...sub,
          planTier: tier,
          planSelectedAt: nowIso,
          monthlyFee: planDef.monthlyPrice,
          termsAccepted: true,
          termsAcceptedAt: sub.termsAcceptedAt || nowIso,
          termsVersion: usedTermsVersion,
          lastPlanChange: changeRec,
          planChangeHistory:
            changeRec && prevTier !== tier
              ? [changeRec, ...(sub.planChangeHistory || [])].slice(0, 20)
              : sub.planChangeHistory,
        },
      };
    }
    const updatedList = freshList.map((t) =>
      t.id === targetTenantId && updatedTargetForCloud ? updatedTargetForCloud : t
    );
    saveTenants(updatedList);
    setAllTenants(updatedList);
    if (selectedTenant && selectedTenant.id === targetTenantId && updatedTargetForCloud) {
      setSelectedTenant(updatedTargetForCloud);
    }
    if (updatedTargetForCloud) {
      void setPublicCatalogSuperAdminEnabledInSupabase(updatedTargetForCloud, nextCatalogEnabled);
      const tData = loadTenantData(targetTenantId);
      if (nextCatalogEnabled && (tData.catalogSettings || (tData.catalogProducts || []).length > 0)) {
        publishCatalogSnapshot(
          tData.catalogSettings || catalogSettings,
          tData.catalogProducts || catalogProducts,
          tData.config,
          updatedTargetForCloud
        );
      }
    }
    if (!nextCatalogEnabled && (activeTab === 'catalogo' || activeTab === 'ventas_web')) {
      setActiveTab('boletas');
    }
    setChosenPlanTierForPayModal(tier);
  };

  // Bidirectional self-service plan change (Plan 1 ↔ 2 ↔ 3) with accepted Terms & Conditions
  const handleConfirmPlanChange = (details: {
    targetTier: SubscriptionPlanTier;
    triggerReason: string;
    acceptedTermsAt: string;
    termsVersion: string;
    newMonthlyFee: number;
    openPaymentAfter?: boolean;
  }) => {
    if (!selectedTenant) return;
    const freshList = loadTenants();
    const targetBefore = freshList.find((t) => t.id === selectedTenant.id) || selectedTenant;
    const sub = ensureTenantSubscription(targetBefore);
    const fromTier = resolveTenantPlanTier(targetBefore);
    const fromDef = fromTier ? getPlanDefinitionByTier(fromTier, platformBillingCfg) : null;
    const targetDef = getPlanDefinitionByTier(details.targetTier, platformBillingCfg);
    const nextCatalogEnabled = details.targetTier !== 'basico';

    const changeRecord: TenantPlanChangeRecord = {
      id: `pchange-${Date.now()}`,
      fromTier,
      toTier: details.targetTier,
      fromLabel: fromDef ? `${fromDef.sectionBadge} · ${fromDef.shortName}` : 'Prueba / Sin Plan',
      toLabel: `${targetDef.sectionBadge} · ${targetDef.shortName}`,
      previousMonthlyFee: sub.monthlyFee,
      newMonthlyFee: details.newMonthlyFee,
      changedAt: details.acceptedTermsAt,
      changedBy: 'tenant_self_upgrade',
      triggerReason: details.triggerReason,
      acceptedTerms: true,
      acceptedTermsAt: details.acceptedTermsAt,
      termsVersion: details.termsVersion,
    };
    const updatedTarget: Tenant = {
      ...targetBefore,
      catalogEnabled: nextCatalogEnabled,
      subscription: {
        ...sub,
        planTier: details.targetTier,
        planSelectedAt: details.acceptedTermsAt,
        monthlyFee: details.newMonthlyFee,
        termsAccepted: true,
        termsAcceptedAt: sub.termsAcceptedAt || details.acceptedTermsAt,
        termsVersion: details.termsVersion,
        lastPlanChange: changeRecord,
        planChangeHistory: [changeRecord, ...(sub.planChangeHistory || [])].slice(0, 20),
      },
    };
    const updatedList = freshList.some((t) => t.id === updatedTarget.id)
      ? freshList.map((t) => (t.id === updatedTarget.id ? updatedTarget : t))
      : [updatedTarget, ...freshList];

    saveTenants(updatedList);
    setAllTenants(updatedList);
    setSelectedTenant(updatedTarget);
    void setPublicCatalogSuperAdminEnabledInSupabase(updatedTarget, nextCatalogEnabled);
    if (nextCatalogEnabled) {
      const tData = loadTenantData(updatedTarget.id);
      publishCatalogSnapshot(
        tData.catalogSettings || catalogSettings,
        tData.catalogProducts || catalogProducts,
        tData.config,
        updatedTarget
      );
    } else if (activeTab === 'catalogo' || activeTab === 'ventas_web') {
      setActiveTab('boletas');
    }

    setPlanUpgradePrompt(null);

    if (details.openPaymentAfter) {
      setChosenPlanTierForPayModal(details.targetTier);
      setAutoGenSubPayLink(false);
      setIsSubscriptionPayOpen(true);
    }

    showToast(
      `Plan actualizado a ${targetDef.sectionBadge} · ${targetDef.shortName} (Términos v${details.termsVersion} aceptados).`
    );
  };

  // Helper to apply approved SaaS subscription payment to tenant state (1 Mes o Plan Anual 12 Meses)
  const applyApprovedTenantPayment = (
    targetTenantId: string,
    details: {
      monthKey: string;
      amount: number;
      paymentMethod: 'mercadopago' | 'transferencia' | 'manual';
      mpPaymentId?: string;
      mpPreferenceId?: string;
      receiptAlias?: string;
      receiptImageUrl?: string;
      verificationNote?: string;
      planType?: 'monthly' | 'annual';
      planTier?: SubscriptionPlanTier;
      planTierLabel?: string;
      monthsCount?: number;
    }
  ) => {
    const isAnnual = details.planType === 'annual' || (details.monthsCount ?? 1) >= 12;
    const monthsCount = isAnnual ? 12 : 1;
    const freshList = loadTenants();
    let updatedTargetForCloud: Tenant | null = null;
    const updatedList = freshList.map((t) => {
      if (t.id !== targetTenantId) return t;
      const updated = toggleTenantMonthlyPayment(
        t,
        details.monthKey,
        true,
        details.amount,
        details.verificationNote ||
          `${isAnnual ? 'Plan Anual (12 meses)' : 'Abono mensual'} acreditado automáticamente vía ${
            details.paymentMethod === 'mercadopago' ? 'Mercado Pago' : 'Transferencia al CVU/Alias'
          }`,
        details.receiptImageUrl ? 'Sistema Verificador de Comprobantes' : 'Sistema Automático Mercado Pago',
        {
          paymentMethod: details.paymentMethod,
          mpPaymentId: details.mpPaymentId,
          mpPreferenceId: details.mpPreferenceId,
          receiptAlias: details.receiptAlias,
          receiptImageUrl: details.receiptImageUrl,
          verificationNote: details.verificationNote,
          planType: isAnnual ? 'annual' : 'monthly',
          planTier: details.planTier,
          planTierLabel: details.planTierLabel,
          monthsCount,
        }
      );
      if (details.planTier && updated.subscription) {
        const planDef = getPlanDefinitionByTier(details.planTier, platformBillingCfg);
        const enriched: Tenant = {
          ...updated,
          catalogEnabled: details.planTier !== 'basico',
          subscription: {
            ...updated.subscription,
            monthlyFee: planDef.monthlyPrice,
          },
        };
        updatedTargetForCloud = enriched;
        return enriched;
      }
      updatedTargetForCloud = updated;
      return updated;
    });
    saveTenants(updatedList);
    setAllTenants(updatedList);
    if (selectedTenant && selectedTenant.id === targetTenantId && updatedTargetForCloud) {
      setSelectedTenant(updatedTargetForCloud);
    }
    if (updatedTargetForCloud && details.planTier) {
      void setPublicCatalogSuperAdminEnabledInSupabase(
        updatedTargetForCloud,
        details.planTier !== 'basico'
      );
    }
  };

  // Detect Mercado Pago return parameters or server-verified webhook payments automatically
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (clientPayToken || publicCatalogHandle || tenantSubPayToken) return; // Enlaces públicos manejados por vistas dedicadas
    const params = new URLSearchParams(window.location.search);
    const mpStatus = params.get('mp_status') || params.get('collection_status') || params.get('status');
    const mpPaymentId = params.get('payment_id') || params.get('collection_id') || undefined;
    const mpPreferenceId = params.get('preference_id') || undefined;
    const extRef = params.get('external_reference');
    let tenantIdParam = params.get('tenantId') || '';
    let monthKeyParam = params.get('monthKey') || '';
    let planTypeParam: 'monthly' | 'annual' =
      params.get('planType') === 'annual' ? 'annual' : 'monthly';
    const rawPlanTierParam = params.get('planTier');
    const planTierParam: SubscriptionPlanTier | undefined =
      rawPlanTierParam === 'basico' || rawPlanTierParam === 'web' || rawPlanTierParam === 'full'
        ? rawPlanTierParam
        : undefined;
    const amountParam = Number(params.get('amount') || 0);

    if (extRef && extRef.includes('::')) {
      const parts = extRef.split('::');
      if (!tenantIdParam && parts[0]) tenantIdParam = parts[0];
      if (!monthKeyParam && parts[1]) monthKeyParam = parts[1];
      if (parts[2] === 'annual') planTypeParam = 'annual';
    }

    if (mpStatus === 'approved' && tenantIdParam && monthKeyParam) {
      verifyAndRecordTenantPaymentInSupabase({
        tenantId: tenantIdParam,
        monthKey: monthKeyParam,
        amount: amountParam || undefined,
        paymentId: mpPaymentId,
        preferenceId: mpPreferenceId,
        collectionStatus: 'approved',
        paymentMethod: 'mercadopago',
        planType: planTypeParam,
        planTier: planTierParam,
        planTierLabel: planTierParam
          ? `${getPlanDefinitionByTier(planTierParam, platformBillingCfg).sectionBadge} · ${
              getPlanDefinitionByTier(planTierParam, platformBillingCfg).name
            }`
          : undefined,
        monthsCount: planTypeParam === 'annual' ? 12 : 1,
      })
        .then((data) => {
          if (data.approved && data.payment) {
            const approvedPlanType: 'monthly' | 'annual' =
              data.payment.planType === 'annual' || planTypeParam === 'annual' ? 'annual' : 'monthly';
            const approvedMonthsCount =
              approvedPlanType === 'annual' ? Number(data.payment.monthsCount) || 12 : 1;
            const resolvedTier = data.payment.planTier || planTierParam;
            applyApprovedTenantPayment(tenantIdParam, {
              monthKey: monthKeyParam,
              amount: data.payment.amount || amountParam || 25000,
              paymentMethod: 'mercadopago',
              mpPaymentId: data.payment.mpPaymentId,
              mpPreferenceId: data.payment.mpPreferenceId,
              receiptAlias: data.payment.aliasUsed,
              planType: approvedPlanType,
              planTier: resolvedTier,
              planTierLabel:
                data.payment.planTierLabel ||
                (resolvedTier
                  ? `${getPlanDefinitionByTier(resolvedTier, platformBillingCfg).sectionBadge} · ${
                      getPlanDefinitionByTier(resolvedTier, platformBillingCfg).name
                    }`
                  : undefined),
              monthsCount: approvedMonthsCount,
            });
            showToast(
              approvedPlanType === 'annual'
                ? '💳 ¡Plan Anual (12 meses) aprobado en Mercado Pago y guardado en Supabase!'
                : '💳 ¡Pago aprobado en Mercado Pago! El mes quedó marcado como PAGADO en Supabase.'
            );
          }
          window.history.replaceState({}, document.title, window.location.pathname);
        })
        .catch((err) => console.warn('Error verificando retorno MP:', err));
      return;
    }

    // Check Supabase if active tenant has a verified payment for current month
    if (selectedTenant && currentUser?.role !== 'superadmin') {
      const monthInfo = getCurrentMonthInfo();
      const subEval = getTenantSubscriptionStatus(selectedTenant);
      if (!subEval.isPaidForCurrentMonth) {
        fetchVerifiedTenantPaymentStatusFromSupabase(selectedTenant.id, monthInfo.monthKey)
          .then((data) => {
            if (data.approved && data.payment) {
              const pType: 'monthly' | 'annual' =
                data.payment.planType === 'annual' ? 'annual' : 'monthly';
              applyApprovedTenantPayment(selectedTenant.id, {
                monthKey: monthInfo.monthKey,
                amount: data.payment.amount || subEval.monthlyFee,
                paymentMethod: data.payment.paymentMethod || 'mercadopago',
                mpPaymentId: data.payment.mpPaymentId,
                mpPreferenceId: data.payment.mpPreferenceId,
                receiptAlias: data.payment.aliasUsed,
                receiptImageUrl: data.payment.receiptImageUrl,
                verificationNote: data.payment.verificationSummary,
                planType: pType,
                monthsCount: pType === 'annual' ? Number(data.payment.monthsCount) || 12 : 1,
              });
              showToast(
                pType === 'annual'
                  ? '💳 ¡Plan Anual (12 meses) detectado en Supabase y acreditado!'
                  : `💳 ¡Pago de ${monthInfo.monthName} detectado en Supabase y acreditado!`
              );
            }
          })
          .catch(() => {});
      }
    }
  }, [selectedTenant?.id, currentUser?.role, clientPayToken, tenantSubPayToken]);

  // Al cumplirse los 30 días de prueba (trial_expired), refrescamos la escala de precios para mostrar las 3 opciones claras
  useEffect(() => {
    if (!selectedTenant || currentUser?.role === 'superadmin') return;
    const st = getTenantSubscriptionStatus(selectedTenant);
    if (
      (st.status === 'trial_expired' || st.status === 'paused') &&
      promptedTrialExpiredTenantRef.current !== selectedTenant.id
    ) {
      promptedTrialExpiredTenantRef.current = selectedTenant.id;
      fetchPlatformBillingConfigFromServer()
        .then((cfg) => setPlatformBillingCfg(cfg))
        .catch(() => {});
    }
  }, [selectedTenant, currentUser?.role]);

  // Background automated dispatch check on mount (client engine persisted to Supabase)
  useEffect(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    if (config.autoDispatchEnabled && config.lastAutoDispatchDate !== todayStr && boletas.length > 0) {
      executeDailyAlertsDirect({
        boletas,
        clients,
        salespeople,
        admins,
        config,
      })
        .then((data) => {
          if (data.logs?.length > 0) {
            const updatedConfig = { ...config, lastAutoDispatchDate: todayStr };
            setConfig(updatedConfig);
            saveConfig(updatedConfig);
            const updated = [...data.logs, ...autoLogs];
            setAutoLogs(updated);
            saveAutoDispatchLogs(updated);
            if (selectedTenant) {
              const cur = loadTenantData(selectedTenant.id);
              cur.config = updatedConfig;
              cur.autoLogs = [...data.logs, ...(cur.autoLogs || [])];
              saveTenantData(selectedTenant.id, cur);
            }
            showToast(`🤖 Despacho automático matutino: ${data.logs.length} alertas generadas y guardadas en Supabase.`);
          }
        })
        .catch((err) => {
          console.error('Error en despacho automático en segundo plano:', err);
        });
    }
  }, []);

  // Automatic End-of-Day Closing WhatsApp Summary to Owner (persisted to Supabase)
  useEffect(() => {
    if (!selectedTenant || currentUser?.role === 'superadmin') return;
    if (config.dailyClosingEnabled === false) return;

    const checkAndDispatchClosing = () => {
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const closingTime = config.dailyClosingTime || '19:00';
      const attemptKey = `${selectedTenant.id}::${todayStr}`;

      if (
        config.lastDailyClosingDate !== todayStr &&
        currentHHMM >= closingTime &&
        lastAutoClosingAttemptRef.current !== attemptKey &&
        (boletas.length > 0 || paidBoletas.length > 0)
      ) {
        lastAutoClosingAttemptRef.current = attemptKey;
        executeDailyClosingDirect({
          boletas,
          paidBoletas,
          admins,
          config,
          targetDateStr: todayStr,
        })
          .then((data) => {
            if (Array.isArray(data.logs) && data.logs.length > 0) {
              const updatedConfig = { ...config, lastDailyClosingDate: todayStr };
              setConfig(updatedConfig);
              saveConfig(updatedConfig);
              const curData = loadTenantData(selectedTenant.id);
              const updatedLogs = [...data.logs, ...(curData.autoLogs || autoLogs)];
              curData.config = updatedConfig;
              curData.autoLogs = updatedLogs;
              saveTenantData(selectedTenant.id, curData);

              setAutoLogs(updatedLogs);
              saveAutoDispatchLogs(updatedLogs);
              showToast(`📊 Cierre del día automático generado y guardado en Supabase (${data.logs.length} WhatsApp).`);
            }
          })
          .catch((err) => {
            console.warn('Error generando resumen de cierre diario:', err);
          });
      }
    };

    checkAndDispatchClosing();
    const timer = setInterval(checkAndDispatchClosing, 60000);
    return () => clearInterval(timer);
  }, [
    selectedTenant?.id,
    currentUser?.role,
    config.dailyClosingEnabled,
    config.dailyClosingTime,
    config.lastDailyClosingDate,
    boletas,
    paidBoletas,
    admins,
  ]);

  const handlePauseOwnTenant = (reason: string, pausedBy: 'tenant' | 'trial_expired') => {
    if (!selectedTenant) return;
    const updatedTenant = setTenantPausedState(selectedTenant, true, reason, pausedBy);
    const freshList = loadTenants().map((t) => (t.id === selectedTenant.id ? updatedTenant : t));
    saveTenants(freshList);
    setAllTenants(freshList);
    setSelectedTenant(updatedTenant);
    setConfirmTrialPauseInline(false);
    showToast('Tu cuenta fue puesta en pausa. Podés reactivarla cuando quieras efectuando el pago.');
  };

  // Navigation and Multi-Tenant Handlers
  const handleLoginSuccess = (user: PlatformUser, tenant?: Tenant) => {
    setCurrentUser(user);
    setCurrentSessionUser(user);
    const freshTenants = loadTenants();
    setAllTenants(freshTenants);

    if (user.role === 'superadmin') {
      // Super Admin manages the accounts only; does not enter client workspaces
      setSelectedTenant(null);
    } else {
      const targetTenant = tenant || freshTenants.find((t) => t.id === user.tenantId) || freshTenants[0] || null;
      if (!targetTenant) {
        setCurrentUser(null);
        setCurrentSessionUser(null);
        showToast('No encontramos una empresa activa asignada a tu usuario.');
        return;
      }
      setSelectedTenant(targetTenant);
      setActiveTenantId(targetTenant.id);
      loadDataForTenant(targetTenant.id);
    }
    showToast(`Bienvenido/a, ${user.fullName}`);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setCurrentSessionUser(null);
    setSelectedTenant(null);
    showToast('Sesión cerrada correctamente.');
  };

  // Synchronize state changes to localStorage and Tenant Partition
  const handleSaveBoletas = (updated: Boleta[]) => {
    setBoletas(updated);
    if (selectedTenant) {
      const cur = loadTenantData(selectedTenant.id);
      cur.boletas = updated;
      saveTenantData(selectedTenant.id, cur);
    }
    saveBoletas(updated);
  };

  const handleSavePaidBoletas = (updated: Boleta[]) => {
    setPaidBoletas(updated);
    if (selectedTenant) {
      const cur = loadTenantData(selectedTenant.id);
      cur.paidBoletas = updated;
      saveTenantData(selectedTenant.id, cur);
    }
    savePaidBoletas(updated);
  };

  const handleSaveClients = (updated: Client[]) => {
    setClients(updated);
    if (selectedTenant) {
      const cur = loadTenantData(selectedTenant.id);
      cur.clients = updated;
      saveTenantData(selectedTenant.id, cur);
    }
    saveClients(updated);
  };

  const handleSaveSalespeople = (updated: Salesperson[]) => {
    setSalespeople(updated);
    if (selectedTenant) {
      const cur = loadTenantData(selectedTenant.id);
      cur.salespeople = updated;
      saveTenantData(selectedTenant.id, cur);
    }
    saveSalespeople(updated);
  };

  const handleSaveAdmins = (updated: Administrator[]) => {
    setAdmins(updated);
    if (selectedTenant) {
      const cur = loadTenantData(selectedTenant.id);
      cur.admins = updated;
      saveTenantData(selectedTenant.id, cur);
    }
    saveAdministrators(updated);
  };

  const handleSaveRendiciones = (updated: SalespersonRendicion[]) => {
    setRendiciones(updated);
    if (selectedTenant) {
      const cur = loadTenantData(selectedTenant.id);
      cur.rendiciones = updated;
      saveTenantData(selectedTenant.id, cur);
    }
    saveRendiciones(updated);
  };

  const publishCatalogSnapshot = (
    nextSettings: OnlineCatalogSettings,
    nextProducts: CatalogProduct[],
    overrideConfig?: DistributorConfig,
    overrideTenant?: Tenant
  ) => {
    const targetTenant = overrideTenant || selectedTenant;
    if (!targetTenant) return;
    const tenantCfg = loadTenantData(targetTenant.id).config;
    const cfg = overrideConfig || tenantCfg || config;
    const effAccess = getTenantEffectiveFeatureAccess(targetTenant);
    const isFullFeatures = effAccess.canAccessFullFeatures;
    const activeCatalogRubro =
      targetTenant.catalogRubro ||
      nextSettings.catalogRubro ||
      cfg.businessRubro ||
      'distribuidora';
    const rawScopedProducts = nextProducts.filter(
      (p) => (p.rubro || activeCatalogRubro) === activeCatalogRubro
    );
    const scopedProducts: CatalogProduct[] = isFullFeatures
      ? rawScopedProducts
      : rawScopedProducts.map((p) => ({
          ...p,
          featured: false,
          isOutlet: false,
          flashSalePrice: undefined,
          flashSaleEndsAt: undefined,
          wholesaleMinQty: undefined,
          wholesalePrice: undefined,
          loyaltyPoints: undefined,
        }));
    const resolvedLogoUrl = overrideConfig
      ? overrideConfig.distributorLogoUrl
      : cfg.distributorLogoUrl ?? targetTenant.logoUrl;
    const snapshot: PublishedPublicCatalog = {
      tenantId: targetTenant.id,
      tenantCode: cfg.tenantCode || targetTenant.tenantCode,
      slug: nextSettings.slug,
      enabledBySuperAdmin:
        targetTenant.catalogEnabled !== false &&
        targetTenant.status !== 'suspended' &&
        !targetTenant.subscription?.isPaused,
      planTier: effAccess.tier,
      canAccessFullFeatures: isFullFeatures,
      published: nextSettings.published !== false,
      catalogRubro: activeCatalogRubro,
      rubroFilters: nextSettings.rubroFilters,
      customSubfilters: nextSettings.customSubfilters,
      storeName: nextSettings.storeName || cfg.distributorName || targetTenant.name,
      tagline:
        nextSettings.tagline ||
        'Armá tu carrito de compras, elegí retiro en tienda o envío a domicilio y envialo por WhatsApp.',
      logoUrl: resolvedLogoUrl,
      icon: cfg.distributorIcon || targetTenant.icon,
      whatsappPhone:
        nextSettings.whatsappPhone ||
        cfg.senderPhone ||
        cfg.distributorPhone ||
        targetTenant.phone ||
        '',
      allowPickup: nextSettings.allowPickup !== false,
      allowDelivery: nextSettings.allowDelivery !== false,
      deliveryNote: nextSettings.deliveryNote,
      pickupAddress: nextSettings.pickupAddress || targetTenant.address || '',
      pickupHours: nextSettings.pickupHours || 'Lunes a Sábado · 9:00 a 19:00 hs',
      pickupInstructions: nextSettings.pickupInstructions,
      paymentNote: nextSettings.paymentNote,
      merchantPaymentAlias: cfg.merchantPaymentAlias,
      merchantPaymentCvu: cfg.merchantPaymentCvu,
      merchantPaymentBank: cfg.merchantPaymentBank,
      merchantPaymentHolder: cfg.merchantPaymentHolder,
      merchantMpCheckoutLink: cfg.merchantMpCheckoutLink,
      hasMerchantMpAccessToken: Boolean(cfg.hasMerchantMpAccessToken),
      cashOrTransferDiscountPercent: isFullFeatures ? nextSettings.cashOrTransferDiscountPercent : 0,
      coupons: isFullFeatures ? (nextSettings.coupons || []).filter((c) => c.active !== false) : [],
      enablePromoClub: isFullFeatures ? nextSettings.enablePromoClub !== false : false,
      promoClubTitle: isFullFeatures ? nextSettings.promoClubTitle : undefined,
      promoClubIncentive: isFullFeatures ? nextSettings.promoClubIncentive : undefined,
      promoClubWelcomeCoupon: isFullFeatures ? nextSettings.promoClubWelcomeCoupon : undefined,
      promoBanners: isFullFeatures
        ? (nextSettings.promoBanners || []).filter((b) => b.active !== false)
        : [],
      enableLoyaltyProgram: isFullFeatures ? Boolean(nextSettings.enableLoyaltyProgram) : false,
      loyaltyPointsPerUnit: isFullFeatures
        ? typeof nextSettings.loyaltyPointsPerUnit === 'number'
          ? nextSettings.loyaltyPointsPerUnit
          : 10
        : 0,
      loyaltyTiers: isFullFeatures ? nextSettings.loyaltyTiers : undefined,
      loyaltyRestrictRedeemMethods: isFullFeatures
        ? nextSettings.loyaltyRestrictRedeemMethods !== false
        : true,
      currencySymbol: nextSettings.currencySymbol || cfg.currencySymbol || '$',
      products: scopedProducts,
      updatedAt: new Date().toISOString(),
    };
    void publishPublicCatalogToSupabase(snapshot);
  };

  const handleSaveCatalogSettings = (updated: OnlineCatalogSettings) => {
    setCatalogSettings(updated);
    if (selectedTenant) {
      const cur = loadTenantData(selectedTenant.id);
      cur.catalogSettings = updated;
      saveTenantData(selectedTenant.id, cur);
      publishCatalogSnapshot(updated, cur.catalogProducts || catalogProducts, cur.config);
    }
  };

  const handleSaveCatalogProducts = (updated: CatalogProduct[]) => {
    setCatalogProducts(updated);
    if (selectedTenant) {
      const cur = loadTenantData(selectedTenant.id);
      cur.catalogProducts = updated;
      saveTenantData(selectedTenant.id, cur);
      publishCatalogSnapshot(cur.catalogSettings || catalogSettings, updated, cur.config);
    }
  };

  const handleSaveCatalogOrders = (updated: CatalogPickupOrder[]) => {
    setCatalogOrders(updated);
    if (selectedTenant) {
      const cur = loadTenantData(selectedTenant.id);
      const prevById = new Map((cur.catalogOrders || catalogOrders).map((o) => [o.id, o]));
      cur.catalogOrders = updated;
      saveTenantData(selectedTenant.id, cur);
      updated.forEach((order) => {
        const prev = prevById.get(order.id);
        if (
          !prev ||
          prev.updatedAt !== order.updatedAt ||
          prev.status !== order.status ||
          prev.paymentStatus !== order.paymentStatus ||
          prev.confirmedPaymentMethod !== order.confirmedPaymentMethod ||
          (prev.stageNotifications?.length || 0) !== (order.stageNotifications?.length || 0)
        ) {
          void syncCatalogOrderToSupabase(order);
        }
      });
    }
  };

  const handleSaveCatalogStockAlerts = (updated: CatalogStockAlertRequest[]) => {
    setCatalogStockAlerts(updated);
    if (selectedTenant) {
      const cur = loadTenantData(selectedTenant.id);
      cur.catalogStockAlerts = updated;
      saveTenantData(selectedTenant.id, cur);
    }
  };

  const handleRefreshCatalogStockAlerts = async () => {
    if (!selectedTenant) return;
    const remoteAlerts = await fetchCatalogStockAlertsForTenantFromSupabase(selectedTenant.id);
    if (remoteAlerts.length === 0) return;
    const curTenantData = loadTenantData(selectedTenant.id);
    const localAlerts = curTenantData.catalogStockAlerts || catalogStockAlerts;
    const mergedMap = new Map<string, CatalogStockAlertRequest>();
    for (const a of localAlerts) mergedMap.set(a.id, a);
    for (const r of remoteAlerts) {
      const existing = mergedMap.get(r.id);
      if (!existing || ((r.updatedAt || r.createdAt) >= (existing.updatedAt || existing.createdAt))) {
        mergedMap.set(r.id, r);
      }
    }
    const merged = Array.from(mergedMap.values()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
    handleSaveCatalogStockAlerts(merged);
  };

  const handleSaveCatalogPromoSubscribers = (updated: CatalogPromoSubscriber[]) => {
    setCatalogPromoSubscribers(updated);
    if (selectedTenant) {
      const cur = loadTenantData(selectedTenant.id);
      cur.catalogPromoSubscribers = updated;
      saveTenantData(selectedTenant.id, cur);
    }
  };

  const handleRefreshCatalogPromoSubscribers = async () => {
    if (!selectedTenant) return;
    const remoteSubs = await fetchCatalogPromoSubscribersForTenantFromSupabase(selectedTenant.id);
    if (remoteSubs.length === 0) return;
    const curTenantData = loadTenantData(selectedTenant.id);
    const localSubs = curTenantData.catalogPromoSubscribers || catalogPromoSubscribers;
    const mergedMap = new Map<string, CatalogPromoSubscriber>();
    for (const s of localSubs) mergedMap.set(s.id, s);
    for (const r of remoteSubs) {
      const existing = mergedMap.get(r.id);
      if (!existing || ((r.updatedAt || r.createdAt) >= (existing.updatedAt || existing.createdAt))) {
        mergedMap.set(r.id, r);
      }
    }
    const merged = Array.from(mergedMap.values()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
    handleSaveCatalogPromoSubscribers(merged);
  };

  const handleSaveCatalogLoyaltyAccounts = (updated: CatalogLoyaltyAccount[]) => {
    setCatalogLoyaltyAccounts(updated);
    if (selectedTenant) {
      const cur = loadTenantData(selectedTenant.id);
      const prevById = new Map(
        (cur.catalogLoyaltyAccounts || catalogLoyaltyAccounts).map((acc) => [acc.id, acc])
      );
      cur.catalogLoyaltyAccounts = updated;
      saveTenantData(selectedTenant.id, cur);
      updated.forEach((acc) => {
        const prev = prevById.get(acc.id);
        if (
          !prev ||
          prev.updatedAt !== acc.updatedAt ||
          prev.pointsBalance !== acc.pointsBalance ||
          (prev.storeCreditBalance || 0) !== (acc.storeCreditBalance || 0)
        ) {
          void upsertCatalogLoyaltyAccountToSupabase(acc);
        }
      });
    }
  };

  const handleRefreshCatalogLoyaltyAccounts = async () => {
    if (!selectedTenant) return;
    const remoteAccounts = await fetchCatalogLoyaltyAccountsForTenantFromSupabase(selectedTenant.id);
    const curTenantData = loadTenantData(selectedTenant.id);
    const localAccounts = curTenantData.catalogLoyaltyAccounts || catalogLoyaltyAccounts;
    if (remoteAccounts.length === 0 && localAccounts.length === 0) return;
    const mergedMap = new Map<string, CatalogLoyaltyAccount>();
    for (const acc of localAccounts) mergedMap.set(acc.dni, acc);
    for (const r of remoteAccounts) {
      const existing = mergedMap.get(r.dni);
      if (!existing || (r.updatedAt || r.createdAt) >= (existing.updatedAt || existing.createdAt)) {
        mergedMap.set(r.dni, r);
      }
    }
    const merged = Array.from(mergedMap.values()).sort((a, b) =>
      (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt)
    );
    setCatalogLoyaltyAccounts(merged);
    const cur = loadTenantData(selectedTenant.id);
    cur.catalogLoyaltyAccounts = merged;
    saveTenantData(selectedTenant.id, cur);
  };

  const handleSaveCatalogAbandonedCarts = (updated: CatalogAbandonedCart[]) => {
    setCatalogAbandonedCarts(updated);
    if (selectedTenant) {
      const cur = loadTenantData(selectedTenant.id);
      const prevById = new Map(
        (cur.catalogAbandonedCarts || catalogAbandonedCarts).map((c) => [c.id, c])
      );
      cur.catalogAbandonedCarts = updated;
      saveTenantData(selectedTenant.id, cur);
      updated.forEach((cart) => {
        const prev = prevById.get(cart.id);
        if (
          !prev ||
          prev.updatedAt !== cart.updatedAt ||
          prev.status !== cart.status ||
          prev.reminderCount !== cart.reminderCount
        ) {
          void upsertPublicAbandonedCartToSupabase(cart);
        }
      });
    }
  };

  const handleRefreshCatalogAbandonedCarts = async () => {
    if (!selectedTenant) return;
    const remoteCarts = await fetchCatalogAbandonedCartsForTenantFromSupabase(selectedTenant.id);
    const curTenantData = loadTenantData(selectedTenant.id);
    const localCarts = curTenantData.catalogAbandonedCarts || catalogAbandonedCarts;
    if (remoteCarts.length === 0 && localCarts.length === 0) return;
    const mergedMap = new Map<string, CatalogAbandonedCart>();
    for (const c of localCarts) mergedMap.set(c.id, c);
    for (const r of remoteCarts) {
      const existing = mergedMap.get(r.id);
      if (!existing || (r.updatedAt || r.createdAt) >= (existing.updatedAt || existing.createdAt)) {
        mergedMap.set(r.id, r);
      }
    }
    const merged = Array.from(mergedMap.values()).sort((a, b) =>
      (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt)
    );
    setCatalogAbandonedCarts(merged);
    const cur = loadTenantData(selectedTenant.id);
    cur.catalogAbandonedCarts = merged;
    saveTenantData(selectedTenant.id, cur);
  };

  const handleSaveCatalogGiftCards = (updated: CatalogGiftCard[]) => {
    setCatalogGiftCards(updated);
    if (selectedTenant) {
      const cur = loadTenantData(selectedTenant.id);
      const prevById = new Map((cur.catalogGiftCards || catalogGiftCards).map((g) => [g.id, g]));
      cur.catalogGiftCards = updated;
      saveTenantData(selectedTenant.id, cur);
      updated.forEach((gc) => {
        const prev = prevById.get(gc.id);
        if (
          !prev ||
          prev.updatedAt !== gc.updatedAt ||
          prev.remainingBalance !== gc.remainingBalance ||
          prev.status !== gc.status
        ) {
          void upsertCatalogGiftCardToSupabase(gc);
        }
      });
    }
  };

  const handleRefreshCatalogGiftCards = async () => {
    if (!selectedTenant) return;
    const remoteCards = await fetchCatalogGiftCardsForTenantFromSupabase(selectedTenant.id);
    const curTenantData = loadTenantData(selectedTenant.id);
    const localCards = curTenantData.catalogGiftCards || catalogGiftCards;
    if (remoteCards.length === 0 && localCards.length === 0) return;
    const mergedMap = new Map<string, CatalogGiftCard>();
    for (const g of localCards) mergedMap.set(g.id, g);
    for (const r of remoteCards) {
      const existing = mergedMap.get(r.id);
      if (!existing || (r.updatedAt || r.createdAt) >= (existing.updatedAt || existing.createdAt)) {
        mergedMap.set(r.id, r);
      }
    }
    const merged = Array.from(mergedMap.values()).sort((a, b) =>
      (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt)
    );
    setCatalogGiftCards(merged);
    const cur = loadTenantData(selectedTenant.id);
    cur.catalogGiftCards = merged;
    saveTenantData(selectedTenant.id, cur);
  };

  const handleProcessWebOrderReturn = (payload: WebOrderReturnConfirmPayload) => {
    const now = new Date().toISOString();

    const updatedOrders = catalogOrders.map((o) => {
      if (o.id !== payload.order.id) return o;
      const prevReturnedAmount = Number(o.returnedAmount) || 0;
      const prevDeductedPoints = Number(o.returnedPointsDeducted) || 0;
      const prevCreditIssued = Number(o.creditBalanceIssued) || 0;
      const existingRecords = Array.isArray(o.returnRecords) ? o.returnRecords : [];
      return {
        ...o,
        status: payload.markOrderAsFullyReturned ? ('devuelto' as const) : o.status,
        returnStatus:
          payload.returnType === 'devolucion_total'
            ? ('devolucion_total' as const)
            : payload.returnType === 'cambio'
            ? ('cambio' as const)
            : ('devolucion_parcial' as const),
        returnedAmount:
          Math.round((prevReturnedAmount + payload.returnRecord.returnedAmount) * 100) / 100,
        returnedPointsDeducted: prevDeductedPoints + (payload.pointsToDeduct || 0),
        creditBalanceIssued:
          Math.round((prevCreditIssued + (payload.creditIssuedAmount || 0)) * 100) / 100,
        returnRecords: [payload.returnRecord, ...existingRecords],
        updatedAt: now,
      };
    });
    handleSaveCatalogOrders(updatedOrders);

    let workingProducts = [...catalogProducts];
    let stockUpdated = false;
    if (payload.restoreStockItems.length > 0) {
      const restored = applyOrderStockDeltaToProducts(
        workingProducts,
        payload.restoreStockItems,
        'restore'
      );
      workingProducts = restored.updatedProducts;
      if (restored.changed) stockUpdated = true;
    }
    if (payload.deductReplacementItems.length > 0) {
      const deducted = applyOrderStockDeltaToProducts(
        workingProducts,
        payload.deductReplacementItems,
        'deduct'
      );
      workingProducts = deducted.updatedProducts;
      if (deducted.changed) stockUpdated = true;
    }
    if (stockUpdated) {
      handleSaveCatalogProducts(workingProducts);
    }

    const cleanDni = normalizeDni(payload.dni || payload.order.customerDni || '');
    const ptsToDeduct = payload.deductPointsImmediate ? Math.max(0, payload.pointsToDeduct || 0) : 0;
    const ptsToRestore = Math.max(0, payload.restoreRedeemedPoints || 0);
    const creditToAdd = Math.max(0, Math.round((payload.creditIssuedAmount || 0) * 100) / 100);

    if (cleanDni && selectedTenant && (ptsToDeduct > 0 || ptsToRestore > 0 || creditToAdd > 0)) {
      const accIdx = catalogLoyaltyAccounts.findIndex((a) => normalizeDni(a.dni) === cleanDni);
      const baseAcc: CatalogLoyaltyAccount =
        accIdx >= 0
          ? catalogLoyaltyAccounts[accIdx]
          : {
              id: `loy-${selectedTenant.id}-${cleanDni}`,
              tenantId: selectedTenant.id,
              dni: cleanDni,
              customerName: payload.order.customerName,
              customerPhone: payload.order.customerPhone,
              pointsBalance: 0,
              totalPointsEarned: 0,
              totalPointsRedeemed: 0,
              storeCreditBalance: 0,
              storeCreditHistory: [],
              ordersCount: 1,
              lastOrderAt: payload.order.createdAt || now,
              history: [],
              createdAt: now,
              updatedAt: now,
            };

      let nextPointsBalance = Number(baseAcc.pointsBalance) || 0;
      let nextTotalEarned = Number(baseAcc.totalPointsEarned) || 0;
      let nextTotalRedeemed = Number(baseAcc.totalPointsRedeemed) || 0;
      const nextMovements = [...(baseAcc.history || [])];

      if (ptsToDeduct > 0) {
        nextPointsBalance = Math.max(0, nextPointsBalance - ptsToDeduct);
        nextTotalEarned = Math.max(0, nextTotalEarned - ptsToDeduct);
        nextMovements.unshift({
          id: `loy-rev-${Date.now()}-d`,
          date: now,
          type: 'reversed',
          pointsDelta: -ptsToDeduct,
          orderId: payload.order.id,
          orderNumber: payload.order.orderNumber,
          note: `Descuento inmediato de puntos por ${
            payload.returnType === 'cambio' ? 'cambio' : 'devolución'
          } (#${payload.order.orderNumber})`,
        });
      }

      if (ptsToRestore > 0) {
        nextPointsBalance += ptsToRestore;
        nextTotalRedeemed = Math.max(0, nextTotalRedeemed - ptsToRestore);
        nextMovements.unshift({
          id: `loy-rev-${Date.now()}-r`,
          date: now,
          type: 'manual_adjustment',
          pointsDelta: ptsToRestore,
          orderId: payload.order.id,
          orderNumber: payload.order.orderNumber,
          note: `Devolución de puntos canjeados (#${payload.order.orderNumber})`,
        });
      }

      let nextCreditBalance = Number(baseAcc.storeCreditBalance) || 0;
      const nextCreditHistory = [...(baseAcc.storeCreditHistory || [])];
      if (creditToAdd > 0) {
        nextCreditBalance = Math.round((nextCreditBalance + creditToAdd) * 100) / 100;
        nextCreditHistory.unshift({
          id: `cred-ret-${Date.now()}`,
          date: now,
          type: 'credited_return',
          amountDelta: creditToAdd,
          orderId: payload.order.id,
          orderNumber: payload.order.orderNumber,
          note: `Saldo a favor por ${
            payload.returnType === 'cambio' ? 'cambio' : 'devolución'
          } (#${payload.order.orderNumber})`,
        });
      }

      const updatedAcc: CatalogLoyaltyAccount = {
        ...baseAcc,
        pointsBalance: nextPointsBalance,
        totalPointsEarned: nextTotalEarned,
        totalPointsRedeemed: nextTotalRedeemed,
        storeCreditBalance: nextCreditBalance,
        storeCreditHistory: nextCreditHistory.slice(0, 60),
        history: nextMovements.slice(0, 80),
        updatedAt: now,
      };

      const nextAccounts =
        accIdx >= 0
          ? catalogLoyaltyAccounts.map((a, idx) => (idx === accIdx ? updatedAcc : a))
          : [updatedAcc, ...catalogLoyaltyAccounts];
      handleSaveCatalogLoyaltyAccounts(nextAccounts);
    }

    const summaryParts: string[] = [
      `${payload.returnType === 'cambio' ? 'Cambio' : 'Devolución'} registrado en #${payload.order.orderNumber}`,
    ];
    if (ptsToDeduct > 0) summaryParts.push(`-${ptsToDeduct} pts descontados al DNI`);
    if (creditToAdd > 0) {
      summaryParts.push(
        `+$${creditToAdd.toLocaleString('es-AR')} saldo a favor DNI`
      );
    }
    if (stockUpdated) summaryParts.push('stock actualizado');
    showToast(summaryParts.join(' · '));
  };

  const handleVerifyWebOrderTransferReceipt = async (order: CatalogPickupOrder) => {
    if (!order.transferReceiptImageUrl) {
      showToast('Este pedido no tiene imagen de comprobante adjunta.');
      return;
    }
    const knownUsedOperationIds = catalogOrders
      .filter((o) => o.id !== order.id && o.status !== 'cancelado' && (o.transferOperationId || o.transferReference))
      .map((o) => ({
        orderId: o.id,
        operationId: String(o.transferOperationId || o.transferReference || '').trim(),
      }))
      .filter((entry) => Boolean(entry.operationId));

    const res = await verifyCatalogTransferReceiptViaServer({
      tenantId: order.tenantId,
      orderId: order.id,
      orderNumber: order.orderNumber,
      storeName: order.storeName || config.distributorName || 'Comercio',
      expectedAmount: order.totalAmount,
      alias: config.merchantPaymentAlias,
      cvu: config.merchantPaymentCvu,
      holderName: config.merchantPaymentHolder,
      imageBase64: order.transferReceiptImageUrl,
      knownUsedOperationIds,
    });

    const now = new Date().toISOString();
    const updatedOrder: CatalogPickupOrder = {
      ...order,
      transferOperationId: res.operationId || order.transferOperationId,
      transferReference: order.transferReference || res.operationId,
      transferVerifiedAt: res.approved ? res.verifiedAt || now : order.transferVerifiedAt,
      transferVerificationSummary: res.verificationSummary || res.message,
      transferVerificationStatus: res.duplicate
        ? 'duplicado'
        : res.approved
        ? 'verificado_auto'
        : res.success
        ? 'rechazado'
        : 'pendiente',
      paymentStatus: res.approved
        ? 'acreditado'
        : order.paymentStatus || 'comprobante_en_revision',
      confirmedPaymentMethod: res.approved
        ? order.confirmedPaymentMethod || 'transferencia'
        : order.confirmedPaymentMethod,
      updatedAt: now,
    };
    handleSaveCatalogOrders(catalogOrders.map((o) => (o.id === order.id ? updatedOrder : o)));
    if (res.duplicate) {
      showToast(res.message || 'Comprobante duplicado: ya fue usado en otro pedido.');
    } else if (res.approved) {
      showToast(`Comprobante verificado y acreditado automáticamente (${res.operationId || 'OK'}).`);
    } else {
      showToast(res.message || 'No se pudo validar automáticamente; revisá los datos del comprobante.');
    }
  };

  const handleMarkWebOrderRetirado = (order: CatalogPickupOrder) => {
    const now = new Date().toISOString();
    const receiptNumber =
      order.dispatchReceiptNumber || `DESP-${order.orderNumber.replace(/^PED-/, '')}`;
    const resolvedPayment: NonNullable<CatalogPickupOrder['confirmedPaymentMethod']> =
      order.confirmedPaymentMethod ||
      (order.preferredPaymentMethod && order.preferredPaymentMethod !== 'acordar'
        ? order.preferredPaymentMethod
        : 'efectivo');

    const enriched: CatalogPickupOrder = {
      ...order,
      status: 'retirado',
      dispatchReceiptNumber: receiptNumber,
      dispatchedAt: order.dispatchedAt || now,
      confirmedPaymentMethod: resolvedPayment,
      paymentStatus:
        resolvedPayment === 'fiado'
          ? order.paymentStatus || 'pendiente'
          : 'acreditado',
      updatedAt: now,
    };

    handleSaveCatalogOrders(catalogOrders.map((o) => (o.id === order.id ? enriched : o)));
    showToast(
      `Pedido #${order.orderNumber} marcado como Retirado / Pagado. Sumado al dinero generado en la web.`
    );
  };

  const handleUpdateWebOrderPaymentMethod = (
    orderId: string,
    method: NonNullable<CatalogPickupOrder['confirmedPaymentMethod']>
  ) => {
    const now = new Date().toISOString();
    handleSaveCatalogOrders(
      catalogOrders.map((o) =>
        o.id === orderId ? { ...o, confirmedPaymentMethod: method, updatedAt: now } : o
      )
    );
    showToast('Forma de pago del pedido web actualizada.');
  };

  const handleOpenReceiptForWebOrder = (order: CatalogPickupOrder) => {
    const isDelivery = order.deliveryMethod === 'envio';
    const paymentKey = order.confirmedPaymentMethod || order.preferredPaymentMethod || 'acordar';
    const paymentMethodLabel =
      paymentKey === 'transferencia'
        ? 'Transferencia bancaria / Alias'
        : paymentKey === 'mercadopago_dinero_cuenta'
        ? 'Mercado Pago (Dinero en cuenta)'
        : paymentKey === 'link_pago'
        ? 'Link de Pago / Mercado Pago'
        : paymentKey === 'efectivo'
        ? isDelivery
          ? 'Efectivo contra entrega'
          : 'Efectivo en el comercio'
        : paymentKey === 'fiado'
        ? 'Cuenta Corriente / Fiado'
        : 'A coordinar por WhatsApp';
    const receiptNumber =
      order.dispatchReceiptNumber || `DESP-${order.orderNumber.replace(/^PED-/, '')}`;
    const isPaidOnDispatch = order.status === 'retirado' && paymentKey !== 'fiado';
    const addressForReceipt = isDelivery
      ? order.deliveryAddress || 'Envío a domicilio'
      : catalogSettings.pickupAddress || selectedTenant?.address || 'Retiro en tienda';

    setActiveReceiptData({
      receiptNumber,
      boletaNumber: order.linkedBoletaNumber || order.orderNumber,
      clientName: order.customerName,
      clientAddress: addressForReceipt,
      paymentDate: (order.dispatchedAt || order.createdAt || new Date().toISOString()).slice(0, 10),
      amountPaidNow: isPaidOnDispatch ? order.totalAmount : 0,
      paymentMethod:
        paymentKey === 'transferencia'
          ? 'transferencia'
          : paymentKey === 'efectivo'
          ? 'efectivo'
          : paymentKey,
      paymentMethodLabel,
      originalAmount: order.totalAmount,
      totalPaidAccumulated: isPaidOnDispatch ? order.totalAmount : 0,
      remainingBalance: isPaidOnDispatch ? 0 : order.totalAmount,
      receivedBy: activeAdmin?.name || currentUser?.fullName || 'Administración',
      notes: order.customerSpecificRequest || order.notes,
      isFullSettlement: isPaidOnDispatch,
      isDispatchReceipt: true,
      dispatchModalityLabel: isDelivery ? 'Envío a domicilio' : 'Retiro en tienda',
      deliveryAddress: addressForReceipt,
      hideUnitModeTag: true,
      items: order.items.map((it, idx) => {
        const variantSuffix = it.variantLabel ? ` · ${it.variantLabel}` : '';
        const unitSuffix = it.unitLabel ? ` (${it.unitLabel})` : '';
        return {
          id: `web-ord-rcpt-${order.id}-${idx}`,
          name: `${it.productName}${variantSuffix}${unitSuffix}`,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          subtotal: it.subtotal,
          paymentMode: paymentKey === 'fiado' ? 'un_pago_fiado' : 'contado_hoy',
        };
      }),
      initialPhone: order.customerPhone,
      saleModeLabel: isDelivery
        ? 'COMPROBANTE VENTA WEB · ENVÍO A DOMICILIO'
        : 'COMPROBANTE VENTA WEB · RETIRO EN COMERCIO',
    });
  };

  const handleRefreshCatalogOrders = async () => {
    if (!selectedTenant) return;
    const remoteOrders = await fetchCatalogOrdersForTenantFromSupabase(selectedTenant.id);
    if (remoteOrders.length === 0) return;

    const curTenantData = loadTenantData(selectedTenant.id);
    const currentLocalOrders = curTenantData.catalogOrders || catalogOrders;
    const mergedMap = new Map<string, CatalogPickupOrder>();
    for (const o of currentLocalOrders) mergedMap.set(o.id, o);

    const itemsToDeduct: CatalogPickupOrder['items'] = [];

    for (const r of remoteOrders) {
      const existing = mergedMap.get(r.id);
      if (!existing) {
        const shouldDeduct = !r.stockDeducted && r.status !== 'cancelado';
        if (shouldDeduct && Array.isArray(r.items)) {
          itemsToDeduct.push(...r.items);
        }
        mergedMap.set(r.id, shouldDeduct ? { ...r, stockDeducted: true } : r);
      } else if ((r.updatedAt || r.createdAt) >= (existing.updatedAt || existing.createdAt)) {
        mergedMap.set(r.id, { ...r, stockDeducted: existing.stockDeducted ?? r.stockDeducted });
      }
    }

    if (itemsToDeduct.length > 0) {
      const baseProducts = curTenantData.catalogProducts || catalogProducts;
      const { updatedProducts, changed } = applyOrderStockDeltaToProducts(
        baseProducts,
        itemsToDeduct,
        'deduct'
      );
      if (changed) {
        handleSaveCatalogProducts(updatedProducts);
      }
    }

    const merged = Array.from(mergedMap.values()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
    handleSaveCatalogOrders(merged);
  };

  const handleBillCatalogOrder = (order: CatalogPickupOrder) => {
    if (order.linkedBoletaNumber) {
      showToast(`Este pedido ya fue facturado en la boleta #${order.linkedBoletaNumber}.`);
      return;
    }

    const normalizeDigits = (val: string) => (val || '').replace(/[^0-9]/g, '');
    const orderDigits = normalizeDigits(order.customerPhone);
    const orderNameLower = order.customerName.trim().toLowerCase();

    let targetClient = clients.find((c) => {
      const cDigits = normalizeDigits(c.phone);
      if (orderDigits.length >= 6 && cDigits.length >= 6) {
        return cDigits.endsWith(orderDigits.slice(-8)) || orderDigits.endsWith(cDigits.slice(-8));
      }
      return c.name.trim().toLowerCase() === orderNameLower;
    });

    const todayStr = new Date().toISOString().split('T')[0];
    const nowIso = new Date().toISOString();

    if (!targetClient) {
      const nextNum = clients.length + 1;
      targetClient = {
        id: `cli-web-${Date.now()}`,
        clientNumber: `WEB-${String(nextNum).padStart(3, '0')}`,
        name: order.customerName.trim(),
        contactPerson: order.customerName.trim(),
        phone: order.customerPhone.trim(),
        email: '',
        address: order.deliveryAddress?.trim() || 'Retiro en tienda (Catálogo Online)',
        zone: order.deliveryMethod === 'envio' ? 'Envío Domicilio' : 'Mostrador / Web',
        notes: `Cliente registrado desde pedido online #${order.orderNumber}`,
        creditHistory: {
          reputationStatus: 'confiable',
          totalHistoricalBoletas: 1,
          totalPaidOnTime: 0,
          totalLatePayments: 0,
          totalPurgedUnpaid: 0,
          totalPurgedDebtAmount: 0,
          purgedBoletas: [],
          lastEvaluatedAt: nowIso,
        },
        createdAt: todayStr,
      };
      handleSaveClients([targetClient, ...clients]);
    } else {
      const updatedClients = clients.map((c) => {
        if (c.id !== targetClient!.id) return c;
        const h = ensureClientCreditHistory(c);
        return {
          ...c,
          address:
            order.deliveryMethod === 'envio' && order.deliveryAddress?.trim() && !c.address
              ? order.deliveryAddress.trim()
              : c.address,
          creditHistory: {
            ...h,
            totalHistoricalBoletas: h.totalHistoricalBoletas + 1,
            lastEvaluatedAt: nowIso,
          },
        };
      });
      handleSaveClients(updatedClients);
    }

    const defaultSalesperson = salespeople.find((s) => s.active) || salespeople[0];
    const termDays = config.defaultTermDays || 7;
    const dueDate = addDaysToDate(todayStr, termDays);
    const boletaNumber = `WEB-${Date.now().toString().slice(-6)}`;

    const lineItems: SaleLineItem[] = order.items.map((it, idx) => {
      const variantSuffix = it.variantLabel ? ` · ${it.variantLabel}` : '';
      const unitSuffix = it.unitLabel ? ` (${it.unitLabel})` : '';
      return {
        id: `item-${Date.now()}-${idx}`,
        name: `${it.productName}${variantSuffix}${unitSuffix}`,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        subtotal: it.subtotal,
        paymentMode: 'contado_hoy',
      };
    });

    const itemSummary = order.items
      .map((it) => `${it.quantity}x ${it.productName}${it.variantLabel ? ` (${it.variantLabel})` : ''}`)
      .join(', ');

    const modalityLabel =
      order.deliveryMethod === 'envio'
        ? `Envío a domicilio: ${order.deliveryAddress || 'A coordinar'}`
        : 'Retiro en tienda';
    const orderObs = (order.customerSpecificRequest || order.notes || '').trim();

    const newBoleta: Boleta = {
      id: `bol-${Date.now()}`,
      boletaNumber,
      clientId: targetClient.id,
      clientName: targetClient.name,
      clientAddress:
        order.deliveryMethod === 'envio'
          ? order.deliveryAddress || targetClient.address
          : targetClient.address || 'Retira en tienda',
      clientPhone: targetClient.phone || order.customerPhone,
      salespersonId: defaultSalesperson?.id || 'mostrador',
      salespersonName: defaultSalesperson?.name || 'Catálogo Online / Dueño',
      salespersonPhone: defaultSalesperson?.phone || config.senderPhone || config.distributorPhone,
      saleDate: todayStr,
      amount: order.totalAmount,
      termDays,
      dueDate,
      notes: `Pedido Catálogo #${order.orderNumber} (${modalityLabel})${
        orderObs ? ` · Obs: ${orderObs}` : ''
      }`,
      isSigned: false,
      status: 'pending',
      remindersLog: [],
      createdAt: todayStr,
      saleMode: 'standard',
      itemSummary,
      items: lineItems,
    };

    handleSaveBoletas([newBoleta, ...boletas]);

    const updatedOrders = catalogOrders.map((o) =>
      o.id === order.id
        ? {
            ...o,
            linkedBoletaId: newBoleta.id,
            linkedBoletaNumber: newBoleta.boletaNumber,
            updatedAt: nowIso,
          }
        : o
    );
    handleSaveCatalogOrders(updatedOrders);

    showToast(
      `Boleta #${newBoleta.boletaNumber} facturada desde pedido #${order.orderNumber}. Ya podés cobrarla o enviarla por WhatsApp.`
    );
  };

  const handleConfirmRendicion = (rendicion: SalespersonRendicion) => {
    if (rendicion.appliedToBoletas) {
      const itemByBoleta = new Map<string, RendicionRouteItem>(
        rendicion.items.map((item) => [item.boletaId, item])
      );
      const nextPending: Boleta[] = [];
      const newlyPaid: Boleta[] = [];
      const paidCountByClient: Record<string, number> = {};
      const nowIso = new Date().toISOString();

      boletas.forEach((b, idx) => {
        const item = itemByBoleta.get(b.id);
        if (!item) {
          nextPending.push(b);
          return;
        }

        if (
          item.outcome === 'cobrada_total' ||
          item.outcome === 'transferencia_directa' ||
          item.outcome === 'cheque_otro'
        ) {
          const paymentMethod: 'efectivo' | 'transferencia' | 'cheque' =
            item.outcome === 'transferencia_directa'
              ? 'transferencia'
              : item.outcome === 'cheque_otro'
              ? 'cheque'
              : 'efectivo';
          newlyPaid.push({
            ...b,
            status: 'paid',
            paidAt: rendicion.date,
            paymentMethod,
            paymentReference: rendicion.rendicionNumber,
            paymentNotes:
              item.note ||
              `Cobrada en rendición ${rendicion.rendicionNumber} (${rendicion.salespersonName})`,
          });
          paidCountByClient[b.clientId] = (paidCountByClient[b.clientId] || 0) + 1;
          return;
        }

        if (item.outcome === 'pago_parcial') {
          const totalCollected =
            Math.round(
              (item.collectedCash + item.collectedTransfer + item.collectedOther) * 100
            ) / 100;
          if (totalCollected > 0) {
            const paymentMethod: 'efectivo' | 'transferencia' | 'cheque' =
              item.collectedTransfer > item.collectedCash &&
              item.collectedTransfer >= item.collectedOther
                ? 'transferencia'
                : item.collectedOther > item.collectedCash
                ? 'cheque'
                : 'efectivo';
            const newPartial: PartialPayment = {
              id: `part-rend-${Date.now()}-${idx}`,
              date: rendicion.date,
              amount: totalCollected,
              paymentMethod,
              receivedBy: rendicion.salespersonName,
              notes:
                item.note ||
                `Entrega en calle · Rendición ${rendicion.rendicionNumber}`,
            };
            const updatedPartials = [...(b.partialPayments || []), newPartial];
            const remaining = getBoletaBalance({ ...b, partialPayments: updatedPartials }).balanceDue;
            if (remaining <= 0.01) {
              newlyPaid.push({
                ...b,
                status: 'paid',
                partialPayments: updatedPartials,
                paidAt: rendicion.date,
                paymentMethod,
                paymentReference: rendicion.rendicionNumber,
                paymentNotes: `Cancelada en rendición ${rendicion.rendicionNumber}`,
              });
              paidCountByClient[b.clientId] = (paidCountByClient[b.clientId] || 0) + 1;
            } else {
              nextPending.push({ ...b, partialPayments: updatedPartials });
            }
            return;
          }
          nextPending.push(b);
          return;
        }

        if (item.outcome === 'prorroga_promesa') {
          const extDays = Math.max(1, item.extensionDays || config.defaultExtensionDays || 3);
          const newDue = addDaysToDate(b.dueDate, extDays);
          const extEntry: BoletaExtension = {
            id: `ext-rend-${Date.now()}-${idx}`,
            extendedAt: nowIso,
            addedDays: extDays,
            previousDueDate: b.dueDate,
            newDueDate: newDue,
            authorizedBy: rendicion.settledByAdmin,
            reason:
              item.note ||
              `Prórroga en calle · Rendición ${rendicion.rendicionNumber}`,
          };
          const visitNote = item.note || `Promesa +${extDays}d (${rendicion.rendicionNumber})`;
          const visitEntry: CollectionVisitLog = {
            id: `vis-rend-${Date.now()}-${idx}`,
            date: rendicion.date,
            timestamp: nowIso,
            outcome: 'promesa_pago',
            promisedDate: newDue,
            recordedBy: rendicion.salespersonName,
            note: visitNote,
          };
          nextPending.push({
            ...b,
            dueDate: newDue,
            originalDueDate: b.originalDueDate || b.dueDate,
            extensionDays: (b.extensionDays || 0) + extDays,
            promisedPaymentDate: newDue,
            lastVisitOutcome: 'promesa_pago',
            lastVisitDate: rendicion.date,
            lastVisitNote: visitNote,
            extensions: [...(b.extensions || []), extEntry],
            visitLogs: [...(b.visitLogs || []), visitEntry],
          });
          return;
        }

        // no_cobrada con nota de calle opcional
        if (item.note && item.note.trim()) {
          const visitNote = `${rendicion.rendicionNumber}: ${item.note.trim()}`;
          const visitEntry: CollectionVisitLog = {
            id: `vis-rend-${Date.now()}-${idx}`,
            date: rendicion.date,
            timestamp: nowIso,
            outcome: 'pasar_mas_tarde',
            recordedBy: rendicion.salespersonName,
            note: visitNote,
          };
          nextPending.push({
            ...b,
            lastVisitOutcome: 'pasar_mas_tarde',
            lastVisitDate: rendicion.date,
            lastVisitNote: visitNote,
            visitLogs: [...(b.visitLogs || []), visitEntry],
          });
        } else {
          nextPending.push(b);
        }
      });

      handleSaveBoletas(nextPending);
      if (newlyPaid.length > 0) {
        handleSavePaidBoletas([...newlyPaid, ...paidBoletas]);
        const updatedClients = clients.map((c) => {
          const addPaid = paidCountByClient[c.id];
          if (!addPaid) return c;
          const h = ensureClientCreditHistory(c);
          return {
            ...c,
            creditHistory: {
              ...h,
              totalPaidOnTime: h.totalPaidOnTime + addPaid,
              lastEvaluatedAt: nowIso,
            },
          };
        });
        handleSaveClients(updatedClients);
      }
    }

    handleSaveRendiciones([rendicion, ...rendiciones]);
    showToast(
      `✅ ${rendicion.rendicionNumber} de ${rendicion.salespersonName} cerrada${
        rendicion.appliedToBoletas ? ' y aplicada a las boletas' : ''
      }.`
    );
  };

  const persistConfigUpdate = (updated: DistributorConfig, customToast?: string) => {
    const nextRubro: BusinessRubro = updated.businessRubro || config.businessRubro || 'distribuidora';
    const rawMpToken = updated.merchantMpAccessToken?.trim();
    const { merchantMpAccessToken: _stripped, ...cleanUpdated } = updated;
    if (rawMpToken && selectedTenant) {
      void saveMerchantMpAccessTokenSecret(selectedTenant.id, rawMpToken);
      void fetch('/api/merchant/mp-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: selectedTenant.id, mpAccessToken: rawMpToken }),
      }).catch(() => {});
    }
    const normalizedConfig: DistributorConfig = {
      ...cleanUpdated,
      hasMerchantMpAccessToken: Boolean(rawMpToken || updated.hasMerchantMpAccessToken),
      businessRubro: nextRubro,
    };
    const nextProfile = getRubroProfile(nextRubro);

    setConfig(normalizedConfig);

    // Si pasa a un rubro donde no es obligatorio preventista y no hay vendedores, agregamos Caja / Mostrador
    if (!nextProfile.requireSalesperson && salespeople.length === 0) {
      const defaultCounter: Salesperson = {
        id: `sal-mostrador-${Date.now()}`,
        name: 'Caja / Mostrador',
        phone: normalizedConfig.distributorPhone || '',
        email: normalizedConfig.distributorEmail || '',
        address: normalizedConfig.distributorName || '',
        birthDate: '',
        zone: 'Local Comercial',
        active: true,
      };
      handleSaveSalespeople([defaultCounter]);
    }

    if (selectedTenant) {
      const cur = loadTenantData(selectedTenant.id);
      cur.config = normalizedConfig;
      saveTenantData(selectedTenant.id, cur);

      let updatedCurrentTenant: Tenant | null = null;
      const freshTenants = allTenants.map((t) => {
        if (t.id !== selectedTenant.id) return t;
        updatedCurrentTenant = {
          ...t,
          name: normalizedConfig.distributorName,
          phone: normalizedConfig.distributorPhone,
          email: normalizedConfig.distributorEmail,
          businessRubro: nextRubro,
          businessCategory: nextProfile.label,
          icon: normalizedConfig.distributorIcon || t.icon,
          logoUrl: normalizedConfig.distributorLogoUrl,
          config: normalizedConfig,
        };
        return updatedCurrentTenant;
      });
      setAllTenants(freshTenants);
      saveTenants(freshTenants);
      if (updatedCurrentTenant) {
        setSelectedTenant(updatedCurrentTenant);
      }
      publishCatalogSnapshot(
        cur.catalogSettings || catalogSettings,
        cur.catalogProducts || catalogProducts,
        normalizedConfig
      );
    }
    saveConfig(normalizedConfig);
    showToast(customToast || 'Configuración y perfil operativo actualizados correctamente');
  };

  const handleSaveConfig = (updated: DistributorConfig) => {
    const currentRubro: BusinessRubro = config.businessRubro || 'distribuidora';
    const nextRubro: BusinessRubro = updated.businessRubro || currentRubro;

    if (nextRubro !== currentRubro && clients.length > 0) {
      setRubroMigrationRequest({
        targetRubro: nextRubro,
        pendingConfig: updated,
      });
      return;
    }

    persistConfigUpdate(updated);
  };

  const handleChangeBusinessRubro = (nextRubro: BusinessRubro) => {
    const currentRubro: BusinessRubro = config.businessRubro || 'distribuidora';
    if (nextRubro === currentRubro) return;

    if (clients.length > 0) {
      setRubroMigrationRequest({ targetRubro: nextRubro });
      return;
    }

    const transformed = applyRubroProfileToConfig(config, nextRubro);
    const prof = getRubroProfile(nextRubro);
    persistConfigUpdate(transformed, `Perfil cambiado a "${prof.label}" (${prof.badgeTag}).`);
  };

  const handleConfirmRubroMigration = (params: {
    targetRubro: BusinessRubro;
    keepClientIds: string[];
    deleteClientIds: string[];
    removePendingBoletasOfDeleted: boolean;
  }) => {
    const keepSet = new Set(params.keepClientIds);
    const deleteSet = new Set(params.deleteClientIds);
    const survivingClients = clients.filter((c) => keepSet.has(c.id));
    handleSaveClients(survivingClients);

    let removedBoletasCount = 0;
    if (params.removePendingBoletasOfDeleted && deleteSet.size > 0) {
      const survivingBoletas = boletas.filter((b) => !deleteSet.has(b.clientId));
      removedBoletasCount = boletas.length - survivingBoletas.length;
      if (removedBoletasCount > 0) {
        handleSaveBoletas(survivingBoletas);
      }
    }

    const baseConfig = rubroMigrationRequest?.pendingConfig || config;
    const transformed = applyRubroProfileToConfig(baseConfig, params.targetRubro);
    const prof = getRubroProfile(params.targetRubro);
    setRubroMigrationRequest(null);
    persistConfigUpdate(
      transformed,
      `Rubro cambiado a "${prof.label}": ${survivingClients.length} cliente(s) migrado(s), ${deleteSet.size} eliminado(s)${
        removedBoletasCount > 0 ? ` (${removedBoletasCount} comp. limpiados)` : ''
      }.`
    );
  };

  // New Boleta creation
  const handleCreateBoleta = (
    boletaData: Omit<Boleta, 'id' | 'remindersLog' | 'createdAt' | 'status'>
  ) => {
    const newBoleta: Boleta = {
      ...boletaData,
      id: `bol-${Date.now()}`,
      status: 'pending',
      remindersLog: [],
      createdAt: new Date().toISOString().split('T')[0],
    };

    const updated = [newBoleta, ...boletas];
    handleSaveBoletas(updated);

    // Actualizar historial crediticio del cliente (contador de boletas históricas)
    const targetClient = clients.find((c) => c.id === boletaData.clientId);
    if (targetClient) {
      const updatedClients = clients.map((c) => {
        if (c.id === targetClient.id) {
          const h = ensureClientCreditHistory(c);
          return {
            ...c,
            creditHistory: {
              ...h,
              totalHistoricalBoletas: h.totalHistoricalBoletas + 1,
              lastEvaluatedAt: new Date().toISOString(),
            },
          };
        }
        return c;
      });
      handleSaveClients(updatedClients);
    }

    showToast(`Boleta #${newBoleta.boletaNumber} registrada exitosamente.`);
  };

  // Batch create linked installment plan (Cuotas Personales 2..6)
  const handleCreateBoletaPlan = (
    boletasList: Omit<Boleta, 'id' | 'remindersLog' | 'createdAt' | 'status'>[]
  ) => {
    if (!boletasList.length) return;
    const todayIso = new Date().toISOString().split('T')[0];
    const nowBase = Date.now();
    const createdList: Boleta[] = boletasList.map((b, idx) => ({
      ...b,
      id: `bol-${nowBase}-${idx}`,
      status: 'pending',
      remindersLog: [],
      createdAt: todayIso,
    }));

    handleSaveBoletas([...createdList, ...boletas]);

    const firstClientId = boletasList[0].clientId;
    const updatedClients = clients.map((c) => {
      if (c.id === firstClientId) {
        const h = ensureClientCreditHistory(c);
        return {
          ...c,
          creditHistory: {
            ...h,
            totalHistoricalBoletas: h.totalHistoricalBoletas + createdList.length,
            lastEvaluatedAt: new Date().toISOString(),
          },
        };
      }
      return c;
    });
    handleSaveClients(updatedClients);
    showToast(`Plan de ${createdList.length} cuotas creado y agendado con éxito.`);
  };

  // Atomic mixed basket checkout: handles Contado Hoy + 1 Pago Fiado + Cuotas Personales + opens Visual Receipt
  const handleSaveBasketOperation = (payload: BasketCheckoutPayload) => {
    const {
      basketId,
      baseNumber,
      client,
      salesperson,
      saleDate,
      termDays,
      firstDueDate,
      isSigned,
      notes,
      photoUrl,
      contadoMethod,
      summary,
      installmentsCount,
      interestPercent,
    } = payload;

    const nowTs = Date.now();
    const todayIso = new Date().toISOString().split('T')[0];
    const newPendingToAdd: Boleta[] = [];
    const newPaidToAdd: Boleta[] = [];
    const scheduleLines: string[] = [];
    const allItems = [
      ...summary.contadoItems,
      ...summary.singleDeferredItems,
      ...summary.installmentItems,
    ];

    // 1. Contado Hoy portion (paid immediately -> archived in paidBoletas & daily cash metrics)
    if (summary.contadoItems.length > 0 && summary.contadoTotal > 0) {
      const contadoSummary = summary.contadoItems
        .map((i) => `${i.quantity}x ${i.name}`)
        .join(', ');
      newPaidToAdd.push({
        id: `bol-${nowTs}-contado`,
        boletaNumber: `${baseNumber}-1P`,
        clientId: client.id,
        clientName: client.name,
        clientAddress: client.address,
        clientPhone: client.phone,
        salespersonId: salesperson.id,
        salespersonName: salesperson.name,
        salespersonPhone: salesperson.phone,
        saleDate,
        amount: summary.contadoTotal,
        termDays: 0,
        dueDate: saleDate,
        notes: notes || `Pago contado en canasto #${baseNumber}`,
        isSigned,
        photoUrl,
        status: 'paid',
        paidAt: saleDate,
        paymentMethod: contadoMethod,
        paymentReference: `CAN-${baseNumber}`,
        paymentNotes: contadoSummary,
        remindersLog: [],
        createdAt: todayIso,
        basketId,
        saleMode: 'canasto_mixto',
        itemSummary: contadoSummary,
        items: summary.contadoItems,
      });
      scheduleLines.push(
        `1 Pago Hoy (${contadoMethod}): ${formatCurrency(summary.contadoTotal, config.currencySymbol)}`
      );
    }

    // 2. Un Pago Fiado portion (1 single pending ticket)
    if (summary.singleDeferredItems.length > 0 && summary.singleDeferredTotal > 0) {
      const defSummary = summary.singleDeferredItems
        .map((i) => `${i.quantity}x ${i.name}`)
        .join(', ');
      newPendingToAdd.push({
        id: `bol-${nowTs}-fiado`,
        boletaNumber:
          summary.contadoItems.length > 0 || summary.installmentItems.length > 0
            ? `${baseNumber}-F1`
            : baseNumber,
        clientId: client.id,
        clientName: client.name,
        clientAddress: client.address,
        clientPhone: client.phone,
        salespersonId: salesperson.id,
        salespersonName: salesperson.name,
        salespersonPhone: salesperson.phone,
        saleDate,
        amount: summary.singleDeferredTotal,
        termDays,
        dueDate: firstDueDate,
        notes,
        isSigned,
        photoUrl,
        status: 'pending',
        remindersLog: [],
        createdAt: todayIso,
        basketId,
        saleMode: 'canasto_mixto',
        itemSummary: defSummary,
        items: summary.singleDeferredItems,
      });
      scheduleLines.push(
        `1 Pago Fiado: ${formatCurrency(summary.singleDeferredTotal, config.currencySymbol)} (Vto ${formatDateEs(firstDueDate)})`
      );
    }

    // 3. En Cuotas portion (2 to 6 installments linked by planId & basketId)
    if (summary.installmentPlanPreview && summary.installmentItems.length > 0) {
      const planId = `plan-${nowTs}`;
      const instSummary = summary.installmentItems
        .map((i) => `${i.quantity}x ${i.name}`)
        .join(', ');
      summary.installmentPlanPreview.installments.forEach((inst, idx) => {
        const diffDays = Math.max(
          1,
          Math.round(
            (new Date(inst.dueDate).getTime() - new Date(saleDate).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        );
        newPendingToAdd.push({
          id: `bol-${nowTs}-c${idx + 1}`,
          boletaNumber: `${baseNumber}-C${inst.installmentNumber}/${installmentsCount}`,
          clientId: client.id,
          clientName: client.name,
          clientAddress: client.address,
          clientPhone: client.phone,
          salespersonId: salesperson.id,
          salespersonName: salesperson.name,
          salespersonPhone: salesperson.phone,
          saleDate,
          amount: inst.amount,
          termDays: diffDays,
          dueDate: inst.dueDate,
          notes,
          isSigned,
          photoUrl,
          status: 'pending',
          remindersLog: [],
          createdAt: todayIso,
          basketId,
          planId,
          saleMode: 'cuotas_personales',
          installmentNumber: inst.installmentNumber,
          totalInstallments: installmentsCount,
          baseAmount: summary.installmentBaseTotal,
          downPayment:
            summary.installmentPlanPreview && summary.installmentPlanPreview.downPayment > 0
              ? summary.installmentPlanPreview.downPayment
              : undefined,
          interestRatePercent: interestPercent,
          interestPercent,
          interestAmount: inst.interestPart,
          itemSummary: instSummary,
          items: summary.installmentItems,
        });
        scheduleLines.push(
          `Cuota ${inst.installmentNumber}/${installmentsCount}: ${formatCurrency(inst.amount, config.currencySymbol)} (Vto ${formatDateEs(inst.dueDate)})`
        );
      });
    }

    if (newPendingToAdd.length > 0) {
      handleSaveBoletas([...newPendingToAdd, ...boletas]);
    }
    if (newPaidToAdd.length > 0) {
      handleSavePaidBoletas([...newPaidToAdd, ...paidBoletas]);
    }

    const totalDocsCreated = newPendingToAdd.length + newPaidToAdd.length;
    if (totalDocsCreated > 0) {
      const updatedClients = clients.map((c) => {
        if (c.id !== client.id) return c;
        const h = ensureClientCreditHistory(c);
        return {
          ...c,
          creditHistory: {
            ...h,
            totalHistoricalBoletas: h.totalHistoricalBoletas + totalDocsCreated,
            totalPaidOnTime: h.totalPaidOnTime + newPaidToAdd.length,
            lastEvaluatedAt: new Date().toISOString(),
          },
        };
      });
      handleSaveClients(updatedClients);
    }

    setActiveReceiptData({
      receiptNumber: `CAN-${baseNumber}`,
      boletaNumber: baseNumber,
      clientId: client.id,
      clientName: client.name,
      clientAddress: client.address,
      salespersonName: salesperson.name,
      paymentDate: saleDate,
      amountPaidNow: summary.totalCashCollectedToday,
      paymentMethod: contadoMethod,
      originalAmount: summary.totalWithInterest,
      totalPaidAccumulated: summary.totalCashCollectedToday,
      remainingBalance: summary.totalPendingDebtGenerated,
      receivedBy: activeAdmin?.name || salesperson.name,
      notes,
      items: allItems,
      basketSummaryLines: scheduleLines,
      isFullSettlement: summary.totalPendingDebtGenerated <= 0,
      initialPhone: client.phone || '',
      saleModeLabel: 'COMPROBANTE DE CANASTO MIXTO',
    });

    showToast(`Canasto #${baseNumber} guardado con ${allItems.length} producto(s).`);
  };

  // Quick Client inline
  const handleQuickCreateClient = (newClient: Client) => {
    const updated = [newClient, ...clients];
    handleSaveClients(updated);
    showToast(`Cliente "${newClient.name}" registrado.`);
  };

  // Update existing client (from ClientsManager or inline edit inside NewBoletaModal)
  const handleUpdateClient = (updatedClient: Client) => {
    const updated = clients.map((c) => (c.id === updatedClient.id ? updatedClient : c));
    handleSaveClients(updated);

    // Sync pending boletas with updated client contact data if changed
    const hasPendingForClient = boletas.some((b) => b.clientId === updatedClient.id);
    if (hasPendingForClient) {
      const syncedBoletas = boletas.map((b) =>
        b.clientId === updatedClient.id
          ? {
              ...b,
              clientName: updatedClient.name,
              clientAddress: updatedClient.address,
              clientPhone: updatedClient.phone,
            }
          : b
      );
      handleSaveBoletas(syncedBoletas);
    }

    showToast(`Datos y tope de "${updatedClient.name}" actualizados.`);
  };

  // Save manually typed phone onto a client record from receipt/payment modal
  const handleSaveClientPhone = (clientId: string, phone: string) => {
    const cleanPhone = phone.trim();
    if (!cleanPhone) return;
    const updatedClients = clients.map((c) =>
      c.id === clientId ? { ...c, phone: cleanPhone } : c
    );
    handleSaveClients(updatedClients);
    const updatedBoletas = boletas.map((b) =>
      b.clientId === clientId ? { ...b, clientPhone: cleanPhone } : b
    );
    handleSaveBoletas(updatedBoletas);
    showToast('Teléfono guardado en la ficha del cliente.');
  };

  // Mark as Paid flow
  const handleConfirmPayment = (
    boletaId: string,
    paymentData: {
      paidAt: string;
      paymentMethod: 'efectivo' | 'transferencia' | 'cheque' | 'otro';
      paymentReference?: string;
      paymentNotes?: string;
      lateSurchargeAmount?: number;
    }
  ) => {
    const target = boletas.find((b) => b.id === boletaId);
    if (!target) return;

    // Remove from pending
    const remainingPending = boletas.filter((b) => b.id !== boletaId);
    handleSaveBoletas(remainingPending);

    const extraSurcharge = paymentData.lateSurchargeAmount && paymentData.lateSurchargeAmount > 0
      ? paymentData.lateSurchargeAmount
      : 0;

    // Add to paid archive
    const paidRecord: Boleta = {
      ...target,
      amount: Math.round((target.amount + extraSurcharge) * 100) / 100,
      lateSurchargeApplied: extraSurcharge > 0 ? (target.lateSurchargeApplied || 0) + extraSurcharge : target.lateSurchargeApplied,
      status: 'paid',
      paidAt: paymentData.paidAt,
      paymentMethod: paymentData.paymentMethod,
      paymentReference: paymentData.paymentReference,
      paymentNotes: paymentData.paymentNotes,
    };

    const updatedPaid = [paidRecord, ...paidBoletas];
    handleSavePaidBoletas(updatedPaid);

    // Evaluar puntualidad vs mora en el historial del cliente
    const daysElapsedPaid = getDaysElapsed(target.saleDate, new Date(`${paymentData.paidAt}T12:00:00`));
    const wasSeverelyDelayed = daysElapsedPaid > target.termDays + 3;

    const updatedClients = clients.map((c) => {
      if (c.id === target.clientId) {
        const h = ensureClientCreditHistory(c);
        const totalPaidOnTime = wasSeverelyDelayed ? h.totalPaidOnTime : h.totalPaidOnTime + 1;
        const totalLatePayments = wasSeverelyDelayed ? h.totalLatePayments + 1 : h.totalLatePayments;
        let reputationStatus = h.reputationStatus;
        if (h.totalPurgedUnpaid > 0) {
          reputationStatus = 'problematico';
        } else if (totalLatePayments > 2) {
          reputationStatus = 'regular';
        } else {
          reputationStatus = 'confiable';
        }
        return {
          ...c,
          creditHistory: {
            ...h,
            totalPaidOnTime,
            totalLatePayments,
            reputationStatus,
            lastEvaluatedAt: new Date().toISOString(),
          },
        };
      }
      return c;
    });
    handleSaveClients(updatedClients);

    showToast(`¡Boleta #${target.boletaNumber} cobrada y archivada en el historial!`);
  };

  // Depuración manual / periódica de 30 días
  const handleExecuteRetentionPurge = () => {
    const purgeResult = purgeExpiredBoletas(boletas, paidBoletas, clients, 30);
    if (purgeResult.totalPurged > 0) {
      handleSaveBoletas(purgeResult.survivingBoletas);
      handleSavePaidBoletas(purgeResult.survivingPaidBoletas);
      handleSaveClients(purgeResult.updatedClients);
      const updatedConfig = {
        ...config,
        totalPurgedBoletasCount: (config.totalPurgedBoletasCount || 0) + purgeResult.totalPurged,
        lastRetentionPurgeDate: new Date().toISOString().split('T')[0],
      };
      handleSaveConfig(updatedConfig);
      showToast(
        `🧹 Depuración de 30 días: Se eliminaron ${purgeResult.totalPurged} boletas del sistema (${purgeResult.purgedPendingCount} impagas / ${purgeResult.purgedPaidCount} archivadas). El historial y reputación de cada cliente quedó guardado de por vida.`
      );
    } else {
      showToast('✨ Todas las boletas registradas tienen menos de 30 días. La base de datos está al día.');
    }
  };

  // Register partial payment (entrega a cuenta) without altering original boleta amount
  const handleSavePartialPayment = (
    boletaId: string,
    payment: Omit<PartialPayment, 'id'>,
    shouldMarkPaidIfCompleted?: boolean
  ) => {
    const target = boletas.find((b) => b.id === boletaId);
    if (!target) return;

    const newPayment: PartialPayment = {
      ...payment,
      id: `part-${Date.now()}`,
    };

    const updatedPartialPayments = [...(target.partialPayments || []), newPayment];
    const totalPaidSoFar = updatedPartialPayments.reduce((acc, p) => acc + (p.amount || 0), 0);
    const netAmountBeforePayment = getBoletaBalance(target).netAmount;
    const remainingBalance = Math.max(0, netAmountBeforePayment - totalPaidSoFar);

    if (remainingBalance <= 0 || shouldMarkPaidIfCompleted) {
      // Completed! Move to archive
      const remainingPending = boletas.filter((b) => b.id !== boletaId);
      handleSaveBoletas(remainingPending);

      const paidRecord: Boleta = {
        ...target,
        status: 'paid',
        partialPayments: updatedPartialPayments,
        paidAt: payment.date,
        paymentMethod: payment.paymentMethod,
        paymentNotes: `Cancelada en su totalidad con pagos parciales. ${payment.notes || ''}`.trim(),
      };
      const updatedPaid = [paidRecord, ...paidBoletas];
      handleSavePaidBoletas(updatedPaid);
      showToast(
        `¡Boleta #${target.boletaNumber} cancelada al 100% y archivada en el historial!`
      );
    } else {
      // Keep original boleta, update partial payments
      const updatedBoletas = boletas.map((b) =>
        b.id === boletaId ? { ...b, partialPayments: updatedPartialPayments } : b
      );
      handleSaveBoletas(updatedBoletas);
      showToast(
        `Entrega de $${payment.amount.toLocaleString('es-AR')} registrada. Saldo restante: $${remainingBalance.toLocaleString('es-AR')}.`
      );
    }
  };

  // Register partial payment WITH optional surcharge added onto unpaid remaining balance
  const handleApplyUnderpaymentWithSurcharge = (
    boletaId: string,
    payment: Omit<PartialPayment, 'id'>,
    extraSurchargeAmount: number
  ) => {
    const target = boletas.find((b) => b.id === boletaId);
    if (!target) return;

    const newPayment: PartialPayment = {
      ...payment,
      id: `part-${Date.now()}`,
      surchargeAdded: extraSurchargeAmount > 0 ? extraSurchargeAmount : undefined,
    };

    const updatedPartialPayments = [...(target.partialPayments || []), newPayment];
    const newTotalAmount = Math.round((target.amount + extraSurchargeAmount) * 100) / 100;
    const totalPaidSoFar = updatedPartialPayments.reduce((acc, p) => acc + (p.amount || 0), 0);
    const remainingBalance = Math.max(0, newTotalAmount - totalPaidSoFar);

    const updatedBoletas = boletas.map((b) =>
      b.id === boletaId
        ? {
            ...b,
            amount: newTotalAmount,
            lateSurchargeApplied: (b.lateSurchargeApplied || 0) + extraSurchargeAmount,
            partialPayments: updatedPartialPayments,
          }
        : b
    );
    handleSaveBoletas(updatedBoletas);
    showToast(
      `Entrega de $${payment.amount.toLocaleString('es-AR')} + recargo $${extraSurchargeAmount.toLocaleString('es-AR')} aplicada. Saldo restante: $${remainingBalance.toLocaleString('es-AR')}.`
    );
  };

  // Shared multi-boleta allocation engine (for excess cuota payments & FIFO lump-sum account payments)
  const handleApplyAllocationPlan = (
    plan: ExcessPaymentAllocationPlan,
    paymentMeta: {
      date: string;
      paymentMethod: 'efectivo' | 'transferencia' | 'cheque' | 'otro';
      notes?: string;
      receivedBy: string;
      receiptNumber: string;
      whatsappPhone?: string;
      openReceiptAfterSave: boolean;
    }
  ) => {
    if (!plan.lines.length) return;

    const affectedLines = plan.lines.filter((l) => l.appliedPayment > 0 || l.interestReduction > 0);
    if (!affectedLines.length) return;

    const allocMap = new Map(affectedLines.map((a) => [a.boletaId, a]));
    const nextPending: Boleta[] = [];
    const newlyPaid: Boleta[] = [];
    let primaryClientId = '';
    let primaryClientName = '';
    let primaryClientAddress: string | undefined;
    let primarySalespersonName = '';
    const affectedLabels: string[] = [];

    const nowTs = Date.now();
    boletas.forEach((b, idx) => {
      const alloc = allocMap.get(b.id);
      if (!alloc) {
        nextPending.push(b);
        return;
      }
      primaryClientId = b.clientId;
      primaryClientName = b.clientName;
      primaryClientAddress = b.clientAddress;
      primarySalespersonName = b.salespersonName;
      affectedLabels.push(`#${b.boletaNumber}`);

      const adjustedTotal = Math.round((b.amount - alloc.interestReduction) * 100) / 100;
      const newDiscountAcc = (b.earlyPaymentDiscountApplied || 0) + alloc.interestReduction;
      const paymentEntry: PartialPayment = {
        id: `part-${nowTs}-${idx}`,
        receiptNumber: paymentMeta.receiptNumber,
        date: paymentMeta.date,
        amount: alloc.appliedPayment,
        paymentMethod: paymentMeta.paymentMethod,
        notes: paymentMeta.notes,
        receivedBy: paymentMeta.receivedBy,
        interestDiscounted: alloc.interestReduction > 0 ? alloc.interestReduction : undefined,
      };
      const updatedPartials = [...(b.partialPayments || []), paymentEntry];

      if (alloc.willSettleCompletely) {
        newlyPaid.push({
          ...b,
          amount: adjustedTotal,
          earlyPaymentDiscountApplied: newDiscountAcc > 0 ? newDiscountAcc : undefined,
          partialPayments: updatedPartials,
          status: 'paid',
          paidAt: paymentMeta.date,
          paymentMethod: paymentMeta.paymentMethod,
          paymentReference: paymentMeta.receiptNumber,
          paymentNotes: paymentMeta.notes || 'Cancelado mediante aplicación de pago combinado/adelantado',
        });
      } else {
        nextPending.push({
          ...b,
          amount: adjustedTotal,
          earlyPaymentDiscountApplied: newDiscountAcc > 0 ? newDiscountAcc : undefined,
          partialPayments: updatedPartials,
        });
      }
    });

    handleSaveBoletas(nextPending);
    if (newlyPaid.length > 0) {
      handleSavePaidBoletas([...newlyPaid, ...paidBoletas]);
      const updatedClients = clients.map((c) => {
        if (c.id !== primaryClientId) return c;
        const h = ensureClientCreditHistory(c);
        return {
          ...c,
          creditHistory: {
            ...h,
            totalPaidOnTime: h.totalPaidOnTime + newlyPaid.length,
            lastEvaluatedAt: new Date().toISOString(),
          },
        };
      });
      handleSaveClients(updatedClients);
    }

    if (paymentMeta.openReceiptAfterSave) {
      const totalOriginalAll = affectedLines.reduce((s, a) => {
        const match = boletas.find((b) => b.id === a.boletaId);
        return s + (match ? match.amount - a.interestReduction : 0);
      }, 0);
      const clientAfter = nextPending.filter((b) => b.clientId === primaryClientId);
      const remainingAllAfter = clientAfter.reduce((s, b) => s + getBoletaBalance(b).balanceDue, 0);

      setActiveReceiptData({
        receiptNumber: paymentMeta.receiptNumber,
        boletaNumber: affectedLabels.join(', '),
        clientId: primaryClientId,
        clientName: primaryClientName,
        clientAddress: primaryClientAddress,
        salespersonName: primarySalespersonName,
        paymentDate: paymentMeta.date,
        amountPaidNow: plan.totalAppliedAcrossPlan,
        paymentMethod: paymentMeta.paymentMethod,
        originalAmount: Math.round(totalOriginalAll * 100) / 100,
        totalPaidAccumulated: plan.totalAppliedAcrossPlan,
        remainingBalance: Math.round(remainingAllAfter * 100) / 100,
        receivedBy: paymentMeta.receivedBy,
        notes:
          plan.totalInterestReduction > 0
            ? `${paymentMeta.notes ? paymentMeta.notes + ' · ' : ''}Bonificación de interés adelantado: -$${plan.totalInterestReduction.toLocaleString('es-AR')}`
            : paymentMeta.notes,
        isFullSettlement: remainingAllAfter <= 0,
        initialPhone: paymentMeta.whatsappPhone || '',
      });
    }

    showToast(
      `Pago de $${plan.totalAppliedAcrossPlan.toLocaleString('es-AR')} aplicado en ${affectedLines.length} comprobante(s)${
        plan.totalInterestReduction > 0
          ? ` · -$${plan.totalInterestReduction.toLocaleString('es-AR')} interés reducido`
          : ''
      }.`
    );
  };

  // Devoluciones / Notas de Crédito sobre boletas o cuotas (exclusivo rubro Indumentaria, sin afectar caja)
  const handleApplyCreditNote = (
    plan: CreditNoteAllocationPlan,
    meta: {
      creditNoteNumber: string;
      date: string;
      returnedItem: string;
      reason: BoletaCreditNoteReason;
      notes?: string;
      recordedBy: string;
    }
  ) => {
    if (config.businessRubro !== 'indumentaria') return;
    const affectedLines = plan.lines.filter((l) => l.appliedCredit > 0);
    if (!affectedLines.length) return;

    const allocMap = new Map(affectedLines.map((l) => [l.boletaId, l]));
    const nextPending: Boleta[] = [];
    const newlySettledByCredit: Boleta[] = [];
    const nowTs = Date.now();

    boletas.forEach((b, idx) => {
      const line = allocMap.get(b.id);
      if (!line) {
        nextPending.push(b);
        return;
      }

      const creditEntry: BoletaCreditNote = {
        id: `nc-${nowTs}-${idx}`,
        creditNoteNumber: meta.creditNoteNumber,
        date: meta.date,
        amount: line.appliedCredit,
        returnedItem: meta.returnedItem,
        reason: meta.reason,
        notes: meta.notes,
        recordedBy: meta.recordedBy,
      };

      const updatedCreditNotes = [...(b.creditNotes || []), creditEntry];
      const totalCreditNotesAmount = Math.round(
        updatedCreditNotes.reduce((acc, cn) => acc + (cn.amount || 0), 0) * 100
      ) / 100;

      if (line.willSettleCompletely) {
        newlySettledByCredit.push({
          ...b,
          creditNotes: updatedCreditNotes,
          totalCreditNotesAmount,
          status: 'paid',
          paidAt: meta.date,
          paymentMethod: b.paymentMethod || 'efectivo',
          paymentReference: meta.creditNoteNumber,
          paymentNotes: `Saldada mediante Nota de Crédito / Devolución (${meta.returnedItem})${
            meta.notes ? ` · ${meta.notes}` : ''
          }`,
        });
      } else {
        nextPending.push({
          ...b,
          creditNotes: updatedCreditNotes,
          totalCreditNotesAmount,
        });
      }
    });

    handleSaveBoletas(nextPending);
    if (newlySettledByCredit.length > 0) {
      handleSavePaidBoletas([...newlySettledByCredit, ...paidBoletas]);
    }

    showToast(
      `Nota de Crédito ${meta.creditNoteNumber} (-$${plan.totalAppliedCredit.toLocaleString('es-AR')}) aplicada en ${affectedLines.length} comprobante(s) sin afectar caja.`
    );
  };

  // Prorrogar boleta (Extender fecha de vencimiento otorgando días)
  const handleExtendBoleta = (boletaId: string, addedDays: number, reason?: string) => {
    const target = boletas.find((b) => b.id === boletaId);
    if (!target) return;

    const previousDueDate = target.dueDate;
    const newDueDate = addDaysToDate(target.dueDate, addedDays);
    const newExtension: BoletaExtension = {
      id: `ext-${Date.now()}`,
      extendedAt: new Date().toISOString(),
      addedDays,
      previousDueDate,
      newDueDate,
      reason: reason || `Prórroga de ${addedDays} días otorgada`,
      authorizedBy: activeAdmin?.name || 'Administración',
    };

    const updatedBoletas = boletas.map((b) => {
      if (b.id === boletaId) {
        return {
          ...b,
          dueDate: newDueDate,
          originalDueDate: b.originalDueDate || previousDueDate,
          extensionDays: (b.extensionDays || 0) + addedDays,
          extensions: [...(b.extensions || []), newExtension],
        };
      }
      return b;
    });

    handleSaveBoletas(updatedBoletas);
    showToast(
      `⏱️ ¡Boleta #${target.boletaNumber} prorrogada por +${addedDays} días! Nuevo vencimiento: ${formatDateEs(newDueDate)}.`
    );
  };

  // Registrar visita en calle o promesa de pago (sin alterar mora original)
  const handleSaveCollectionVisit = (params: {
    boletaId: string;
    outcome: CollectionVisitStatus;
    promisedDate?: string;
    note?: string;
  }) => {
    const target = boletas.find((b) => b.id === params.boletaId);
    if (!target) return;

    const newLog: CollectionVisitLog = {
      id: `visit-${Date.now()}`,
      date: currentDateRef,
      timestamp: new Date().toISOString(),
      outcome: params.outcome,
      promisedDate: params.promisedDate,
      note: params.note,
      recordedBy: activeAdmin?.name || currentUser?.fullName || 'Administración',
    };

    const updatedBoletas = boletas.map((b) => {
      if (b.id === params.boletaId) {
        return {
          ...b,
          visitLogs: [...(b.visitLogs || []), newLog],
          promisedPaymentDate: params.promisedDate ?? b.promisedPaymentDate,
          lastVisitOutcome: params.outcome,
          lastVisitDate: currentDateRef,
          lastVisitNote: params.note || b.lastVisitNote,
        };
      }
      return b;
    });

    handleSaveBoletas(updatedBoletas);
    const meta = getVisitOutcomeMeta(params.outcome);
    if (params.promisedDate && params.promisedDate !== currentDateRef) {
      showToast(
        `${meta.label} registrada (#${target.boletaNumber}). Reagendada en Agenda para ${formatDateEs(params.promisedDate)}.`
      );
    } else {
      showToast(`${meta.label} registrada en boleta #${target.boletaNumber}.`);
    }
  };

  const handleClearCollectionPromise = (boletaId: string) => {
    const target = boletas.find((b) => b.id === boletaId);
    if (!target) return;
    const updatedBoletas = boletas.map((b) =>
      b.id === boletaId ? { ...b, promisedPaymentDate: undefined } : b
    );
    handleSaveBoletas(updatedBoletas);
    showToast(
      `Boleta #${target.boletaNumber} volvió a su fecha original (${formatDateEs(target.dueDate)}).`
    );
  };

  // Delete Boleta (Admin privilege)
  const handleDeleteBoleta = (boletaId: string) => {
    const updated = boletas.filter((b) => b.id !== boletaId);
    handleSaveBoletas(updated);
    showToast('Boleta eliminada del sistema.');
  };

  // Restore Paid Boleta back to pending
  const handleRestoreBoleta = (boletaId: string) => {
    const target = paidBoletas.find((b) => b.id === boletaId);
    if (!target) return;

    const remainingPaid = paidBoletas.filter((b) => b.id !== boletaId);
    handleSavePaidBoletas(remainingPaid);

    const restored: Boleta = {
      ...target,
      status: 'pending',
      paidAt: undefined,
      paymentMethod: undefined,
      paymentReference: undefined,
    };

    handleSaveBoletas([restored, ...boletas]);
    showToast(`Boleta #${target.boletaNumber} devuelta a pendientes.`);
  };

  // Record reminder sent
  const handleRecordReminder = (
    boletaId: string,
    type: any,
    channel: 'whatsapp' | 'email',
    recipient: string
  ) => {
    const updated = boletas.map((b) => {
      if (b.id === boletaId) {
        return {
          ...b,
          remindersLog: [
            ...(b.remindersLog || []),
            {
              id: `rem-${Date.now()}`,
              date: new Date().toISOString().split('T')[0],
              type,
              channel,
              recipient,
            },
          ],
        };
      }
      return b;
    });
    handleSaveBoletas(updated);
  };

  // Notificación automática a los dueños cuando se anula la carga de una boleta por tener deuda previa
  const handleNotifyOwnersBlockedAttempt = (client: Client, existingBoleta: Boleta) => {
    executeBlockedChargeAlertDirect({
      client,
      existingBoleta,
      config,
      admins,
    })
      .then((logs) => {
        if (logs.length > 0) {
          const updatedLogs = [...logs, ...autoLogs];
          setAutoLogs(updatedLogs);
          saveAutoDispatchLogs(updatedLogs);
          if (selectedTenant) {
            const cur = loadTenantData(selectedTenant.id);
            cur.autoLogs = [...logs, ...(cur.autoLogs || [])];
            saveTenantData(selectedTenant.id, cur);
          }
        }
      })
      .catch((err) => {
        console.error('Error al generar alerta a los dueños:', err);
      });

    showToast(`🚫 Carga anulada: Se registró la alerta para los dueños sobre la boleta #${existingBoleta.boletaNumber} de ${client.name}.`);
  };

  // Clear operational records for active company while keeping config and admins
  const handleResetOperationalData = () => {
    resetOperationalData();
    setClients([]);
    setSalespeople([]);
    setBoletas([]);
    setPaidBoletas([]);
    setBroadcasts([]);
    setAutoLogs([]);
    setRendiciones([]);
    if (selectedTenant) {
      const cur = loadTenantData(selectedTenant.id);
      saveTenantData(selectedTenant.id, {
        ...cur,
        clients: [],
        salespeople: [],
        boletas: [],
        paidBoletas: [],
        broadcasts: [],
        autoLogs: [],
        rendiciones: [],
      });
    }
    showToast('Registros operativos vaciados correctamente.');
  };

  const currentDateRef = new Date().toISOString().split('T')[0];

  // Filter pending boletas
  const pendingBoletas = boletas.filter((b) => b.status === 'pending');

  const filteredBoletas = pendingBoletas.filter((b) => {
    const status = calculateAlertStatus(b, config, currentDateRef);

    const matchesSearch =
      b.boletaNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.salespersonName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (b.notes && b.notes.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesSeller =
      selectedSalespersonFilter === 'all' || b.salespersonId === selectedSalespersonFilter;

    let matchesStatus = true;
    if (statusFilter === 'urgent_10d') matchesStatus = status.daysElapsed >= 10;
    else if (statusFilter === 'overdue') matchesStatus = status.isOverdueOrToday || status.daysElapsed >= 10;
    else if (statusFilter === 'admin_alert') matchesStatus = status.category === 'admin_6d' || status.category === 'admin_alert';
    else if (statusFilter === 'vendedor_3dias') matchesStatus = status.category === 'vendedor_2d' || status.category === 'vendedor_reminder';
    else if (statusFilter === 'normal') matchesStatus = status.category === 'normal';

    return matchesSearch && matchesSeller && matchesStatus;
  });

  // Sort boletas: Prioriza automáticamente las boletas con 10 o más días en PRIMER LUGAR (Modo Alerta Roja)
  // ordenadas por las más antiguas primero, sin importar la fecha ni el ordenamiento seleccionado abajo.
  const sortedBoletas = [...filteredBoletas].sort((a, b) => {
    const statusA = calculateAlertStatus(a, config, currentDateRef);
    const statusB = calculateAlertStatus(b, config, currentDateRef);

    const isUrgent10A = statusA.daysElapsed >= 10;
    const isUrgent10B = statusB.daysElapsed >= 10;

    // 1. Si pasaron 10 días, van PRIMERAS COMO PRIORITARIAS (urgente)
    if (isUrgent10A && !isUrgent10B) return -1;
    if (!isUrgent10A && isUrgent10B) return 1;

    // 2. Entre las de 10+ días, suben las más viejas primero (15d, 14d, 13d...)
    if (isUrgent10A && isUrgent10B) {
      return statusB.daysElapsed - statusA.daysElapsed;
    }

    // 3. Para las demás (< 10 días), se respeta el ordenamiento seleccionado:
    if (sortBy === 'days_desc') {
      return statusB.daysElapsed - statusA.daysElapsed;
    }
    if (sortBy === 'due_asc') {
      return statusA.daysRemaining - statusB.daysRemaining;
    }
    if (sortBy === 'amount_desc') {
      return b.amount - a.amount;
    }
    return 0;
  });

  // Filter counts
  const counts = pendingBoletas.reduce(
    (acc, b) => {
      const status = calculateAlertStatus(b, config, currentDateRef);
      if (status.daysElapsed >= 10) acc.urgent10d++;
      if (status.isOverdueOrToday || status.daysElapsed >= 10) acc.overdue++;
      if (status.category === 'admin_6d' || status.category === 'admin_alert') acc.adminAlert++;
      if (status.category === 'vendedor_2d' || status.category === 'vendedor_reminder') acc.vendedorReminder++;
      if (status.category === 'normal') acc.normal++;
      return acc;
    },
    { urgent10d: 0, overdue: 0, adminAlert: 0, vendedorReminder: 0, normal: 0 }
  );

  // Financial KPI calculations (descuentan pagos parciales y notas de crédito sin contar devoluciones como plata cobrada)
  const totalPendingDebt = pendingBoletas.reduce(
    (acc, b) => acc + getBoletaBalance(b).balanceDue,
    0
  );

  const totalCollectedHistorical = paidBoletas.reduce((acc, b) => {
    const creditNotesSum = (b.creditNotes || []).reduce((s, cn) => s + (cn.amount || 0), 0);
    return acc + Math.max(0, (b.amount || 0) - creditNotesSum);
  }, 0);

  const paidWebOrders = catalogOrders.filter((o) => o.status === 'retirado');
  const pendingWebOrders = catalogOrders
    .filter((o) => o.status !== 'retirado' && o.status !== 'cancelado' && o.status !== 'devuelto')
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const pendingWebOrdersCount = pendingWebOrders.length;
  const totalWebSalesRevenue = paidWebOrders.reduce(
    (acc, o) => acc + Math.max(0, (Number(o.totalAmount) || 0) - (Number(o.returnedAmount) || 0)),
    0
  );
  const todayWebSalesRevenue = paidWebOrders
    .filter((o) => (o.dispatchedAt || o.createdAt || '').slice(0, 10) === currentDateRef)
    .reduce(
      (acc, o) => acc + Math.max(0, (Number(o.totalAmount) || 0) - (Number(o.returnedAmount) || 0)),
      0
    );

  const urgent10dDebt = pendingBoletas.reduce((acc, b) => {
    const st = calculateAlertStatus(b, config, currentDateRef);
    if (st.daysElapsed >= 10) {
      return acc + getBoletaBalance(b).balanceDue;
    }
    return acc;
  }, 0);

  // Fiado Vencido Crítico (+5 días posteriores al vencimiento pactado)
  const graceThreshold = config.overdueGraceDays !== undefined ? config.overdueGraceDays : 5;
  const criticalOverdueBoletas = pendingBoletas.filter((b) => {
    const st = calculateAlertStatus(b, config, currentDateRef);
    return st.daysPastDueDate >= graceThreshold;
  });
  const criticalGraceOverdueDebt = criticalOverdueBoletas.reduce(
    (acc, b) => acc + getBoletaBalance(b).balanceDue,
    0
  );

  const generalAdmin = admins.find((a) => a.isGeneralAdmin || a.role === 'dueño') || admins[0];
  const activeAdmin = admins.find((a) => a.id === config.activeAdminId) || generalAdmin;

  const coldClientsIndumentaria =
    config.businessRubro === 'indumentaria'
      ? analyzeColdClientsForIndumentaria({
          clients,
          boletas,
          paidBoletas,
          config,
          senderName: activeAdmin?.name || 'Administración',
          thresholdDays: 30,
          referenceDateStr: currentDateRef,
        })
      : [];

  const handleSelectTab = (tab: string) => {
    setClientsInitialSection('directory');
    setActiveTab(tab);
  };

  const handleOpenColdClientsRadar = () => {
    if (config.businessRubro !== 'indumentaria') return;
    setClientsInitialSection('cold_radar');
    setActiveTab('clientes');
  };

  const handleSaveBroadcast = (broadcast: BroadcastMessage) => {
    const updated = [broadcast, ...broadcasts];
    setBroadcasts(updated);
    if (selectedTenant) {
      const cur = loadTenantData(selectedTenant.id);
      cur.broadcasts = updated;
      saveTenantData(selectedTenant.id, cur);
    }
    saveBroadcastMessages(updated);
    showToast('Aviso guardado y preparado para enviar por WhatsApp.');
  };

  const handleExportPendingCSV = () => {
    const headers = [
      'Boleta',
      'Cliente',
      'Vendedor',
      'Fecha Venta',
      'Vencimiento',
      'Dias Transcurridos',
      'Monto Original',
      'Saldo Pendiente',
      'Prorroga (Dias)',
      'Estado',
    ];
    const rows = sortedBoletas.map((b) => {
      const st = calculateAlertStatus(b, config, currentDateRef);
      const bal = getBoletaBalance(b);
      return [
        `"${b.boletaNumber}"`,
        `"${b.clientName.replace(/"/g, '""')}"`,
        `"${b.salespersonName.replace(/"/g, '""')}"`,
        `"${b.saleDate}"`,
        `"${b.dueDate}"`,
        st.daysElapsed,
        bal.originalAmount,
        bal.balanceDue,
        b.extensionDays || 0,
        `"${st.categoryLabel}"`,
      ].join(',');
    });
    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Boletas_Pendientes_${currentDateRef}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Exportadas ${sortedBoletas.length} boletas en formato CSV.`);
  };

  // Zero-click Client Payment Auto-Reconciliation:
  // Polls Supabase (and listens to Realtime) so when a client pays via WhatsApp link
  // (Mercado Pago, credit/debit card, or verified transfer), their account is automatically settled FIFO.
  const latestBoletasRef = useRef<Boleta[]>(boletas);
  const latestPaidBoletasRef = useRef<Boleta[]>(paidBoletas);
  const latestClientsRef = useRef<Client[]>(clients);
  const reconcilingTokensRef = useRef<Set<string>>(new Set());

  latestBoletasRef.current = boletas;
  latestPaidBoletasRef.current = paidBoletas;
  latestClientsRef.current = clients;

  useEffect(() => {
    if (clientPayToken || publicCatalogHandle || !currentUser || currentUser.role === 'superadmin') return;
    const activeTenantId = selectedTenant?.id || config.tenantId || 'default-tenant';
    let cancelled = false;

    const runAutoReconcile = async () => {
      try {
        const orders: ClientPaymentOrder[] =
          await fetchPendingReconciliationOrdersFromSupabase(activeTenantId);
        if (cancelled || orders.length === 0) return;

        let workingPending = [...latestBoletasRef.current];
        let workingPaid = [...latestPaidBoletasRef.current];
        let workingClients = [...latestClientsRef.current];
        let anyStateChanged = false;

        for (const order of orders) {
          if (cancelled || reconcilingTokensRef.current.has(order.token)) continue;
          reconcilingTokensRef.current.add(order.token);

          const clientPending = workingPending.filter(
            (b) => b.clientId === order.clientId && b.status === 'pending'
          );

          if (clientPending.length > 0) {
            const preferredIdSet = new Set(order.boletaIds || []);
            const orderedCandidates = [...clientPending].sort((a, b) => {
              const aPref = preferredIdSet.has(a.id) ? 0 : 1;
              const bPref = preferredIdSet.has(b.id) ? 0 : 1;
              if (aPref !== bPref) return aPref - bPref;
              return a.dueDate.localeCompare(b.dueDate);
            });

            const plan = calculateExcessPaymentAllocation({
              currentBoleta: orderedCandidates[0],
              candidateBoletas: orderedCandidates,
              totalAmountEntered: order.amount,
            });

            const affectedLines = plan.lines.filter(
              (l) => l.appliedPayment > 0 || l.interestReduction > 0
            );
            if (affectedLines.length > 0) {
              const allocMap = new Map(affectedLines.map((l) => [l.boletaId, l]));
              const nextPendingBatch: Boleta[] = [];
              const newlyPaidBatch: Boleta[] = [];
              const paidDateStr = order.paidAt || new Date().toISOString().split('T')[0];
              const receiptRef = order.mpPaymentId
                ? `MP-${order.mpPaymentId}`
                : `LINK-${order.token.slice(-6).toUpperCase()}`;
              const noteText =
                order.verificationSummary ||
                `Pago online acreditado automáticamente vía Link WhatsApp (${
                  order.paymentMethod === 'mercadopago' ? 'Mercado Pago / Tarjeta' : 'Transferencia Alias/CVU'
                })`;

              workingPending.forEach((b, idx) => {
                const alloc = allocMap.get(b.id);
                if (!alloc) {
                  nextPendingBatch.push(b);
                  return;
                }
                const adjustedTotal = Math.round((b.amount - alloc.interestReduction) * 100) / 100;
                const newDiscountAcc = (b.earlyPaymentDiscountApplied || 0) + alloc.interestReduction;
                const paymentEntry: PartialPayment = {
                  id: `auto-link-${Date.now()}-${idx}`,
                  receiptNumber: receiptRef,
                  date: paidDateStr,
                  amount: alloc.appliedPayment,
                  paymentMethod: 'transferencia',
                  notes: noteText,
                  receivedBy: 'Acreditación Automática Online',
                  interestDiscounted: alloc.interestReduction > 0 ? alloc.interestReduction : undefined,
                };
                const updatedPartials = [...(b.partialPayments || []), paymentEntry];

                if (alloc.willSettleCompletely) {
                  newlyPaidBatch.push({
                    ...b,
                    amount: adjustedTotal,
                    earlyPaymentDiscountApplied: newDiscountAcc > 0 ? newDiscountAcc : undefined,
                    partialPayments: updatedPartials,
                    status: 'paid',
                    paidAt: paidDateStr,
                    paymentMethod: 'transferencia',
                    paymentReference: receiptRef,
                    paymentNotes: noteText,
                  });
                } else {
                  nextPendingBatch.push({
                    ...b,
                    amount: adjustedTotal,
                    earlyPaymentDiscountApplied: newDiscountAcc > 0 ? newDiscountAcc : undefined,
                    partialPayments: updatedPartials,
                  });
                }
              });

              workingPending = nextPendingBatch;
              if (newlyPaidBatch.length > 0) {
                workingPaid = [...newlyPaidBatch, ...workingPaid];
                workingClients = workingClients.map((c) => {
                  if (c.id !== order.clientId) return c;
                  const h = ensureClientCreditHistory(c);
                  return {
                    ...c,
                    creditHistory: {
                      ...h,
                      totalPaidOnTime: h.totalPaidOnTime + newlyPaidBatch.length,
                      lastEvaluatedAt: new Date().toISOString(),
                    },
                  };
                });
              }
              anyStateChanged = true;
            }
          }

          await markClientPaymentOrderReconciledInSupabase(order.token).catch(() => {});

          if (!cancelled) {
            showToast(
              `💳 Pago acreditado automáticamente: ${order.clientName} ($ ${order.amount.toLocaleString('es-AR')}) · Cuenta marcada como PAGA.`
            );
          }
        }

        if (!cancelled && anyStateChanged) {
          handleSaveBoletas(workingPending);
          handleSavePaidBoletas(workingPaid);
          handleSaveClients(workingClients);
        }
      } catch {
        // Silencioso en polling en segundo plano
      }
    };

    runAutoReconcile();
    const intervalId = setInterval(runAutoReconcile, 10000);
    window.addEventListener('focus', runAutoReconcile);
    window.addEventListener(SUPABASE_SYNC_EVENT, runAutoReconcile);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
      window.removeEventListener('focus', runAutoReconcile);
      window.removeEventListener(SUPABASE_SYNC_EVENT, runAutoReconcile);
    };
  }, [selectedTenant?.id, config.tenantId, currentUser?.role, clientPayToken]);

  // 0. If public client payment link (?pay_client=<token>) -> Standalone checkout view (no login needed)
  if (clientPayToken) {
    return (
      <Suspense fallback={<LazyViewFallback />}>
        <PublicClientPayView
          token={clientPayToken}
          onExitToApp={() => {
            if (typeof window !== 'undefined') {
              window.history.replaceState({}, document.title, window.location.pathname);
            }
            void ensureCloudHydrated();
            setClientPayToken(null);
          }}
        />
      </Suspense>
    );
  }

  // 0b. If public catalog storefront (?catalog=<handle>) -> Standalone storefront (no login needed)
  if (publicCatalogHandle) {
    return (
      <Suspense fallback={<LazyViewFallback />}>
        <PublicCatalogView
          catalogHandle={publicCatalogHandle}
          onExitToApp={() => {
            if (typeof window !== 'undefined') {
              window.history.replaceState({}, document.title, window.location.pathname);
            }
            void ensureCloudHydrated();
            setPublicCatalogHandle(null);
          }}
        />
      </Suspense>
    );
  }

  // 0c. If public tenant subscription payment link (?sub_pay=<token>) -> Standalone checkout portal
  if (tenantSubPayToken) {
    return (
      <Suspense fallback={<LazyViewFallback />}>
        <PublicTenantSubPayView
          token={tenantSubPayToken}
          onExitToApp={() => {
            if (typeof window !== 'undefined') {
              window.history.replaceState({}, document.title, window.location.pathname);
            }
            void ensureCloudHydrated();
            setTenantSubPayToken(null);
          }}
        />
      </Suspense>
    );
  }

  // 1. If not logged in -> Show direct Login Page
  if (!currentUser) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  // 2. If Super Admin -> Always show Super Admin Master Panel (Privacy boundary: cannot enter client accounts or view boletas)
  if (currentUser.role === 'superadmin') {
    return (
      <>
        <Suspense fallback={<LazyViewFallback />}>
          <SuperAdminPanel
            currentUser={currentUser}
            onLogout={handleLogout}
            showToast={showToast}
            onOpenUserProfile={() => setIsUserProfileOpen(true)}
          />
        </Suspense>
        <UserProfileModal
          isOpen={isUserProfileOpen}
          onClose={() => setIsUserProfileOpen(false)}
          currentUser={currentUser}
          onUpdateUser={(updated) => {
            setCurrentUser(updated);
            showToast('Perfil de Administrador actualizado.');
          }}
        />
      </>
    );
  }

  // Subscription and SaaS billing status for the logged-in company
  const tenantSubscriptionStatus = selectedTenant ? getTenantSubscriptionStatus(selectedTenant) : null;
  const tenantFeatureAccess = selectedTenant
    ? getTenantEffectiveFeatureAccess(selectedTenant)
    : {
        tier: 'full' as SubscriptionPlanTier,
        sectionLabel: 'Plan 3 · Full',
        isTrialFullPreview: false,
        canAccessWebCatalog: true,
        canAccessFullFeatures: true,
      };
  const planDefinitions = getSubscriptionPlanDefinitions(platformBillingCfg);

  // 3 & 3B. If Company is Paused (or suspended) OR 30-Day Trial Expired -> Show the 3 Plan Tiers (Plan 1, Plan 2, Plan 3) with amounts + feature comparison & direct pay redirect
  if (
    selectedTenant &&
    (selectedTenant.status === 'suspended' ||
      tenantSubscriptionStatus?.status === 'paused' ||
      tenantSubscriptionStatus?.status === 'trial_expired')
  ) {
    const isTrialExpiredGate = tenantSubscriptionStatus?.status === 'trial_expired';
    const isPausedByTrialEnd = selectedTenant.subscription?.pausedBy === 'trial_expired';
    return (
      <div className="min-h-screen bg-[#071021] text-[#E2E8F0] flex items-center justify-center p-4 sm:p-6 font-sans">
        <div className="bg-[#0B1933] border border-[#B6C2D2]/25 rounded-2xl p-6 sm:p-8 max-w-5xl w-full space-y-6 shadow-2xl">
          <div className="text-center space-y-2">
            <span
              className={`inline-block px-3 py-1 rounded-md text-xs font-mono font-bold border ${
                isTrialExpiredGate
                  ? 'bg-amber-950/70 text-amber-300 border-amber-500/40'
                  : 'bg-rose-950/60 text-rose-300 border-rose-500/35'
              }`}
            >
              {selectedTenant.tenantCode} ·{' '}
              {isTrialExpiredGate
                ? 'PRUEBA DE 30 DÍAS FINALIZADA'
                : isPausedByTrialEnd
                ? 'CUENTA PAUSADA · PRUEBA 30 DÍAS FINALIZADA'
                : 'CUENTA EN PAUSA'}
            </span>
            <h2 className="text-2xl font-bold text-white">
              {isTrialExpiredGate
                ? 'Finalizó tu Prueba Gratis de 30 Días · Elegí tu Plan'
                : 'Cuenta Pausada · Elegí un Plan para Reactivar'}
            </h2>
            <p className="text-xs text-[#94A3B8] max-w-2xl mx-auto leading-relaxed">
              {isTrialExpiredGate ? (
                <>
                  Tu período de prueba gratuito para <strong className="text-white">{selectedTenant.name}</strong> finalizó el{' '}
                  <strong className="text-white font-mono">{tenantSubscriptionStatus?.trialEndsAt}</strong>.
                </>
              ) : (
                <>
                  El acceso a la plataforma para <strong className="text-white">{selectedTenant.name}</strong> se encuentra en pausa.
                  {selectedTenant.subscription?.pauseReason ? ` (${selectedTenant.subscription.pauseReason})` : ''}
                </>
              )}{' '}
              Todos tus clientes, vendedores y boletas siguen guardados. Compará qué podés hacer en cada una de las 3 tipologías y elegí la tuya para pasar directo a pagar y quedar clasificado automáticamente:
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {planDefinitions.map((plan) => {
              const isSelected =
                (chosenPlanTierForPayModal || resolveTenantPlanTier(selectedTenant)) === plan.tier;
              return (
                <div
                  key={plan.tier}
                  className={`rounded-2xl border p-5 flex flex-col justify-between transition-all ${
                    plan.highlighted
                      ? 'bg-[#102244] border-sky-400/60 shadow-lg ring-1 ring-sky-400/30'
                      : isSelected
                      ? 'bg-[#0F2040] border-emerald-400/60'
                      : 'bg-[#081224] border-[#B6C2D2]/20 hover:border-[#B6C2D2]/40'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                          plan.tier === 'full'
                            ? 'bg-sky-500/20 text-sky-200 border-sky-400/40'
                            : plan.tier === 'web'
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30'
                            : 'bg-slate-700/50 text-slate-200 border-slate-500/40'
                        }`}
                      >
                        {plan.sectionBadge}
                      </span>
                      {plan.highlighted && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/30">
                          Más completo
                        </span>
                      )}
                    </div>

                    <div>
                      <h3 className="text-base font-bold text-white">{plan.shortName}</h3>
                      <p className="text-[11px] text-[#94A3B8] mt-1 leading-relaxed">
                        {plan.tagline}
                      </p>
                    </div>

                    <div className="pt-2 pb-3 border-y border-[#B6C2D2]/15">
                      <p className="text-[10px] uppercase tracking-wider text-[#94A3B8]">
                        Abono Mensual
                      </p>
                      <p className="text-2xl font-extrabold text-emerald-400 font-mono tabular-nums mt-0.5">
                        $ {plan.monthlyPrice.toLocaleString('es-AR')}
                        <span className="text-xs font-normal text-[#94A3B8]"> / mes</span>
                      </p>
                    </div>

                    <ul className="space-y-1.5 text-[11px]">
                      {plan.includedFeatures.map((feat, idx) => (
                        <li key={idx} className="flex items-start gap-1.5 text-[#E2E8F0]">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                          <span>{feat}</span>
                        </li>
                      ))}
                      {plan.excludedFeatures.map((ex, idx) => (
                        <li key={`ex-${idx}`} className="flex items-start gap-1.5 text-slate-500">
                          <X className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                          <span className="line-through">{ex}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setPendingGatePlanTier(plan.tier);
                      setGatePlanTermsAccepted(false);
                    }}
                    className={`mt-5 w-full py-2.5 px-3 rounded-xl text-xs font-bold cursor-pointer flex items-center justify-center gap-1.5 transition-colors ${
                      plan.highlighted
                        ? 'bg-[#009EE3] hover:bg-[#008AD0] text-white shadow-md'
                        : 'bg-[#E2E8F0] hover:bg-white text-[#091428]'
                    }`}
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Elegir {plan.sectionBadge} y Pagar</span>
                  </button>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-2 border-t border-[#B6C2D2]/15">
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => {
                  setAutoGenSubPayLink(true);
                  setIsSubscriptionPayOpen(true);
                }}
                className="flex-1 sm:flex-initial py-2.5 px-4 rounded-xl bg-[#009EE3]/20 hover:bg-[#009EE3]/30 text-sky-200 border border-[#009EE3]/45 text-xs font-bold cursor-pointer flex items-center justify-center gap-2 transition-colors"
              >
                <CreditCard className="w-4 h-4 text-sky-300" />
                <span>Generar Link de Pago (Mercado Pago / WA)</span>
              </button>
              {isTrialExpiredGate && (
                <button
                  type="button"
                  onClick={() =>
                    handlePauseOwnTenant('Cuenta pausada al finalizar los 30 días de prueba gratis', 'trial_expired')
                  }
                  className="flex-1 sm:flex-initial py-2.5 px-4 rounded-xl bg-[#13264A] hover:bg-rose-950/60 text-rose-200 border border-rose-500/35 text-xs font-bold cursor-pointer flex items-center justify-center gap-2 transition-colors"
                >
                  <Pause className="w-4 h-4 text-rose-400" />
                  <span>No continuar ahora · Pausar Cuenta</span>
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={() => setIsContactChannelsOpen(true)}
                className="py-2 px-4 rounded-xl bg-[#13264A] hover:bg-[#1B3566] text-sky-300 border border-sky-400/25 text-xs font-semibold cursor-pointer transition-colors"
              >
                Canales de Contacto
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="py-2 px-4 rounded-xl text-[#94A3B8] hover:text-white text-xs font-semibold cursor-pointer transition-colors"
              >
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>

        {/* Modal de aceptación obligatoria de Términos y Condiciones al elegir plan en cuenta pausada / fin de prueba */}
        {pendingGatePlanTier && (() => {
          const chosenDef = getPlanDefinitionByTier(pendingGatePlanTier, platformBillingCfg);
          const impact = getPlanTransitionImpactSummary(
            resolveTenantPlanTier(selectedTenant),
            pendingGatePlanTier
          );
          return (
            <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white text-slate-900 border border-slate-200 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
                <div className="px-5 py-4 bg-[#0B1933] text-white flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-sky-300">
                      Confirmación de Plan · Términos y Condiciones (v{TERMS_VERSION})
                    </div>
                    <h3 className="text-base font-bold">
                      {chosenDef.sectionBadge} · {chosenDef.shortName} ($ {chosenDef.monthlyPrice.toLocaleString('es-AR')}/mes)
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPendingGatePlanTier(null)}
                    className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer"
                    aria-label="Cerrar"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-5 space-y-4">
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                          impact.direction === 'downgrade'
                            ? 'bg-amber-200 text-amber-950'
                            : 'bg-emerald-200 text-emerald-950'
                        }`}
                      >
                        {impact.badgeLabel}
                      </span>
                      <span className="text-xs font-bold text-[#0B1933]">{impact.headline}</span>
                    </div>
                    <ul className="space-y-1 text-xs text-slate-700">
                      {impact.bullets.map((b, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <TermsConditionsScrollBox variant="light" maxHeightClass="max-h-52" />

                  <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 bg-white cursor-pointer hover:border-[#0B1933]">
                    <input
                      type="checkbox"
                      checked={gatePlanTermsAccepted}
                      onChange={(e) => setGatePlanTermsAccepted(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300 text-[#0B1933]"
                    />
                    <span className="text-xs font-semibold text-slate-900 leading-snug">
                      He leído y acepto los Términos y Condiciones de Uso y Manejo (v{TERMS_VERSION}) y confirmo operar con{' '}
                      <strong>
                        {chosenDef.sectionBadge} · {chosenDef.shortName}
                      </strong>{' '}
                      (${chosenDef.monthlyPrice.toLocaleString('es-AR')}/mes).
                    </span>
                  </label>

                  <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={() => setPendingGatePlanTier(null)}
                      className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                    >
                      Volver a comparar planes
                    </button>
                    <button
                      type="button"
                      disabled={!gatePlanTermsAccepted}
                      onClick={() => {
                        const chosen = pendingGatePlanTier;
                        handleSelectTenantPlanTier(selectedTenant.id, chosen, {
                          acceptedTermsAt: new Date().toISOString(),
                          termsVersion: TERMS_VERSION,
                        });
                        setPendingGatePlanTier(null);
                        setGatePlanTermsAccepted(false);
                        setAutoGenSubPayLink(false);
                        setIsSubscriptionPayOpen(true);
                      }}
                      className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-45 disabled:cursor-not-allowed text-white text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <CreditCard className="w-4 h-4" />
                      <span>Aceptar Términos e Ir a Pagar</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        <TenantSubscriptionPayModal
          isOpen={isSubscriptionPayOpen}
          onClose={() => {
            setIsSubscriptionPayOpen(false);
            setAutoGenSubPayLink(false);
          }}
          tenant={selectedTenant}
          payerEmail={currentUser.email}
          autoGenerateLinkOnOpen={autoGenSubPayLink}
          initialPlanTier={chosenPlanTierForPayModal || resolveTenantPlanTier(selectedTenant)}
          onSelectPlanTier={(tier, termsMeta) =>
            handleSelectTenantPlanTier(selectedTenant.id, tier, termsMeta)
          }
          onPaymentApproved={(details) => {
            applyApprovedTenantPayment(selectedTenant.id, details);
            showToast(
              details.planType === 'annual'
                ? 'Plan Anual (12 meses) acreditado. Tu cuenta quedó activa.'
                : 'Pago acreditado. Tu cuenta quedó activa en funcionamiento.'
            );
          }}
        />
        <ContactChannelsModal
          isOpen={isContactChannelsOpen}
          onClose={() => setIsContactChannelsOpen(false)}
          tenant={selectedTenant}
          currentUser={currentUser}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F6F9] dark:bg-[#071021] text-slate-800 dark:text-[#E2E8F0] font-sans flex">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-[#0B1933] text-white border border-[#B6C2D2]/30 dark:bg-[#E2E8F0] dark:text-[#091428] px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 text-xs font-semibold">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 dark:text-emerald-600 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Left Navy & Silver Navigation Sidebar */}
      <SidebarNav
        activeTab={activeTab}
        setActiveTab={handleSelectTab}
        config={config}
        boletas={boletas}
        paidBoletas={paidBoletas}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        onOpenCriticalBubble={() => setIsCriticalBubbleOpen(true)}
        onOpenQuickGuide={() => setIsQuickGuideOpen(true)}
        onOpenEditBrand={() => setIsEditBrandModalOpen(true)}
        onOpenContactChannels={() => setIsContactChannelsOpen(true)}
        onOpenSubscriptionPay={
          selectedTenant
            ? () => {
                setChosenPlanTierForPayModal(resolveTenantPlanTier(selectedTenant));
                setIsSubscriptionPayOpen(true);
              }
            : undefined
        }
        onOpenChangePlan={
          selectedTenant
            ? () => setPlanUpgradePrompt({ reasonKey: 'manual_switch' })
            : undefined
        }
        isPaidCurrentMonth={tenantSubscriptionStatus?.isPaidForCurrentMonth}
        currentDateRef={currentDateRef}
        catalogEnabled={tenantFeatureAccess.canAccessWebCatalog}
        webOrdersCount={paidWebOrders.length}
        featureAccess={{
          canAccessWebCatalog: tenantFeatureAccess.canAccessWebCatalog,
          canAccessFullFeatures: tenantFeatureAccess.canAccessFullFeatures,
        }}
        planSectionLabel={tenantFeatureAccess.sectionLabel}
      />

      {/* Right Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Header */}
        <Header
          config={config}
          boletas={boletas}
          paidBoletas={paidBoletas}
          activeTab={activeTab}
          setActiveTab={handleSelectTab}
          onOpenNewBoleta={() => setIsNewBoletaOpen(true)}
          onOpenAlertsCenter={() => setIsAlertsCenterOpen(true)}
          onOpenSettings={() => handleSelectTab('administradores')}
          onOpenCriticalBubble={() => setIsCriticalBubbleOpen(true)}
          onOpenMobileMenu={() => setIsMobileSidebarOpen(true)}
          onOpenQuickGuide={() => setIsQuickGuideOpen(true)}
          onOpenEditBrand={() => setIsEditBrandModalOpen(true)}
          activeAdmin={activeAdmin}
          currentUser={currentUser}
          currentTenant={selectedTenant}
          onLogout={handleLogout}
          onOpenUserProfile={() => setIsUserProfileOpen(true)}
          onOpenSubscriptionPayModal={() => setIsSubscriptionPayOpen(true)}
        />

        {/* SAAS MONTHLY SUBSCRIPTION & 30-DAY TRIAL WARNING BANNERS (NAVY / SILVER / CRIMSON) */}
        {tenantSubscriptionStatus && tenantSubscriptionStatus.status === 'trial_active' && (
          <div className="bg-[#0F2142] text-white px-4 sm:px-6 py-2.5 border-b border-[#B6C2D2]/25">
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3 text-center sm:text-left">
                <div className="p-2 bg-[#162E59] rounded-lg border border-[#B6C2D2]/25 shrink-0">
                  <Calendar className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <p className="font-bold text-xs sm:text-sm tracking-tight flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                    <span>Cuenta en Prueba Gratis de 30 Días</span>
                    <span className="px-2 py-0.5 rounded bg-emerald-950/70 text-emerald-300 border border-emerald-500/35 font-mono text-[10px] tabular-nums">
                      Te quedan {tenantSubscriptionStatus.trialDaysRemaining} día(s)
                    </span>
                  </p>
                  <p className="text-[#CBD5E1] text-[11px] mt-0.5 tabular-nums">
                    Tu período de gracia finaliza el <strong className="font-mono text-white">{tenantSubscriptionStatus.trialEndsAt}</strong>. Luego podrás abonar <strong className="font-mono text-white">$ {tenantSubscriptionStatus.monthlyFee.toLocaleString('es-AR')}/mes</strong> para continuar o pausar tu cuenta.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 flex-wrap justify-center">
                <button
                  type="button"
                  onClick={() => {
                    setAutoGenSubPayLink(false);
                    setIsSubscriptionPayOpen(true);
                  }}
                  className="py-2 px-3.5 bg-[#E2E8F0] hover:bg-white text-[#091428] font-bold rounded-lg text-xs cursor-pointer flex items-center gap-1.5 transition-colors"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Generar Pago / Continuar</span>
                </button>

                {!confirmTrialPauseInline ? (
                  <button
                    type="button"
                    onClick={() => setConfirmTrialPauseInline(true)}
                    className="py-2 px-3 bg-[#13264A] hover:bg-[#1B3566] text-[#CBD5E1] hover:text-white border border-[#B6C2D2]/25 font-semibold rounded-lg text-xs cursor-pointer flex items-center gap-1.5 transition-colors"
                  >
                    <Pause className="w-3.5 h-3.5" />
                    <span>Pausar Cuenta</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5 bg-[#071021] px-2 py-1 rounded-lg border border-rose-500/40">
                    <button
                      type="button"
                      onClick={() => handlePauseOwnTenant('Cuenta pausada voluntariamente durante prueba gratis', 'tenant')}
                      className="px-2.5 py-1 rounded bg-rose-700 hover:bg-rose-600 text-white font-bold text-[11px] cursor-pointer"
                    >
                      Confirmar Pausa
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmTrialPauseInline(false)}
                      className="px-2 py-1 rounded text-[#94A3B8] hover:text-white text-[11px] cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {tenantSubscriptionStatus && tenantSubscriptionStatus.status === 'pending_window' && (
          <div className="bg-[#13264A] text-white px-4 sm:px-6 py-2.5 border-b border-[#B6C2D2]/25">
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3 text-center sm:text-left">
                <div className="p-2 bg-[#1E3A6D] rounded-lg border border-[#B6C2D2]/25 shrink-0">
                  <Calendar className="w-4 h-4 text-[#E2E8F0]" />
                </div>
                <div>
                  <p className="font-bold text-xs sm:text-sm tracking-tight">
                    Tu abono mensual de {tenantSubscriptionStatus.currentMonthName} vence el día 5
                  </p>
                  <p className="text-[#CBD5E1] text-[11px] mt-0.5 tabular-nums">
                    Importe del servicio: <strong className="font-mono text-white">$ {tenantSubscriptionStatus.monthlyFee.toLocaleString('es-AR')}</strong> · Podés abonar vía Mercado Pago o transferencia al Alias.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsSubscriptionPayOpen(true)}
                className="py-2 px-4 bg-[#E2E8F0] hover:bg-white text-[#091428] font-bold rounded-lg text-xs shrink-0 cursor-pointer flex items-center gap-1.5 transition-colors"
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>Realizar Pago</span>
              </button>
            </div>
          </div>
        )}

        {tenantSubscriptionStatus && tenantSubscriptionStatus.isOverdue && !tenantSubscriptionStatus.isExtended && (
          <div className="bg-[#7F1D1D] text-white px-4 sm:px-6 py-2.5 border-b border-[#FCA5A5]/30">
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3 text-center sm:text-left">
                <div className="p-2 bg-black/25 rounded-lg shrink-0">
                  <AlertTriangle className="w-4 h-4 text-amber-300" />
                </div>
                <div>
                  <p className="font-bold text-xs sm:text-sm tracking-tight">
                    ABONO VENCIDO · Cuenta próxima a pausarse
                  </p>
                  <p className="text-rose-100 text-[11px] mt-0.5 tabular-nums">
                    El abono de {tenantSubscriptionStatus.currentMonthName} ($ {tenantSubscriptionStatus.monthlyFee.toLocaleString('es-AR')}) venció el día 5. Aboná con Mercado Pago o Alias para mantener tu servicio activo.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 flex-wrap justify-center">
                <button
                  type="button"
                  onClick={() => setIsSubscriptionPayOpen(true)}
                  className="py-2 px-4 bg-white text-[#7F1D1D] hover:bg-rose-50 font-bold rounded-lg text-xs cursor-pointer flex items-center gap-1.5 transition-colors"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Pagar con Mercado Pago</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const text = `Hola! Me comunico desde ${selectedTenant?.name} (${selectedTenant?.tenantCode}). Deseo consultar sobre el pago del abono mensual para mantener mi cuenta activa.`;
                    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                  }}
                  className="py-2 px-3 bg-black/25 hover:bg-black/40 text-white border border-white/25 font-semibold rounded-lg text-xs cursor-pointer transition-colors"
                >
                  Contactar
                </button>
              </div>
            </div>
          </div>
        )}

        {tenantSubscriptionStatus && tenantSubscriptionStatus.isExtended && (
          <div className="bg-[#0F2142] text-[#E2E8F0] px-4 sm:px-6 py-2 border-b border-[#B6C2D2]/20 text-xs">
            <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#CBD5E1] shrink-0" />
                <span>
                  <strong>Prórroga Activa:</strong> Cuenta habilitada por administración hasta el{' '}
                  <strong className="underline text-white tabular-nums">{tenantSubscriptionStatus.extensionExpiresAt}</strong>.
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsSubscriptionPayOpen(true)}
                  className="px-3 py-1 rounded-md bg-[#E2E8F0] hover:bg-white text-[#091428] font-bold text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <CreditCard className="w-3 h-3" />
                  <span>Pagar Abono</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* COMUNICADOS Y NOVEDADES GLOBALES EMITIDOS DESDE SUPERADMINISTRACIÓN */}
        {(() => {
          const todayIso = new Date().toISOString().split('T')[0];
          const visibleAnnouncements = platformAnnouncements.filter(
            (ann) =>
              ann.active &&
              (!ann.expiresAt || ann.expiresAt >= todayIso) &&
              !dismissedAnnouncementIds.includes(ann.id)
          );
          if (visibleAnnouncements.length === 0) return null;
          return (
            <div className="bg-[#F8FAFC] dark:bg-[#091428] border-b border-[#CBD5E1] dark:border-[#B6C2D2]/20 px-4 sm:px-6 py-2.5 space-y-2">
              <div className="max-w-7xl mx-auto space-y-2">
                {visibleAnnouncements.map((ann) => {
                  const tagMeta =
                    ann.category === 'promo'
                      ? { label: 'Promoción', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-700/60' }
                      : ann.category === 'aviso_importante'
                      ? { label: 'Aviso Importante', cls: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-200 dark:border-rose-700/60' }
                      : ann.category === 'mantenimiento'
                      ? { label: 'Mantenimiento', cls: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-700/60' }
                      : { label: 'Novedad', cls: 'bg-[#E9EEF5] text-[#0B1933] border-[#CBD5E1] dark:bg-[#162E59] dark:text-[#E2E8F0] dark:border-[#B6C2D2]/30' };

                  return (
                    <div
                      key={ann.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-white dark:bg-[#0B1933] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 rounded-xl px-3.5 py-2.5 text-xs shadow-2xs"
                    >
                      <div className="flex items-start sm:items-center gap-2.5 min-w-0">
                        <div className="p-1.5 rounded-lg bg-[#0B1933] dark:bg-[#162E59] text-white shrink-0">
                          <Megaphone className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${tagMeta.cls}`}>
                              {tagMeta.label}
                            </span>
                            <strong className="text-[#0B1933] dark:text-white text-xs sm:text-sm">
                              {ann.title}
                            </strong>
                          </div>
                          <p className="text-slate-600 dark:text-[#CBD5E1] text-[11px] sm:text-xs mt-0.5">
                            {ann.message}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 justify-end">
                        {ann.ctaType === 'annual_plan' && selectedTenant && (
                          <button
                            type="button"
                            onClick={() => setIsSubscriptionPayOpen(true)}
                            className="px-3 py-1.5 rounded-lg bg-[#0B1933] hover:bg-[#162E59] dark:bg-[#E2E8F0] dark:hover:bg-white text-white dark:text-[#091428] font-bold text-[11px] cursor-pointer whitespace-nowrap"
                          >
                            {ann.ctaLabel || 'Ver Plan Anual'}
                          </button>
                        )}
                        {ann.ctaType === 'contact_support' && (
                          <button
                            type="button"
                            onClick={() => setIsContactChannelsOpen(true)}
                            className="px-3 py-1.5 rounded-lg bg-[#0B1933] hover:bg-[#162E59] dark:bg-[#E2E8F0] dark:hover:bg-white text-white dark:text-[#091428] font-bold text-[11px] cursor-pointer whitespace-nowrap"
                          >
                            {ann.ctaLabel || 'Canales de Contacto'}
                          </button>
                        )}
                        {ann.ctaType === 'external_url' && ann.ctaUrl && (
                          <a
                            href={ann.ctaUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 rounded-lg bg-[#0B1933] hover:bg-[#162E59] dark:bg-[#E2E8F0] dark:hover:bg-white text-white dark:text-[#091428] font-bold text-[11px] inline-flex items-center gap-1 whitespace-nowrap"
                          >
                            <span>{ann.ctaLabel || 'Ver más'}</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDismissAnnouncement(ann.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#13264A] cursor-pointer"
                          title="Ocultar comunicado"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Main Content Area */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* TAB 1: PENDING BOLETAS */}
          {activeTab === 'boletas' && (
            <div className="space-y-5">
              {/* Executive KPI Summary Dashboard */}
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
                {/* Card 1: Total Fiado en la Calle */}
                <div className="bg-white dark:bg-[#0B1933] border border-[#CBD5E1] dark:border-[#B6C2D2]/20 rounded-xl p-4 shadow-2xs flex flex-col justify-between">
                  <div className="flex items-center justify-between text-slate-500 dark:text-[#94A3B8] text-xs font-semibold">
                    <span>Total Fiado en Calle</span>
                    <div className="p-1.5 rounded-lg bg-[#E9EEF5] dark:bg-[#13264A] text-[#0B1933] dark:text-[#E2E8F0]">
                      <DollarSign className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-2">
                    <span className="text-xl sm:text-2xl font-black font-mono tabular-nums text-[#0B1933] dark:text-white tracking-tight">
                      {formatCurrency(totalPendingDebt, config.currencySymbol)}
                    </span>
                    <span className="block text-[11px] text-slate-500 dark:text-[#8D9CB0] font-medium mt-0.5 tabular-nums">
                      {pendingBoletas.length} boletas activas
                    </span>
                  </div>
                </div>

                {/* Card 2: FIADO VENCIDO (+5D POST-VENCIMIENTO) -> ABRE LA BURBUJA */}
                <button
                  type="button"
                  onClick={() => setIsCriticalBubbleOpen(true)}
                  className={`text-left border rounded-xl p-4 shadow-2xs flex flex-col justify-between cursor-pointer transition-colors ${
                    criticalGraceOverdueDebt > 0
                      ? 'bg-rose-50/90 dark:bg-rose-950/35 border-[#B91C1C] hover:bg-rose-100/80 dark:hover:bg-rose-950/50'
                      : 'bg-white dark:bg-[#0B1933] border-[#CBD5E1] dark:border-[#B6C2D2]/20 hover:border-[#94A3B8]'
                  }`}
                  title="Abrir la burbuja de fiado vencido crítico (+5 días posteriores al vencimiento)"
                >
                  <div className="flex items-center justify-between text-xs font-semibold w-full">
                    <span className={criticalGraceOverdueDebt > 0 ? 'text-[#991B1B] dark:text-rose-300 font-bold' : 'text-slate-500 dark:text-[#94A3B8]'}>
                      Fiado Vencido (+{graceThreshold}d)
                    </span>
                    <div
                      className={`p-1.5 rounded-lg ${
                        criticalGraceOverdueDebt > 0
                          ? 'bg-[#991B1B] text-white'
                          : 'bg-[#E9EEF5] dark:bg-[#13264A] text-slate-400'
                      }`}
                    >
                      <Flame className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-2 w-full">
                    <span
                      className={`text-xl sm:text-2xl font-black font-mono tabular-nums tracking-tight ${
                        criticalGraceOverdueDebt > 0
                          ? 'text-[#991B1B] dark:text-rose-400'
                          : 'text-[#0B1933] dark:text-white'
                      }`}
                    >
                      {formatCurrency(criticalGraceOverdueDebt, config.currencySymbol)}
                    </span>
                    <div className="flex items-center justify-between mt-0.5">
                      <span
                        className={`block text-[11px] font-semibold tabular-nums ${
                          criticalGraceOverdueDebt > 0 ? 'text-[#991B1B] dark:text-rose-300' : 'text-slate-500 dark:text-[#8D9CB0]'
                        }`}
                      >
                        {criticalOverdueBoletas.length} boleta(s) vencidas
                      </span>
                      <span className="text-[11px] font-bold text-[#991B1B] dark:text-rose-300 underline">
                        Ver detalle →
                      </span>
                    </div>
                  </div>
                </button>

                {/* Card 3: Total Cobrado / Recuperado */}
                <button
                  type="button"
                  onClick={() => setActiveTab('historial')}
                  className="text-left bg-white dark:bg-[#0B1933] border border-[#CBD5E1] dark:border-[#B6C2D2]/20 rounded-xl p-4 shadow-2xs flex flex-col justify-between cursor-pointer hover:border-emerald-500/60 transition-colors"
                >
                  <div className="flex items-center justify-between text-slate-500 dark:text-[#94A3B8] text-xs font-semibold w-full">
                    <span>Cobrado / Recuperado</span>
                    <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-2">
                    <span className="text-xl sm:text-2xl font-black font-mono tabular-nums text-emerald-700 dark:text-emerald-400 tracking-tight">
                      {formatCurrency(totalCollectedHistorical, config.currencySymbol)}
                    </span>
                    <span className="block text-[11px] text-slate-500 dark:text-[#8D9CB0] font-medium mt-0.5 tabular-nums">
                      {paidBoletas.length} cobros archivados
                    </span>
                  </div>
                </button>

                {/* Card 4: Dinero generado por Ventas Web (clic -> Historial Ventas Web) */}
                {selectedTenant?.catalogEnabled !== false && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('ventas_web')}
                    className="text-left bg-white dark:bg-[#0B1933] border border-[#CBD5E1] dark:border-[#B6C2D2]/20 rounded-xl p-4 shadow-2xs flex flex-col justify-between cursor-pointer hover:border-[#0B1933] dark:hover:border-sky-400/60 transition-colors"
                    title="Ver datos históricos de ventas web por día, últimos 7 días o último mes"
                  >
                    <div className="flex items-center justify-between text-slate-500 dark:text-[#94A3B8] text-xs font-semibold w-full">
                      <span>Ventas Web (Carrito)</span>
                      <div className="p-1.5 rounded-lg bg-[#E9EEF5] dark:bg-[#13264A] text-[#0B1933] dark:text-sky-300">
                        <ShoppingBag className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="mt-2 w-full">
                      <span className="text-xl sm:text-2xl font-black font-mono tabular-nums text-[#0B1933] dark:text-sky-300 tracking-tight">
                        {formatCurrency(totalWebSalesRevenue, config.currencySymbol)}
                      </span>
                      <div className="flex items-center justify-between gap-1 mt-0.5">
                        <span className="text-[11px] text-slate-500 dark:text-[#8D9CB0] font-medium tabular-nums truncate">
                          {paidWebOrders.length} retirado(s)
                          {pendingWebOrdersCount > 0 ? ` · ${pendingWebOrdersCount} pend.` : ''} · Hoy:{' '}
                          {formatCurrency(todayWebSalesRevenue, config.currencySymbol)}
                        </span>
                        <span className="text-[11px] font-bold text-[#0B1933] dark:text-sky-300 underline shrink-0">
                          Historial →
                        </span>
                      </div>
                    </div>
                  </button>
                )}

                {/* Card 5: Regla de 30 Días */}
                <button
                  type="button"
                  onClick={() => setActiveTab('administradores')}
                  className="text-left bg-white dark:bg-[#0B1933] border border-[#CBD5E1] dark:border-[#B6C2D2]/20 rounded-xl p-4 shadow-2xs flex flex-col justify-between cursor-pointer hover:border-[#94A3B8] transition-colors"
                >
                  <div className="flex items-center justify-between text-slate-500 dark:text-[#94A3B8] text-xs font-semibold w-full">
                    <span>Depuración 30 Días</span>
                    <div className="p-1.5 rounded-lg bg-[#E9EEF5] dark:bg-[#13264A] text-[#0B1933] dark:text-[#E2E8F0]">
                      <Database className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-2">
                    <div className="flex items-baseline gap-1.5 tabular-nums">
                      <span className="text-xl sm:text-2xl font-black font-mono text-[#0B1933] dark:text-white tracking-tight">
                        {config.totalPurgedBoletasCount || 0}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-[#8D9CB0]">depuradas</span>
                    </div>
                    <span className="block text-[11px] text-slate-600 dark:text-[#CBD5E1] font-medium mt-0.5">
                      Solo pagadas (+30d) · Impagas quedan
                    </span>
                  </div>
                </button>
              </div>

              {/* Incoming Pending Web Orders Strip: open directly to see product photos & codes */}
              {selectedTenant?.catalogEnabled !== false && pendingWebOrders.length > 0 && (
                <div className="bg-white dark:bg-[#0B1933] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 rounded-xl p-3.5 sm:p-4 shadow-2xs space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <ShoppingBag className="w-4 h-4 text-[#0B1933] dark:text-sky-300 shrink-0" />
                      <h3 className="text-xs sm:text-sm font-bold text-[#0B1933] dark:text-white">
                        Pedidos Web Entrantes por Entregar ({pendingWebOrders.length})
                      </h3>
                      <span className="text-[11px] text-slate-500 dark:text-[#94A3B8] hidden md:inline">
                        · Abrí la venta para ver fotos y códigos de los artículos a entregar
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('ventas_web')}
                      className="text-xs font-semibold text-[#0B1933] dark:text-sky-300 hover:underline cursor-pointer self-start sm:self-auto whitespace-nowrap"
                    >
                      Ver historial completo →
                    </button>
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-[#B6C2D2]/15 border border-slate-200 dark:border-[#B6C2D2]/20 rounded-lg overflow-hidden">
                    {pendingWebOrders.slice(0, 4).map((ord) => {
                      const units = ord.items.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
                      const firstItem = ord.items[0];
                      const matchedFirst = firstItem
                        ? catalogProducts.find(
                            (p) =>
                              p.id === firstItem.productId ||
                              p.name.trim().toLowerCase() === firstItem.productName.trim().toLowerCase()
                          )
                        : undefined;
                      const firstThumb = matchedFirst?.imageUrl || firstItem?.imageUrl;
                      const firstCode = (firstItem?.sku || matchedFirst?.sku || '').trim();
                      const isDelivery = ord.deliveryMethod === 'envio';

                      return (
                        <div
                          key={ord.id}
                          className="px-3 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-slate-50/50 dark:bg-[#071021]/60 hover:bg-slate-50 dark:hover:bg-[#13264A]/40 transition-colors"
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedWebOrderDetail(ord)}
                            className="flex items-center gap-3 min-w-0 text-left cursor-pointer flex-1"
                          >
                            {firstThumb ? (
                              <img
                                src={firstThumb}
                                alt={firstItem?.productName || ord.orderNumber}
                                referrerPolicy="no-referrer"
                                className="w-10 h-10 rounded-lg object-cover border border-slate-200 dark:border-[#B6C2D2]/20 shrink-0"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-lg border border-slate-200 dark:border-[#B6C2D2]/20 bg-white dark:bg-[#0B1933] flex items-center justify-center text-slate-400 shrink-0">
                                <ShoppingBag className="w-4 h-4" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap text-xs">
                                <span className="font-mono font-bold text-[#0B1933] dark:text-white">
                                  #{ord.orderNumber}
                                </span>
                                <span className="font-bold text-[#0B1933] dark:text-white truncate">
                                  {ord.customerName}
                                </span>
                                <span className="text-slate-400" aria-hidden="true">·</span>
                                <span className="text-slate-600 dark:text-[#94A3B8]">
                                  {isDelivery ? 'Envío' : 'Retiro'}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-[#94A3B8] truncate tabular-nums">
                                {units} u. · {firstItem?.productName || 'Pedido'}
                                {firstCode ? ` [Cód: ${firstCode}]` : ''}
                                {ord.items.length > 1 ? ` (+${ord.items.length - 1} más)` : ''}
                              </div>
                            </div>
                          </button>

                          <div className="flex items-center gap-2 shrink-0 justify-end">
                            <span className="font-mono tabular-nums text-xs font-black text-[#0B1933] dark:text-white">
                              {formatCurrency(ord.totalAmount, ord.currencySymbol || config.currencySymbol)}
                            </span>
                            <button
                              type="button"
                              onClick={() => setSelectedWebOrderDetail(ord)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-white dark:bg-[#0B1933] text-[#0B1933] dark:text-white hover:bg-slate-100 dark:hover:bg-[#13264A] cursor-pointer whitespace-nowrap"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Abrir Venta</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMarkWebOrderRetirado(ord)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer whitespace-nowrap"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{isDelivery ? 'Entregado' : 'Retirado'}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Filter, View Toggle, CSV Export & Optional Simulation Controls */}
              <div className="bg-white dark:bg-[#0B1933] p-4 rounded-xl border border-[#CBD5E1] dark:border-[#B6C2D2]/20 shadow-2xs space-y-3">
                <div className="flex flex-col lg:flex-row gap-2.5">
                  {/* Search */}
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#8D9CB0]" />
                    <input
                      type="text"
                      placeholder="Buscar por cliente, boleta #, vendedor o notas..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full text-xs pl-9 pr-3 py-2.5 rounded-lg border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-[#F8FAFC] dark:bg-[#071021] text-[#0B1933] dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#162E59]"
                    />
                  </div>

                  {/* Salesperson, Sort, View Toggle & Export */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      value={selectedSalespersonFilter}
                      onChange={(e) => setSelectedSalespersonFilter(e.target.value)}
                      className="text-xs px-3 py-2.5 rounded-lg border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-white dark:bg-[#091428] text-[#0B1933] dark:text-[#E2E8F0] font-medium"
                    >
                      <option value="all">Todos los Vendedores</option>
                      {salespeople.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.zone})
                        </option>
                      ))}
                    </select>

                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as any)}
                      className="text-xs px-3 py-2.5 rounded-lg border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-white dark:bg-[#091428] text-[#0B1933] dark:text-[#E2E8F0] font-medium"
                    >
                      <option value="days_desc">Más antiguas primero</option>
                      <option value="due_asc">Vencimiento próximo</option>
                      <option value="amount_desc">Mayor Monto ($)</option>
                    </select>

                    {/* Segmented Switch: Tarjetas vs Lista Compacta */}
                    <div className="inline-flex rounded-lg border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-[#F4F6F9] dark:bg-[#071021] p-0.5">
                      <button
                        type="button"
                        onClick={() => setViewMode('cards')}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                          viewMode === 'cards'
                            ? 'bg-[#0B1933] text-white dark:bg-[#E2E8F0] dark:text-[#091428]'
                            : 'text-slate-600 dark:text-[#94A3B8] hover:text-[#0B1933] dark:hover:text-white'
                        }`}
                        title="Ver en formato tarjetas"
                      >
                        <LayoutGrid className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Tarjetas</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode('table')}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                          viewMode === 'table'
                            ? 'bg-[#0B1933] text-white dark:bg-[#E2E8F0] dark:text-[#091428]'
                            : 'text-slate-600 dark:text-[#94A3B8] hover:text-[#0B1933] dark:hover:text-white'
                        }`}
                        title="Ver en lista compacta"
                      >
                        <List className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Lista</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleExportPendingCSV}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-[#E9EEF5] hover:bg-[#DCE4F0] dark:bg-[#13264A] dark:hover:bg-[#1B3566] text-[#0B1933] dark:text-[#E2E8F0] transition-colors cursor-pointer"
                      title="Descargar boletas filtradas en CSV para Excel"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span className="hidden xl:inline">CSV</span>
                    </button>
                  </div>
                </div>

                {/* Status Filter Bar */}
                <div className="flex gap-2 overflow-x-auto pt-1 no-scrollbar tabular-nums">
                  <button
                    type="button"
                    onClick={() => setStatusFilter('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                      statusFilter === 'all'
                        ? 'bg-[#0B1933] text-white dark:bg-[#E2E8F0] dark:text-[#091428]'
                        : 'bg-[#F4F6F9] dark:bg-[#091428] text-slate-600 dark:text-[#94A3B8] hover:bg-[#E9EEF5] dark:hover:bg-[#13264A]'
                    }`}
                  >
                    Todas ({pendingBoletas.length})
                  </button>

                  <button
                    type="button"
                    onClick={() => setStatusFilter('urgent_10d')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap flex items-center gap-1.5 border transition-colors cursor-pointer ${
                      statusFilter === 'urgent_10d'
                        ? 'bg-[#991B1B] text-white border-[#991B1B]'
                        : 'bg-rose-50 dark:bg-rose-950/40 text-[#991B1B] dark:text-rose-300 border-rose-300 dark:border-rose-700/60 hover:bg-rose-100'
                    }`}
                  >
                    <Flame className="w-3.5 h-3.5" />
                    <span>Prioridad +10d ({counts.urgent10d})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStatusFilter('overdue')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 border transition-colors cursor-pointer ${
                      statusFilter === 'overdue'
                        ? 'bg-rose-700 text-white border-rose-700'
                        : 'bg-rose-50/60 dark:bg-rose-950/25 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/50 hover:bg-rose-100/70'
                    }`}
                  >
                    <span>Vencidas / Cobrar Hoy ({counts.overdue})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStatusFilter('admin_alert')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 border transition-colors cursor-pointer ${
                      statusFilter === 'admin_alert'
                        ? 'bg-amber-600 text-white border-amber-600'
                        : 'bg-amber-50 dark:bg-amber-950/25 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/50 hover:bg-amber-100/70'
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Alerta Dueños ({config.adminAlertDays}+d) ({counts.adminAlert})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStatusFilter('vendedor_3dias')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 border transition-colors cursor-pointer ${
                      statusFilter === 'vendedor_3dias'
                        ? 'bg-[#162E59] text-white border-[#162E59]'
                        : 'bg-[#E9EEF5] dark:bg-[#0F2142] text-[#0B1933] dark:text-[#CBD5E1] border-[#CBD5E1] dark:border-[#B6C2D2]/25 hover:bg-[#DCE4F0]'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Aviso Vendedor ({config.vendedorReminderDays}d) ({counts.vendedorReminder})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStatusFilter('normal')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap border transition-colors cursor-pointer ${
                      statusFilter === 'normal'
                        ? 'bg-emerald-700 text-white border-emerald-700'
                        : 'bg-emerald-50 dark:bg-emerald-950/25 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/50 hover:bg-emerald-100/70'
                    }`}
                  >
                    <span>Al día ({counts.normal})</span>
                  </button>
                </div>
              </div>

              {/* Clean Priority Notice for 10+ days without bounce/pulse */}
              {counts.urgent10d > 0 && statusFilter === 'all' && (
                <div className="bg-[#991B1B] rounded-xl p-3.5 sm:p-4 text-white border border-[#FCA5A5]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start sm:items-center gap-3">
                    <div className="p-2 bg-black/25 rounded-lg shrink-0">
                      <Flame className="w-5 h-5 text-amber-300" />
                    </div>
                    <div>
                      <h4 className="text-xs sm:text-sm font-bold tracking-wide tabular-nums">
                        Prioridad de Cobro: {counts.urgent10d} boleta(s) superaron los 10 días sin cancelarse
                      </h4>
                      <p className="text-[11px] sm:text-xs text-rose-100 mt-0.5">
                        Se ordenan automáticamente arriba para facilitar el seguimiento de cobro o registrar una prórroga.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('urgent_10d')}
                    className="px-3.5 py-1.5 bg-white text-[#991B1B] hover:bg-rose-50 text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Ver solo las +10 días
                  </button>
                </div>
              )}

              {/* Radar de Clientes Fríos Banner — Exclusivo Rubro Indumentaria */}
              {config.businessRubro === 'indumentaria' && coldClientsIndumentaria.length > 0 && (
                <div className="bg-[#0B1933] text-white rounded-xl p-3.5 sm:p-4 border border-[#B6C2D2]/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start sm:items-center gap-3">
                    <div className="p-2 bg-[#162E59] rounded-lg border border-[#B6C2D2]/25 shrink-0">
                      <Snowflake className="w-5 h-5 text-sky-300" />
                    </div>
                    <div>
                      <h4 className="text-xs sm:text-sm font-bold tracking-wide tabular-nums">
                        Radar de Clientes Fríos (Indumentaria): {coldClientsIndumentaria.length} cliente(s) sin nuevas compras hace +30 días
                      </h4>
                      <p className="text-[11px] sm:text-xs text-[#CBD5E1] mt-0.5 tabular-nums">
                        {coldClientsIndumentaria.filter((c) => c.isClearToOffer).length} al día sin saldo pendiente listos para reactivar con WhatsApp según su prenda habitual.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenColdClientsRadar}
                    className="px-3.5 py-1.5 bg-[#E2E8F0] hover:bg-white text-[#091428] text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Abrir Radar de Reactivación →
                  </button>
                </div>
              )}

              {/* Boletas Grid or Compact Ledger Table */}
              {sortedBoletas.length === 0 ? (
                <div className="text-center py-16 bg-white dark:bg-[#0B1933] rounded-xl border border-[#CBD5E1] dark:border-[#B6C2D2]/20 shadow-2xs space-y-3">
                  <FileText className="w-12 h-12 mx-auto text-slate-300 dark:text-[#64748B]" />
                  <h3 className="font-bold text-[#0B1933] dark:text-white">
                    No hay boletas fiadas que coincidan
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-[#94A3B8] max-w-sm mx-auto">
                    No encontramos boletas pendientes con los filtros aplicados. Podés cargar una nueva boleta firmada para comenzar el seguimiento.
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsNewBoletaOpen(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-[#0B1933] hover:bg-[#162E59] dark:bg-[#E2E8F0] dark:text-[#091428] text-white text-xs font-bold rounded-lg cursor-pointer"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>Cargar Nueva Boleta</span>
                  </button>
                </div>
              ) : viewMode === 'cards' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                  {sortedBoletas.map((b) => (
                    <BoletaCard
                      key={b.id}
                      boleta={b}
                      config={config}
                      clients={clients}
                      salespeople={salespeople}
                      admins={admins}
                      onMarkAsPaid={(boleta) => setSelectedBoletaForPayment(boleta)}
                      onOpenPartialPaymentModal={(boleta) => setSelectedBoletaForPartial(boleta)}
                      onOpenExtendModal={(boleta) => {
                        setSelectedBoletaForExtend(boleta);
                        setIsExtendModalOpen(true);
                      }}
                      onOpenVisitModal={(boleta) => setSelectedBoletaForVisit(boleta)}
                      onOpenCreditNoteModal={
                        config.businessRubro === 'indumentaria'
                          ? (boleta) => setSelectedBoletaForCreditNote(boleta)
                          : undefined
                      }
                      onOpenReceipt={(receipt) => setActiveReceiptData(receipt)}
                      onQuickSendStatement={(boleta) => openQuickStatementForBoleta(boleta)}
                      onDelete={handleDeleteBoleta}
                      onRecordReminder={handleRecordReminder}
                    />
                  ))}
                </div>
              ) : (
                /* COMPACT NAVY & SILVER LEDGER TABLE VIEW */
                <div className="bg-white dark:bg-[#0B1933] rounded-xl border border-[#CBD5E1] dark:border-[#B6C2D2]/20 overflow-hidden shadow-2xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#0B1933] text-[#E2E8F0] font-semibold border-b border-[#B6C2D2]/25">
                        <tr>
                          <th className="px-4 py-3">Boleta</th>
                          <th className="px-4 py-3">Cliente</th>
                          <th className="px-4 py-3 text-right">Saldo</th>
                          <th className="px-4 py-3">Venta / Vence</th>
                          <th className="px-4 py-3">Vendedor</th>
                          <th className="px-4 py-3">Estado</th>
                          <th className="px-4 py-3 text-right">Acciones Rápidas</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-[#B6C2D2]/15">
                        {sortedBoletas.map((b) => {
                          const st = calculateAlertStatus(b, config, currentDateRef);
                          const bal = getBoletaBalance(b);
                          const seller = salespeople.find((s) => s.id === b.salespersonId);
                          const waText = generateUserSignedReminder(
                            b,
                            seller,
                            activeAdmin?.name || 'Administración',
                            config,
                            config.customCobranzaTemplate
                          );
                          const waUrl = createWhatsAppUrl(seller?.phone || b.salespersonPhone || '', waText);

                          return (
                            <tr
                              key={b.id}
                              className={`hover:bg-[#F8FAFC] dark:hover:bg-[#10203E] transition-colors ${
                                st.isUrgentAlertMode ? 'bg-rose-50/40 dark:bg-rose-950/15' : ''
                              }`}
                            >
                              <td className="px-4 py-3 font-mono tabular-nums font-bold text-[#0B1933] dark:text-white whitespace-nowrap">
                                #{b.boletaNumber}
                                {b.extensionDays ? (
                                  <span className="block text-[10px] font-semibold text-[#162E59] dark:text-[#CBD5E1]">
                                    +{b.extensionDays}d prórroga
                                  </span>
                                ) : null}
                              </td>
                              <td className="px-4 py-3">
                                <div className="font-bold text-[#0B1933] dark:text-white">{b.clientName}</div>
                                {b.clientAddress && (
                                  <div className="text-[11px] text-slate-500 dark:text-[#94A3B8] truncate max-w-[200px]">
                                    {b.clientAddress}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right font-mono tabular-nums whitespace-nowrap">
                                <span className="font-bold text-[#0B1933] dark:text-white text-sm">
                                  {formatCurrency(bal.balanceDue, config.currencySymbol)}
                                </span>
                                {bal.hasCreditNotes && (
                                  <span className="block text-[10px] text-sky-700 dark:text-sky-300 font-semibold">
                                    NC -{formatCurrency(bal.totalCreditNotes, config.currencySymbol)}
                                  </span>
                                )}
                                {bal.hasPartialPayments && (
                                  <span className="block text-[10px] text-emerald-700 dark:text-emerald-400">
                                    Entregado {bal.percentagePaid}%
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 tabular-nums whitespace-nowrap">
                                <div className="text-slate-700 dark:text-[#CBD5E1]">{formatDateEs(b.saleDate)}</div>
                                <div
                                  className={`text-[11px] font-semibold ${
                                    st.isOverdueOrToday ? 'text-[#991B1B] dark:text-rose-400' : 'text-slate-500 dark:text-[#94A3B8]'
                                  }`}
                                >
                                  Vence: {formatDateEs(b.dueDate)}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-slate-700 dark:text-[#CBD5E1] whitespace-nowrap">
                                {b.salespersonName}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded border tabular-nums ${st.badgeColor}`}>
                                  {st.categoryLabel}
                                </span>
                              </td>
                               <td className="px-4 py-3 text-right whitespace-nowrap">
                                 <div className="inline-flex items-center gap-1.5">
                                   <button
                                     type="button"
                                     onClick={() => openQuickStatementForBoleta(b)}
                                     className="px-2 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                                     title="Enviar Estado de Cuenta instantáneo por WhatsApp (Escrito, PNG o PDF)"
                                   >
                                     <FileText className="w-3 h-3" />
                                     <span>Estado Cta.</span>
                                   </button>
                                   <a
                                     href={waUrl}
                                     target="_blank"
                                     rel="noopener noreferrer"
                                     onClick={() => handleRecordReminder(b.id, 'manual', 'whatsapp', seller?.name || b.salespersonName)}
                                     className="p-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white transition-colors"
                                     title="Enviar aviso por WhatsApp al vendedor"
                                   >
                                     <MessageCircle className="w-3.5 h-3.5" />
                                   </a>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedBoletaForExtend(b);
                                      setIsExtendModalOpen(true);
                                    }}
                                    className="px-2 py-1 rounded-lg bg-[#E9EEF5] hover:bg-[#DCE4F0] dark:bg-[#13264A] text-[#0B1933] dark:text-[#E2E8F0] border border-[#94A3B8]/50 font-semibold text-[11px] cursor-pointer"
                                    title="Prorrogar vencimiento"
                                  >
                                    Prorrogar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setSelectedBoletaForPartial(b)}
                                    className="p-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white cursor-pointer"
                                    title="Registrar pago parcial"
                                  >
                                    <Receipt className="w-3.5 h-3.5" />
                                  </button>
                                  {config.businessRubro === 'indumentaria' && (
                                    <button
                                      type="button"
                                      onClick={() => setSelectedBoletaForCreditNote(b)}
                                      className="p-1.5 rounded-lg bg-[#E9EEF5] hover:bg-[#DCE4F0] dark:bg-[#13264A] text-[#0B1933] dark:text-[#E2E8F0] border border-[#94A3B8]/50 cursor-pointer"
                                      title="Registrar devolución o Nota de Crédito (Indumentaria)"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setSelectedBoletaForPayment(b)}
                                    className="px-2.5 py-1 rounded-lg bg-[#0B1933] hover:bg-[#162E59] dark:bg-[#E2E8F0] dark:text-[#091428] text-white font-bold text-[11px] cursor-pointer"
                                    title="Marcar boleta cobrada"
                                  >
                                    Cobrada
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

        {/* TAB: AGENDA RÁPIDA DE COBROS (HOY, 3 DÍAS, 7 DÍAS) */}
        {activeTab === 'agenda' && (
          <Suspense fallback={<LazyViewFallback />}>
            <QuickCollectionAgendaView
              boletas={boletas}
              paidBoletas={paidBoletas}
              clients={clients}
              salespeople={salespeople}
              admins={admins}
              config={config}
              currentDateRef={currentDateRef}
              activeUserName={activeAdmin?.name || 'Administración'}
              onMarkAsPaid={(boleta) => setSelectedBoletaForPayment(boleta)}
              onOpenPartialPaymentModal={(boleta) => setSelectedBoletaForPartial(boleta)}
              onOpenExtendModal={(boleta) => {
                setSelectedBoletaForExtend(boleta);
                setIsExtendModalOpen(true);
              }}
              onOpenVisitModal={(boleta) => setSelectedBoletaForVisit(boleta)}
              onOpenReceipt={(receipt) => setActiveReceiptData(receipt)}
              onQuickSendStatement={(boleta) => openQuickStatementForBoleta(boleta)}
              onRecordReminder={handleRecordReminder}
              onOpenNewBoleta={() => setIsNewBoletaOpen(true)}
            />
          </Suspense>
        )}

        {/* TAB: TODAS LAS BOLETAS IMPAGAS (VISTA DETALLADA CON CLIENTE, MONTOS Y PRÓRROGAS) */}
        {activeTab === 'impagas' && (
          <Suspense fallback={<LazyViewFallback />}>
            <UnpaidBoletasView
              boletas={boletas}
              config={config}
              clients={clients}
              salespeople={salespeople}
              admins={admins}
              onOpenNewBoleta={() => setIsNewBoletaOpen(true)}
              onOpenExtendModal={(boleta) => {
                setSelectedBoletaForExtend(boleta);
                setIsExtendModalOpen(true);
              }}
              onMarkAsPaid={(boleta) => setSelectedBoletaForPayment(boleta)}
              onOpenPartialPaymentModal={(boleta) => setSelectedBoletaForPartial(boleta)}
              onOpenCreditNoteModal={
                config.businessRubro === 'indumentaria'
                  ? (boleta) => setSelectedBoletaForCreditNote(boleta)
                  : undefined
              }
              onQuickSendStatement={(boleta) => openQuickStatementForBoleta(boleta)}
              onDeleteBoleta={handleDeleteBoleta}
              currentDateRef={currentDateRef}
            />
          </Suspense>
        )}

        {/* TAB: RENDICIÓN DE CAJA POR PREVENTISTA / REPARTIDOR (EXCLUSIVO MAYORISTA / DISTRIBUIDORA) */}
        {activeTab === 'rendicion' && (config.businessRubro === 'distribuidora' || !config.businessRubro) && (
          <Suspense fallback={<LazyViewFallback />}>
            <SalespersonRendicionView
              boletas={boletas}
              salespeople={salespeople}
              rendiciones={rendiciones}
              config={config}
              currentDateRef={currentDateRef}
              activeAdminName={activeAdmin?.name || 'Administración'}
              onConfirmRendicion={handleConfirmRendicion}
              onNavigateToSalespeople={() => handleSelectTab('vendedores')}
            />
          </Suspense>
        )}

        {/* TAB: DESPACHO AUTOMÁTICO DIARIO (WHATSAPP & EMAILS) */}
        {activeTab === 'automatizacion' && (
          !tenantFeatureAccess.canAccessFullFeatures ? (
            <div className="bg-white dark:bg-[#0B1933] border border-slate-200 dark:border-[#B6C2D2]/20 rounded-2xl p-8 max-w-2xl mx-auto text-center space-y-4">
              <div className="w-12 h-12 rounded-xl bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 flex items-center justify-center mx-auto">
                <CreditCard className="w-6 h-6" />
              </div>
              <span className="inline-block px-2.5 py-0.5 rounded text-[11px] font-bold bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-200">
                Exclusivo Plan 3 · Full
              </span>
              <h3 className="text-lg font-bold text-[#0B1933] dark:text-white">
                Automatización Diaria por WhatsApp incluida en Plan 3 · Full
              </h3>
              <p className="text-xs text-slate-600 dark:text-[#94A3B8] leading-relaxed">
                Tu cuenta está operando en <strong className="text-[#0B1933] dark:text-white">{tenantFeatureAccess.sectionLabel}</strong>. Actualizá a <strong>Plan 3 · Full</strong> para habilitar despachos automáticos por WhatsApp, cierres diarios, promociones y fidelización completa.
              </p>
              <button
                type="button"
                onClick={() =>
                  setPlanUpgradePrompt({
                    reasonKey: 'full_feature',
                    title: 'Pasar a Plan 3 · Full (Todo Incluido)',
                    detail:
                      'Habilitá automatización diaria por WhatsApp, promociones, SuperClub por DNI y capacidad ilimitada de rubros y prendas.',
                  })
                }
                className="px-5 py-2.5 rounded-xl bg-[#009EE3] hover:bg-[#008AD0] text-white text-xs font-bold cursor-pointer inline-flex items-center gap-2"
              >
                <CreditCard className="w-4 h-4" />
                <span>Pasar a Plan 3 · Full</span>
              </button>
            </div>
          ) : (
            <Suspense fallback={<LazyViewFallback />}>
              <AutomatedDispatchManager
                boletas={boletas}
                paidBoletas={paidBoletas}
                clients={clients}
                salespeople={salespeople}
                admins={admins}
                config={config}
                logs={autoLogs}
                onSaveConfig={handleSaveConfig}
                onAddLogs={handleAddAutoLogs}
                onClearLogs={handleClearAutoLogs}
              />
            </Suspense>
          )
        )}

        {/* TAB: AVISOS & PROMOS A VENDEDORES */}
        {activeTab === 'avisos' && (
          <Suspense fallback={<LazyViewFallback />}>
            <BroadcastManager
              salespeople={salespeople}
              activeAdmin={activeAdmin}
              config={config}
              broadcasts={broadcasts}
              onSaveBroadcast={handleSaveBroadcast}
            />
          </Suspense>
        )}

        {/* TAB 2: PAID BOLETAS HISTORY */}
        {activeTab === 'historial' && (
          <Suspense fallback={<LazyViewFallback />}>
            <PaymentHistoryView
              paidBoletas={paidBoletas}
              config={config}
              onRestoreBoleta={handleRestoreBoleta}
              onOpenReceipt={(receipt) => setActiveReceiptData(receipt)}
            />
          </Suspense>
        )}

        {/* TAB: AUDITORÍA DE MOROSIDAD & SCORE CREDITICIO */}
        {activeTab === 'auditoria' && (
          <Suspense fallback={<LazyViewFallback />}>
            <CreditAuditManager
              clients={clients}
              salespeople={salespeople}
              boletas={boletas}
              paidBoletas={paidBoletas}
              config={config}
              onNavigateToTab={handleSelectTab}
            />
          </Suspense>
        )}

        {/* TAB 3: CLIENTS DIRECTORY */}
        {activeTab === 'clientes' && (
          <Suspense fallback={<LazyViewFallback />}>
            <ClientsManager
              clients={clients}
              salespeople={salespeople}
              boletas={boletas}
              paidBoletas={paidBoletas}
              config={config}
              currentDateRef={currentDateRef}
              activeUserName={activeAdmin?.name || 'Administración'}
              initialSection={clientsInitialSection}
              onSaveClient={(c) => {
                const exists = clients.some((x) => x.id === c.id);
                const updated = exists
                  ? clients.map((x) => (x.id === c.id ? c : x))
                  : [c, ...clients];
                handleSaveClients(updated);
                if (exists && boletas.some((b) => b.clientId === c.id)) {
                  const syncedBoletas = boletas.map((b) =>
                    b.clientId === c.id
                      ? {
                          ...b,
                          clientName: c.name,
                          clientAddress: c.address,
                          clientPhone: c.phone,
                        }
                      : b
                  );
                  handleSaveBoletas(syncedBoletas);
                }
                showToast(`Cliente ${c.name} guardado correctamente.`);
              }}
              onDeleteClient={(id) => {
                const updated = clients.filter((c) => c.id !== id);
                handleSaveClients(updated);
                showToast('Cliente eliminado.');
              }}
              onSaveClientPhone={handleSaveClientPhone}
              onApplyFifoClientPayment={handleApplyAllocationPlan}
              onNavigateToSalespeople={() => handleSelectTab('vendedores')}
              onCreateSaleForClient={(client) => {
                setPreselectedClientForNewBoleta(client.id);
                setIsNewBoletaOpen(true);
              }}
              onQuickSendStatement={(client) => openQuickStatementForClient(client)}
              catalogEnabled={selectedTenant?.catalogEnabled !== false}
              webLoyaltyEnabled={
                selectedTenant?.catalogEnabled !== false &&
                tenantFeatureAccess.canAccessFullFeatures
              }
              catalogLoyaltyAccounts={catalogLoyaltyAccounts}
              catalogOrders={catalogOrders}
              catalogProducts={catalogProducts}
              catalogSettings={catalogSettings}
              catalogPublicUrl={
                typeof window !== 'undefined'
                  ? `${window.location.origin}/?catalog=${encodeURIComponent(
                      catalogSettings.slug?.trim() ||
                        config.tenantCode?.trim() ||
                        selectedTenant?.tenantCode?.trim() ||
                        selectedTenant?.id ||
                        ''
                    )}`
                  : undefined
              }
              onRefreshCatalogLoyaltyAccounts={handleRefreshCatalogLoyaltyAccounts}
              showToast={showToast}
            />
          </Suspense>
        )}

        {/* TAB 4: SALESPEOPLE TEAM */}
        {activeTab === 'vendedores' && (
          <Suspense fallback={<LazyViewFallback />}>
            <SalespeopleManager
              salespeople={salespeople}
              boletas={boletas}
              paidBoletas={paidBoletas}
              config={config}
              onSaveSalesperson={(s) => {
                const exists = salespeople.some((x) => x.id === s.id);
                const updated = exists
                  ? salespeople.map((x) => (x.id === s.id ? s : x))
                  : [s, ...salespeople];
                handleSaveSalespeople(updated);
                showToast(`Vendedor ${s.name} guardado.`);
              }}
              onDeleteSalesperson={(id) => {
                const updated = salespeople.filter((s) => s.id !== id);
                handleSaveSalespeople(updated);
                showToast('Vendedor eliminado.');
              }}
            />
          </Suspense>
        )}

        {/* TAB 5B: CATÁLOGO ONLINE Y PEDIDOS PARA RETIRAR */}
        {activeTab === 'catalogo' && (
          <Suspense fallback={<LazyViewFallback />}>
            <CatalogManager
              config={config}
              tenant={selectedTenant}
              settings={catalogSettings}
              products={catalogProducts}
              orders={catalogOrders}
              stockAlerts={catalogStockAlerts}
              promoSubscribers={catalogPromoSubscribers}
              loyaltyAccounts={catalogLoyaltyAccounts}
              abandonedCarts={catalogAbandonedCarts}
              giftCards={catalogGiftCards}
              activeUserName={activeAdmin?.name || currentUser?.fullName || 'Administración'}
              onSaveSettings={handleSaveCatalogSettings}
              onSaveMerchantPaymentConfig={(paymentCfg) => {
                persistConfigUpdate(
                  {
                    ...config,
                    ...paymentCfg,
                  },
                  'Datos de Alias, CVU y Mercado Pago del catálogo actualizados.'
                );
              }}
              onSaveProducts={handleSaveCatalogProducts}
              onSaveOrders={handleSaveCatalogOrders}
              onSaveStockAlerts={handleSaveCatalogStockAlerts}
              onSavePromoSubscribers={handleSaveCatalogPromoSubscribers}
              onSaveLoyaltyAccounts={handleSaveCatalogLoyaltyAccounts}
              onSaveAbandonedCarts={handleSaveCatalogAbandonedCarts}
              onSaveGiftCards={handleSaveCatalogGiftCards}
              onRefreshOrders={handleRefreshCatalogOrders}
              onRefreshStockAlerts={handleRefreshCatalogStockAlerts}
              onRefreshPromoSubscribers={handleRefreshCatalogPromoSubscribers}
              onRefreshLoyaltyAccounts={handleRefreshCatalogLoyaltyAccounts}
              onRefreshAbandonedCarts={handleRefreshCatalogAbandonedCarts}
              onRefreshGiftCards={handleRefreshCatalogGiftCards}
              onBillOrder={handleBillCatalogOrder}
              onOpenReceipt={(receipt) => setActiveReceiptData(receipt)}
              onOpenReturnModal={(order) => setSelectedWebOrderForReturn(order)}
              onOpenPublicPreview={(handle) => {
                publishCatalogSnapshot(catalogSettings, catalogProducts);
                if (typeof window !== 'undefined') {
                  window.history.pushState({}, '', `?catalog=${encodeURIComponent(handle)}`);
                }
                setPublicCatalogHandle(handle);
              }}
              onOpenEditBrand={() => setIsEditBrandModalOpen(true)}
              planFeatureAccess={{
                tier: tenantFeatureAccess.tier,
                canAccessFullFeatures: tenantFeatureAccess.canAccessFullFeatures,
              }}
              onRequestUpgradePlan={(ctx) =>
                setPlanUpgradePrompt(ctx || { reasonKey: 'full_feature' })
              }
              showToast={showToast}
            />
          </Suspense>
        )}

        {/* TAB 5C: HISTORIAL E INGRESOS DE VENTAS WEB */}
        {activeTab === 'ventas_web' && (
          <Suspense fallback={<LazyViewFallback />}>
            <WebSalesHistoryView
              config={config}
              orders={catalogOrders}
              products={catalogProducts}
              activeUserName={activeAdmin?.name || currentUser?.fullName || 'Administración'}
              onRefreshOrders={handleRefreshCatalogOrders}
              onOpenCatalogManager={() => setActiveTab('catalogo')}
              onBackToDashboard={() => setActiveTab('boletas')}
              onOpenReceipt={(receipt) => setActiveReceiptData(receipt)}
              onBillOrder={handleBillCatalogOrder}
              onMarkOrderAsRetirado={handleMarkWebOrderRetirado}
              onOpenReturnModal={
                tenantFeatureAccess.canAccessFullFeatures
                  ? (order) => setSelectedWebOrderForReturn(order)
                  : undefined
              }
              onChangeOrderPaymentMethod={handleUpdateWebOrderPaymentMethod}
              showToast={showToast}
            />
          </Suspense>
        )}

        {/* TAB 5: MARKETING STUDIO */}
        {activeTab === 'promociones' && (
          !tenantFeatureAccess.canAccessFullFeatures ? (
            <div className="bg-white dark:bg-[#0B1933] border border-slate-200 dark:border-[#B6C2D2]/20 rounded-2xl p-8 max-w-2xl mx-auto text-center space-y-4">
              <div className="w-12 h-12 rounded-xl bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 flex items-center justify-center mx-auto">
                <CreditCard className="w-6 h-6" />
              </div>
              <span className="inline-block px-2.5 py-0.5 rounded text-[11px] font-bold bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-200">
                Exclusivo Plan 3 · Full
              </span>
              <h3 className="text-lg font-bold text-[#0B1933] dark:text-white">
                Estudio de Flyers y Promociones incluido en Plan 3 · Full
              </h3>
              <p className="text-xs text-slate-600 dark:text-[#94A3B8] leading-relaxed">
                Tu cuenta está operando en <strong className="text-[#0B1933] dark:text-white">{tenantFeatureAccess.sectionLabel}</strong>. Actualizá a <strong>Plan 3 · Full</strong> para diseñar banners promocionales, campañas y automatizaciones completas.
              </p>
              <button
                type="button"
                onClick={() =>
                  setPlanUpgradePrompt({
                    reasonKey: 'full_feature',
                    title: 'Pasar a Plan 3 · Full (Todo Incluido)',
                    detail:
                      'Habilitá el Estudio de Flyers y Promociones, burbujas de ofertas, SuperClub por DNI, seguimiento de clientes y capacidad ilimitada.',
                  })
                }
                className="px-5 py-2.5 rounded-xl bg-[#009EE3] hover:bg-[#008AD0] text-white text-xs font-bold cursor-pointer inline-flex items-center gap-2"
              >
                <CreditCard className="w-4 h-4" />
                <span>Pasar a Plan 3 · Full</span>
              </button>
            </div>
          ) : (
            <Suspense fallback={<LazyViewFallback />}>
              <MarketingStudio config={config} />
            </Suspense>
          )
        )}

        {/* TAB 6: ADMINS & SETTINGS */}
        {activeTab === 'administradores' && (
          <Suspense fallback={<LazyViewFallback />}>
            <AdminSettingsView
              admins={admins}
              config={config}
              onSaveAdmin={(a) => {
                const exists = admins.some((x) => x.id === a.id);
                const updated = exists
                  ? admins.map((x) => (x.id === a.id ? a : x))
                  : [a, ...admins];
                handleSaveAdmins(updated);
                showToast(`Administrador ${a.name} actualizado.`);
              }}
              onDeleteAdmin={(id) => {
                const updated = admins.filter((a) => a.id !== id);
                handleSaveAdmins(updated);
                showToast('Administrador eliminado.');
              }}
              onSaveConfig={handleSaveConfig}
              onResetOperationalData={handleResetOperationalData}
              onExecuteRetentionPurge={handleExecuteRetentionPurge}
            />
          </Suspense>
        )}
      </main>
      </div>

      {/* Global Modals */}
      <QuickGuideModal
        isOpen={isQuickGuideOpen}
        onClose={() => setIsQuickGuideOpen(false)}
        onNavigate={(tab) => setActiveTab(tab)}
        onOpenNewBoleta={() => setIsNewBoletaOpen(true)}
        onOpenCriticalBubble={() => setIsCriticalBubbleOpen(true)}
        onOpenSubscriptionPay={selectedTenant ? () => setIsSubscriptionPayOpen(true) : undefined}
      />

      <EditBrandModal
        isOpen={isEditBrandModalOpen}
        onClose={() => setIsEditBrandModalOpen(false)}
        config={config}
        onSave={handleSaveConfig}
      />

      {isNewBoletaOpen && (
        <Suspense fallback={null}>
          <NewBoletaModal
            isOpen={isNewBoletaOpen}
            onClose={() => {
              setIsNewBoletaOpen(false);
              setPreselectedClientForNewBoleta(null);
            }}
            clients={clients}
            salespeople={salespeople}
            boletas={boletas}
            admins={admins}
            config={config}
            preselectedClientId={preselectedClientForNewBoleta}
            onSaveBoleta={handleCreateBoleta}
            onSaveBoletaPlan={handleCreateBoletaPlan}
            onSaveBasketOperation={handleSaveBasketOperation}
            onOpenReceipt={(receipt) => setActiveReceiptData(receipt)}
            onQuickCreateClient={handleQuickCreateClient}
            onUpdateClient={handleUpdateClient}
            onNotifyOwnersBlockedAttempt={handleNotifyOwnersBlockedAttempt}
          />
        </Suspense>
      )}

      <MarkAsPaidModal
        isOpen={Boolean(selectedBoletaForPayment)}
        onClose={() => setSelectedBoletaForPayment(null)}
        boleta={selectedBoletaForPayment}
        client={clients.find((c) => c.id === selectedBoletaForPayment?.clientId)}
        config={config}
        activeUserName={activeAdmin?.name || 'Administración'}
        onConfirmPayment={handleConfirmPayment}
        onOpenReceipt={(receipt) => setActiveReceiptData(receipt)}
        onSaveClientPhone={handleSaveClientPhone}
      />

      <PartialPaymentModal
        isOpen={Boolean(selectedBoletaForPartial)}
        onClose={() => setSelectedBoletaForPartial(null)}
        boleta={selectedBoletaForPartial}
        planSiblingBoletas={
          selectedBoletaForPartial?.planId
            ? boletas.filter((b) => b.planId === selectedBoletaForPartial.planId && b.status === 'pending')
            : []
        }
        client={clients.find((c) => c.id === selectedBoletaForPartial?.clientId)}
        config={config}
        activeUserName={activeAdmin?.name || 'Administrador'}
        onSavePartialPayment={handleSavePartialPayment}
        onApplyUnderpaymentWithSurcharge={handleApplyUnderpaymentWithSurcharge}
        onProcessPlanExcessPayment={handleApplyAllocationPlan}
        onOpenReceipt={(receipt) => setActiveReceiptData(receipt)}
        onSaveClientPhone={handleSaveClientPhone}
      />

      <ReturnCreditNoteModal
        isOpen={config.businessRubro === 'indumentaria' && Boolean(selectedBoletaForCreditNote)}
        onClose={() => setSelectedBoletaForCreditNote(null)}
        boleta={selectedBoletaForCreditNote}
        planSiblingBoletas={
          selectedBoletaForCreditNote?.planId
            ? boletas.filter((b) => b.planId === selectedBoletaForCreditNote.planId && b.status === 'pending')
            : []
        }
        client={clients.find((c) => c.id === selectedBoletaForCreditNote?.clientId)}
        config={config}
        activeUserName={activeAdmin?.name || 'Administración'}
        onApplyCreditNote={handleApplyCreditNote}
      />

      <PaymentReceiptModal
        isOpen={Boolean(activeReceiptData)}
        onClose={() => setActiveReceiptData(null)}
        receipt={activeReceiptData}
        client={clients.find((c) => c.id === activeReceiptData?.clientId)}
        config={config}
        onSaveClientPhone={handleSaveClientPhone}
      />

      {/* Modal de Prórroga Rápida de Boleta */}
      <ExtendBoletaModal
        isOpen={isExtendModalOpen}
        onClose={() => {
          setIsExtendModalOpen(false);
          setSelectedBoletaForExtend(null);
        }}
        boleta={selectedBoletaForExtend}
        config={config}
        onExtend={(boletaId: string, days: number, reason?: string) => {
          handleExtendBoleta(boletaId, days, reason);
        }}
      />

      <CollectionVisitModal
        isOpen={Boolean(selectedBoletaForVisit)}
        onClose={() => setSelectedBoletaForVisit(null)}
        boleta={selectedBoletaForVisit}
        config={config}
        currentDateRef={currentDateRef}
        activeUserName={activeAdmin?.name || currentUser?.fullName || 'Administración'}
        onSaveVisit={handleSaveCollectionVisit}
        onClearPromise={handleClearCollectionPromise}
      />

      {/* Burbuja Flotante Modal de Fiado Vencido (+5 días post-vencimiento) */}
      <CriticalOverdueBubbleModal
        isOpen={isCriticalBubbleOpen}
        onClose={() => setIsCriticalBubbleOpen(false)}
        boletas={boletas}
        config={config}
        clients={clients}
        salespeople={salespeople}
        currentDateRef={currentDateRef}
        onOpenExtendModal={(boleta) => {
          setSelectedBoletaForExtend(boleta);
          setIsExtendModalOpen(true);
        }}
        onMarkAsPaid={(boleta) => setSelectedBoletaForPayment(boleta)}
        onOpenPartialModal={(boleta) => setSelectedBoletaForPartial(boleta)}
        onNavigateToUnpaidTab={() => {
          setIsCriticalBubbleOpen(false);
          setActiveTab('impagas');
        }}
      />

      <AlertsCenterModal
        isOpen={isAlertsCenterOpen}
        onClose={() => setIsAlertsCenterOpen(false)}
        boletas={boletas}
        clients={clients}
        salespeople={salespeople}
        admins={admins}
        config={config}
        onRecordReminder={handleRecordReminder}
      />

      {/* User Profile, Rubro & Password Change Modal */}
      <UserProfileModal
        isOpen={isUserProfileOpen}
        onClose={() => setIsUserProfileOpen(false)}
        currentUser={currentUser}
        config={config}
        onUpdateUser={(updated) => {
          setCurrentUser(updated);
          showToast('Perfil y datos de seguridad actualizados correctamente.');
        }}
        onChangeBusinessRubro={handleChangeBusinessRubro}
        onUpdatePaymentConfig={(patch) => {
          persistConfigUpdate(
            { ...config, ...patch },
            'Datos de Alias / CVU / Mercado Pago guardados para cobros por WhatsApp.'
          );
        }}
      />

      {/* Modal de Selección y Migración de Clientes al Cambiar de Rubro */}
      <RubroClientMigrationModal
        isOpen={Boolean(rubroMigrationRequest)}
        onClose={() => setRubroMigrationRequest(null)}
        currentRubro={config.businessRubro || 'distribuidora'}
        targetRubro={rubroMigrationRequest?.targetRubro || 'distribuidora'}
        clients={clients}
        boletas={boletas}
        config={config}
        onConfirmMigration={handleConfirmRubroMigration}
      />

      {/* Tenant Monthly Subscription Payment Modal (Mercado Pago + CVU/Alias · 1 Mes o 1 Año) */}
      {selectedTenant && (
        <TenantSubscriptionPayModal
          isOpen={isSubscriptionPayOpen}
          onClose={() => {
            setIsSubscriptionPayOpen(false);
            setAutoGenSubPayLink(false);
          }}
          tenant={selectedTenant}
          payerEmail={currentUser.email}
          autoGenerateLinkOnOpen={autoGenSubPayLink}
          initialPlanTier={chosenPlanTierForPayModal || resolveTenantPlanTier(selectedTenant)}
          onSelectPlanTier={(tier, termsMeta) =>
            handleSelectTenantPlanTier(selectedTenant.id, tier, termsMeta)
          }
          onPaymentApproved={(details) => {
            applyApprovedTenantPayment(selectedTenant.id, details);
            showToast(
              details.planType === 'annual'
                ? 'Plan Anual (12 meses) acreditado automáticamente. Tu cuenta está cubierta por todo el año.'
                : 'Abono acreditado automáticamente. El mes quedó marcado como PAGADO.'
            );
          }}
        />
      )}

      {/* Canales de Contacto y Soporte Directo (WhatsApp y Mail del Gestor General) */}
      <ContactChannelsModal
        isOpen={isContactChannelsOpen}
        onClose={() => setIsContactChannelsOpen(false)}
        tenant={selectedTenant}
        currentUser={currentUser}
      />

      {/* Envío Rápido de Estado de Cuenta Instantáneo por WhatsApp (Escrito + Imagen PNG + PDF, sin links) */}
      <ClientStatementQuickShareModal
        isOpen={Boolean(statementShareTarget)}
        onClose={() => setStatementShareTarget(null)}
        client={
          statementShareTarget
            ? clients.find((c) => c.id === statementShareTarget.client.id) || statementShareTarget.client
            : null
        }
        pendingBoletas={boletas}
        paidBoletas={paidBoletas}
        config={config}
        currentDateRef={currentDateRef}
        sourceBoletaNumber={statementShareTarget?.sourceBoletaNumber}
        onSaveClientPhone={handleSaveClientPhone}
      />

      {/* Detalle de Venta Web abierta desde Panel General (Fotos Ampliables y Códigos) */}
      <WebOrderDetailModal
        isOpen={Boolean(selectedWebOrderDetail)}
        onClose={() => setSelectedWebOrderDetail(null)}
        order={
          selectedWebOrderDetail
            ? catalogOrders.find((o) => o.id === selectedWebOrderDetail.id) || selectedWebOrderDetail
            : null
        }
        products={catalogProducts}
        config={config}
        pickupAddressFallback={catalogSettings.pickupAddress || selectedTenant?.address}
        onMarkAsRetirado={handleMarkWebOrderRetirado}
        onOpenReceipt={handleOpenReceiptForWebOrder}
        onBillOrder={handleBillCatalogOrder}
        onChangePaymentMethod={handleUpdateWebOrderPaymentMethod}
        onVerifyTransferReceipt={handleVerifyWebOrderTransferReceipt}
        onOpenReturnModal={
          tenantFeatureAccess.canAccessFullFeatures
            ? (order) => {
                setSelectedWebOrderDetail(null);
                setSelectedWebOrderForReturn(order);
              }
            : undefined
        }
      />

      {/* Gestión directa de Cambios y Devoluciones de Pedidos Web (con resta inmediata de puntos y saldo a favor DNI) */}
      <WebOrderReturnModal
        isOpen={Boolean(selectedWebOrderForReturn)}
        onClose={() => setSelectedWebOrderForReturn(null)}
        order={
          selectedWebOrderForReturn
            ? catalogOrders.find((o) => o.id === selectedWebOrderForReturn.id) || selectedWebOrderForReturn
            : null
        }
        products={catalogProducts}
        loyaltyAccounts={catalogLoyaltyAccounts}
        storeDefaultPointsPerUnit={
          typeof catalogSettings.loyaltyPointsPerUnit === 'number'
            ? catalogSettings.loyaltyPointsPerUnit
            : 10
        }
        currencySymbol={catalogSettings.currencySymbol || config.currencySymbol || '$'}
        storeName={catalogSettings.storeName || config.distributorName || selectedTenant?.name || 'Tienda'}
        activeUserName={activeAdmin?.name || currentUser?.fullName || 'Administración'}
        onConfirmReturn={handleProcessWebOrderReturn}
      />

      {/* Modal de Cambio de Plan Bidireccional (Plan 1 ↔ 2 ↔ 3) con Términos y Condiciones */}
      {selectedTenant && (
        <PlanUpgradeModal
          isOpen={Boolean(planUpgradePrompt)}
          onClose={() => setPlanUpgradePrompt(null)}
          tenant={selectedTenant}
          billingConfig={platformBillingCfg}
          triggerContext={planUpgradePrompt}
          onConfirmPlanChange={handleConfirmPlanChange}
        />
      )}
    </div>
  );
}
