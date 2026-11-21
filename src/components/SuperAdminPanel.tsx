import React, { useState } from 'react';
import {
  Building2,
  Users,
  PlusCircle,
  Search,
  Edit2,
  Trash2,
  CheckCircle,
  XCircle,
  Eye,
  EyeOff,
  Lock,
  KeyRound,
  LogOut,
  Phone,
  Mail,
  MapPin,
  X,
  ShieldCheck,
  Store,
  Truck,
  Copy,
  MessageCircle,
  Share2,
  DollarSign,
  Calendar,
  Clock,
  Flame,
  Check,
  Pause,
  Play,
  AlertCircle,
  ArrowRight,
  FileText,
  CheckCircle2,
  CreditCard,
  Wallet,
  Link2,
  Headphones,
  ExternalLink,
  Megaphone,
  Send,
  SlidersHorizontal,
  Tag,
  Plus,
} from 'lucide-react';
import {
  Tenant,
  PlatformUser,
  DistributorConfig,
  PlatformBillingConfig,
  PlatformSupportConfig,
  PlatformAnnouncement,
  AnnouncementCategory,
  AnnouncementAudience,
  AnnouncementCtaType,
  BusinessRubro,
} from '../types';
import { RUBRO_PROFILES, getRubroProfile, applyRubroProfileToConfig } from '../utils/businessMode';
import {
  CATALOG_RUBRO_PRESETS,
  getCatalogRubroPreset,
  normalizeFilterList,
} from '../utils/catalogRubros';
import {
  loadTenants,
  saveTenants,
  loadPlatformUsers,
  savePlatformUsers,
  loadTenantData,
  saveTenantData,
  loadPlatformBillingConfig,
  fetchPlatformBillingConfigFromServer,
  persistPlatformBillingConfigToServer,
  loadPlatformSupportConfig,
  fetchPlatformSupportConfigFromServer,
  persistPlatformSupportConfigToServer,
  loadPlatformAnnouncements,
  fetchPlatformAnnouncementsFromServer,
  savePlatformAnnouncementToServer,
  togglePlatformAnnouncementOnServer,
  deletePlatformAnnouncementFromServer,
  updateTenantBusinessRubro,
} from '../utils/multiTenantStorage';
import { DEFAULT_CONFIG } from '../utils/storage';
import { BrandMark } from './BrandMark';
import {
  getCurrentMonthInfo,
  getTenantSubscriptionStatus,
  toggleTenantMonthlyPayment,
  grantTenantOneMonthExtension,
  setTenantPausedState,
  generateSubscriptionWhatsAppReminder,
  ensureTenantSubscription,
  calculateAnnualFee,
  formatMonthKeyEs,
} from '../utils/tenantSubscription';
import {
  buildPublicCatalogHandle,
  fetchVerifiedTenantPaymentsMapFromSupabase,
  setPublicCatalogSuperAdminEnabledInSupabase,
} from '../utils/supabaseServices';

interface SuperAdminPanelProps {
  currentUser: PlatformUser;
  onLogout: () => void;
  showToast: (msg: string) => void;
  onOpenUserProfile?: () => void;
}

const PROVINCIAS_ARGENTINA = [
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

export const SuperAdminPanel: React.FC<SuperAdminPanelProps> = ({
  currentUser,
  onLogout,
  showToast,
  onOpenUserProfile,
}) => {
  const [activeTab, setActiveTab] = useState<'tenants' | 'billing' | 'users' | 'support' | 'announcements'>('tenants');

  const [tenants, setTenants] = useState<Tenant[]>(loadTenants);
  const [users, setUsers] = useState<PlatformUser[]>(loadPlatformUsers);

  // Month and calendar info for monetization
  const [billingDate, setBillingDate] = useState<Date>(new Date());
  const monthInfo = getCurrentMonthInfo(billingDate);

  const [tenantSearch, setTenantSearch] = useState('');
  const [lifecycleFilter, setLifecycleFilter] = useState<'all' | 'functioning' | 'trial' | 'paused'>('all');
  const [billingSearch, setBillingSearch] = useState('');
  const [billingStatusFilter, setBillingStatusFilter] = useState<'all' | 'trial' | 'overdue' | 'paid' | 'extended' | 'paused'>('all');
  const [userSearch, setUserSearch] = useState('');
  const [selectedTenantFilter, setSelectedTenantFilter] = useState<string>('all');
  const [confirmDeleteTenantId, setConfirmDeleteTenantId] = useState<string | null>(null);
  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<string | null>(null);

  // Fee modal state
  const [editingFeeTenant, setEditingFeeTenant] = useState<Tenant | null>(null);
  const [feeInputValue, setFeeInputValue] = useState<number>(25000);

  // Platform Billing Config (Alias + Mercado Pago - Exclusivo de Gestión/Superadmin)
  const [platformBilling, setPlatformBilling] = useState<PlatformBillingConfig>(loadPlatformBillingConfig);
  const [billingAliasInput, setBillingAliasInput] = useState(platformBilling.alias || '');
  const [billingHolderInput, setBillingHolderInput] = useState(platformBilling.accountHolderName || '');
  const [billingCvuInput, setBillingCvuInput] = useState(platformBilling.cvu || '');
  const [billingBankInput, setBillingBankInput] = useState(platformBilling.bankOrWalletName || 'Mercado Pago');
  const [billingDefaultFeeInput, setBillingDefaultFeeInput] = useState<number>(platformBilling.defaultMonthlyFee || 25000);
  const [billingAnnualDiscountInput, setBillingAnnualDiscountInput] = useState<number>(
    platformBilling.annualDiscountPercent ?? 0
  );
  const [billingMpLinkInput, setBillingMpLinkInput] = useState(platformBilling.mpCheckoutLink || '');
  const [billingMpTokenInput, setBillingMpTokenInput] = useState('');
  const [isSavingBillingConfig, setIsSavingBillingConfig] = useState(false);
  const [isEditAliasModalOpen, setIsEditAliasModalOpen] = useState(false);

  // Platform Support / Contact Channels Config (Visible to all system users under "Canales de Contacto")
  const [platformSupport, setPlatformSupport] = useState<PlatformSupportConfig>(loadPlatformSupportConfig);
  const [supportNameInput, setSupportNameInput] = useState(platformSupport.contactName || '');
  const [supportPhoneInput, setSupportPhoneInput] = useState(platformSupport.whatsappPhone || '');
  const [supportEmailInput, setSupportEmailInput] = useState(platformSupport.email || '');
  const [supportHoursInput, setSupportHoursInput] = useState(platformSupport.attentionHours || '');
  const [supportMessageInput, setSupportMessageInput] = useState(platformSupport.welcomeMessage || '');
  const [isSavingSupportConfig, setIsSavingSupportConfig] = useState(false);

  // Platform Announcements (Comunicados y Novedades globales)
  const [announcements, setAnnouncements] = useState<PlatformAnnouncement[]>(loadPlatformAnnouncements);
  const [annTitleInput, setAnnTitleInput] = useState('');
  const [annMessageInput, setAnnMessageInput] = useState('');
  const [annCategoryInput, setAnnCategoryInput] = useState<AnnouncementCategory>('novedad');
  const [annAudienceInput, setAnnAudienceInput] = useState<AnnouncementAudience>('all');
  const [annCtaTypeInput, setAnnCtaTypeInput] = useState<AnnouncementCtaType>('none');
  const [annCtaLabelInput, setAnnCtaLabelInput] = useState('');
  const [annCtaUrlInput, setAnnCtaUrlInput] = useState('');
  const [annExpiresAtInput, setAnnExpiresAtInput] = useState('');
  const [editingAnnouncementId, setEditingAnnouncementId] = useState<string | null>(null);
  const [confirmDeleteAnnId, setConfirmDeleteAnnId] = useState<string | null>(null);
  const [isSavingAnnouncement, setIsSavingAnnouncement] = useState(false);

  const [previewReceiptModal, setPreviewReceiptModal] = useState<{
    tenantName: string;
    monthName: string;
    imageUrl: string;
    summary?: string;
    mpPaymentId?: string;
    amountPaid?: number;
  } | null>(null);

  React.useEffect(() => {
    fetchPlatformBillingConfigFromServer().then((cfg) => {
      setPlatformBilling(cfg);
      setBillingAliasInput(cfg.alias || '');
      setBillingHolderInput(cfg.accountHolderName || '');
      setBillingCvuInput(cfg.cvu || '');
      setBillingBankInput(cfg.bankOrWalletName || 'Mercado Pago');
      setBillingDefaultFeeInput(cfg.defaultMonthlyFee || 25000);
      setBillingAnnualDiscountInput(cfg.annualDiscountPercent ?? 0);
      setBillingMpLinkInput(cfg.mpCheckoutLink || '');
    });

    fetchPlatformSupportConfigFromServer().then((sup) => {
      setPlatformSupport(sup);
      setSupportNameInput(sup.contactName || '');
      setSupportPhoneInput(sup.whatsappPhone || '');
      setSupportEmailInput(sup.email || '');
      setSupportHoursInput(sup.attentionHours || '');
      setSupportMessageInput(sup.welcomeMessage || '');
    });

    fetchPlatformAnnouncementsFromServer().then((list) => {
      setAnnouncements(list);
    });

    // Sincronizar pagos acreditados directamente desde Supabase
    const currentMonth = getCurrentMonthInfo().monthKey;
    const currentTenants = loadTenants();
    fetchVerifiedTenantPaymentsMapFromSupabase().then((paymentsMap) => {
      let changed = false;
      const updated = currentTenants.map((t) => {
        const p = paymentsMap[`${t.id}::${currentMonth}`];
        if (!p || p.status !== 'approved') return t;
        const alreadyPaid = getTenantSubscriptionStatus(t).isPaidForCurrentMonth;
        if (alreadyPaid && !p.receiptImageUrl) return t;
        const existingRec = (t.subscription?.paymentHistory || []).find((h) => h.monthKey === currentMonth);
        if (alreadyPaid && existingRec?.receiptImageUrl) return t;
        changed = true;
        return toggleTenantMonthlyPayment(
          t,
          currentMonth,
          true,
          p.amount || t.subscription?.monthlyFee,
          p.verificationSummary || 'Pago verificado automáticamente en Supabase',
          p.verifiedViaReceipt ? 'Sistema Verificador de Comprobantes' : 'Sistema Automático Mercado Pago',
          {
            paymentMethod: p.paymentMethod || 'mercadopago',
            mpPaymentId: p.mpPaymentId,
            mpPreferenceId: p.mpPreferenceId,
            receiptAlias: p.aliasUsed,
            receiptImageUrl: p.receiptImageUrl,
            verificationNote: p.verificationSummary,
            planType: p.planType === 'annual' ? 'annual' : 'monthly',
            monthsCount: p.planType === 'annual' ? Number(p.monthsCount) || 12 : 1,
          }
        );
      });
      if (changed) {
        setTenants(updated);
        saveTenants(updated);
      }
    });
  }, []);

  // Modals
  const [isNewTenantModalOpen, setIsNewTenantModalOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);

  const [isNewUserModalOpen, setIsNewUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<PlatformUser | null>(null);

  // Visible passwords toggles
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});

  const togglePasswordVisibility = (userId: string) => {
    setVisiblePasswords((prev) => ({ ...prev, [userId]: !prev[userId] }));
  };

  // Catalog Rubro Launch & Filter Configuration Modal (per client)
  const [catalogConfigModalTenant, setCatalogConfigModalTenant] = useState<Tenant | null>(null);
  const [catalogConfigRubro, setCatalogConfigRubro] = useState<BusinessRubro>('indumentaria');
  const [catalogConfigFilters, setCatalogConfigFilters] = useState<string[]>(['Niños', 'Hombres', 'Mujeres']);
  const [catalogConfigFilterDraft, setCatalogConfigFilterDraft] = useState('');
  const [catalogConfigSubfilters, setCatalogConfigSubfilters] = useState<string[]>([]);
  const [catalogConfigSubfilterDraft, setCatalogConfigSubfilterDraft] = useState('');

  // Form states for New Tenant Modal
  const [tenantFormCode, setTenantFormCode] = useState('');
  const [tenantFormName, setTenantFormName] = useState('');
  const [tenantFormRubro, setTenantFormRubro] = useState<BusinessRubro>('distribuidora');
  const [tenantFormCatalogRubro, setTenantFormCatalogRubro] = useState<BusinessRubro>('distribuidora');
  const [tenantFormCatalogEnabled, setTenantFormCatalogEnabled] = useState<boolean>(true);
  const [tenantFormCategory, setTenantFormCategory] = useState('Distribuidora / Mayorista');
  const [tenantFormPhone, setTenantFormPhone] = useState('');
  const [tenantFormEmail, setTenantFormEmail] = useState('');
  const [tenantFormAddress, setTenantFormAddress] = useState('');
  const [tenantFormCity, setTenantFormCity] = useState('');
  const [tenantFormProvince, setTenantFormProvince] = useState('Buenos Aires');
  const [tenantFormCuit, setTenantFormCuit] = useState('');
  const [tenantFormIcon, setTenantFormIcon] = useState('building');

  // Initial user credentials
  const [createInitialUser, setCreateInitialUser] = useState(true);
  const [initialUsername, setInitialUsername] = useState('');
  const [initialPassword, setInitialPassword] = useState('1234');
  const [initialOwnerName, setInitialOwnerName] = useState('');

  // Form states for New User Modal
  const [userFormUsername, setUserFormUsername] = useState('');
  const [userFormPassword, setUserFormPassword] = useState('1234');
  const [userFormFullName, setUserFormFullName] = useState('');
  const [userFormRole, setUserFormRole] = useState<'dueño' | 'administrador' | 'vendedor'>('dueño');
  const [userFormTenantId, setUserFormTenantId] = useState<string>(tenants[0]?.id || '');
  const [userFormRubro, setUserFormRubro] = useState<BusinessRubro>(
    tenants[0]?.businessRubro || tenants[0]?.config?.businessRubro || 'distribuidora'
  );
  const [userFormPhone, setUserFormPhone] = useState('');
  const [userFormEmail, setUserFormEmail] = useState('');

  // Rubro selector inside Edit User Modal
  const [editingUserRubro, setEditingUserRubro] = useState<BusinessRubro>('distribuidora');

  React.useEffect(() => {
    const t = tenants.find((x) => x.id === userFormTenantId);
    if (t) {
      setUserFormRubro(t.businessRubro || t.config?.businessRubro || 'distribuidora');
    }
  }, [userFormTenantId, isNewUserModalOpen]);

  React.useEffect(() => {
    if (editingUser?.tenantId && editingUser.tenantId !== 'all') {
      const t = tenants.find((x) => x.id === editingUser.tenantId);
      if (t) {
        setEditingUserRubro(t.businessRubro || t.config?.businessRubro || 'distribuidora');
      }
    }
  }, [editingUser?.id, editingUser?.tenantId]);

  // Handle Save New Tenant
  const handleCreateTenant = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantFormName.trim() || !tenantFormCode.trim()) {
      showToast('Por favor ingrese el nombre y el ID / Código de la empresa.');
      return;
    }

    const cleanCode = tenantFormCode.trim().toUpperCase();
    const existing = tenants.find((t) => t.tenantCode.toUpperCase() === cleanCode);
    if (existing) {
      showToast(`Ya existe una empresa con el código ${cleanCode}. Elija otro ID.`);
      return;
    }

    if (createInitialUser && (!initialUsername.trim() || !initialPassword.trim())) {
      showToast('Por favor defina el usuario y contraseña de acceso para esta empresa.');
      return;
    }

    const profile = getRubroProfile(tenantFormRubro);
    const newId = `dist-${Date.now()}`;
    const newConfig: DistributorConfig = applyRubroProfileToConfig(
      {
        ...DEFAULT_CONFIG,
        distributorName: tenantFormName.trim(),
        distributorPhone: tenantFormPhone.trim(),
        distributorEmail: tenantFormEmail.trim(),
        senderPhone: tenantFormPhone.trim(),
        senderEmail: tenantFormEmail.trim(),
        tenantId: newId,
        tenantCode: cleanCode,
        distributorIcon: tenantFormIcon,
      },
      tenantFormRubro
    );

    const newTenant: Tenant = {
      id: newId,
      tenantCode: cleanCode,
      name: tenantFormName.trim(),
      businessRubro: tenantFormRubro,
      catalogRubro: tenantFormCatalogRubro,
      catalogEnabled: tenantFormCatalogEnabled,
      businessCategory: tenantFormCategory.trim() || profile.label,
      phone: tenantFormPhone.trim(),
      email: tenantFormEmail.trim(),
      address: tenantFormAddress.trim(),
      city: tenantFormCity.trim(),
      province: tenantFormProvince.trim(),
      cuit: tenantFormCuit.trim(),
      status: 'active',
      icon: tenantFormIcon,
      createdAt: new Date().toISOString().split('T')[0],
      config: newConfig,
      subscription: {
        monthlyFee: platformBilling.defaultMonthlyFee || 25000,
        currency: '$',
        paymentWindowStartDay: 1,
        paymentWindowEndDay: 5,
        isPaused: false,
        paymentHistory: [],
      },
    };

    const updatedTenants = [...tenants, newTenant];
    setTenants(updatedTenants);
    saveTenants(updatedTenants);

    const initialSalespeople =
      tenantFormRubro === 'distribuidora'
        ? []
        : [
            {
              id: `sal-mostrador-${Date.now()}`,
              name: 'Caja / Mostrador',
              phone: tenantFormPhone.trim(),
              email: tenantFormEmail.trim(),
              address: '',
              birthDate: '',
              zone: 'Local Comercial',
              active: true,
            },
          ];

    const catalogPreset = getCatalogRubroPreset(tenantFormCatalogRubro);

    // Initialize private empty partition for this tenant (Super Admin will not view their boletas)
    saveTenantData(newId, {
      config: newConfig,
      clients: [],
      salespeople: initialSalespeople,
      admins: [
        {
          id: `adm-${Date.now()}`,
          name: initialOwnerName.trim() || 'Titular',
          phone: tenantFormPhone.trim(),
          email: tenantFormEmail.trim(),
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
        catalogRubro: tenantFormCatalogRubro,
        rubroFilters: catalogPreset.defaultFilters,
        customSubfilters: [],
        storeName: tenantFormName.trim(),
        whatsappPhone: tenantFormPhone.trim(),
        pickupAddress: tenantFormAddress.trim(),
        updatedAt: new Date().toISOString(),
      },
      catalogProducts: [],
      catalogOrders: [],
      catalogStockAlerts: [],
    });

    if (tenantFormCatalogEnabled) {
      void setPublicCatalogSuperAdminEnabledInSupabase(newTenant, true, {
        catalogRubro: tenantFormCatalogRubro,
        rubroFilters: catalogPreset.defaultFilters,
        customSubfilters: [],
        products: [],
      });
    }

    // Create user login for this company
    if (createInitialUser && initialUsername.trim()) {
      const newUser: PlatformUser = {
        id: `usr-${Date.now()}`,
        username: initialUsername.trim().toLowerCase(),
        password: initialPassword.trim() || '1234',
        fullName: initialOwnerName.trim() || `${tenantFormName} (Titular)`,
        email: tenantFormEmail.trim(),
        phone: tenantFormPhone.trim(),
        role: 'dueño',
        tenantId: newId,
        tenantCode: cleanCode,
        createdAt: new Date().toISOString().split('T')[0],
        active: true,
      };
      const updatedUsers = [...users, newUser];
      setUsers(updatedUsers);
      savePlatformUsers(updatedUsers);
    }

    setIsNewTenantModalOpen(false);
    // Reset form
    setTenantFormCode('');
    setTenantFormName('');
    setTenantFormRubro('distribuidora');
    setTenantFormCatalogRubro('distribuidora');
    setTenantFormCatalogEnabled(true);
    setTenantFormCategory('Distribuidora / Mayorista');
    setTenantFormPhone('');
    setTenantFormEmail('');
    setTenantFormAddress('');
    setTenantFormCity('');
    setTenantFormProvince('Buenos Aires');
    setTenantFormCuit('');
    setInitialUsername('');
    setInitialPassword('1234');
    setInitialOwnerName('');

    showToast(`✅ Empresa "${newTenant.name}" (ID: ${cleanCode}) creada con éxito.`);
  };

  // Handle Edit Tenant Save
  const handleSaveEditedTenant = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTenant) return;

    const currentData = loadTenantData(editingTenant.id);
    const editedRubro: BusinessRubro = editingTenant.businessRubro || 'distribuidora';
    const editedCatalogRubro: BusinessRubro =
      editingTenant.catalogRubro ||
      currentData.catalogSettings?.catalogRubro ||
      editedRubro;
    const editedProf = getRubroProfile(editedRubro);

    const normalizedTenant: Tenant = {
      ...editingTenant,
      catalogRubro: editedCatalogRubro,
    };

    const updatedTenants = tenants.map((t) =>
      t.id === editingTenant.id ? normalizedTenant : t
    );
    setTenants(updatedTenants);
    saveTenants(updatedTenants);

    // Update config inside company partition without touching their boletas
    const rubroChanged = (currentData.config.businessRubro || 'distribuidora') !== editedRubro;
    const prevCatalogRubro =
      currentData.catalogSettings?.catalogRubro ||
      currentData.config.businessRubro ||
      'distribuidora';
    const catalogRubroChanged = prevCatalogRubro !== editedCatalogRubro;

    const baseNextConfig = rubroChanged
      ? applyRubroProfileToConfig(currentData.config, editedRubro)
      : currentData.config;

    currentData.config = {
      ...baseNextConfig,
      businessRubro: editedRubro,
      distributorName: editingTenant.name,
      distributorPhone: editingTenant.phone,
      distributorEmail: editingTenant.email,
      tenantCode: editingTenant.tenantCode,
      distributorIcon: editingTenant.icon,
    };

    if (catalogRubroChanged) {
      currentData.catalogProducts = (currentData.catalogProducts || []).map((p) =>
        p.rubro ? p : { ...p, rubro: prevCatalogRubro }
      );
    }

    const catalogPreset = getCatalogRubroPreset(editedCatalogRubro);
    currentData.catalogSettings = {
      published: currentData.catalogSettings?.published !== false,
      ...currentData.catalogSettings,
      catalogRubro: editedCatalogRubro,
      rubroFilters:
        catalogRubroChanged || !(currentData.catalogSettings?.rubroFilters?.length)
          ? catalogPreset.defaultFilters
          : currentData.catalogSettings?.rubroFilters,
      updatedAt: new Date().toISOString(),
    };

    if (!editedProf.requireSalesperson && currentData.salespeople.length === 0) {
      currentData.salespeople = [
        {
          id: `sal-mostrador-${Date.now()}`,
          name: 'Caja / Mostrador',
          phone: editingTenant.phone || '',
          email: editingTenant.email || '',
          address: editingTenant.name || '',
          birthDate: '',
          zone: 'Local Comercial',
          active: true,
        },
      ];
    }

    saveTenantData(editingTenant.id, currentData);

    void setPublicCatalogSuperAdminEnabledInSupabase(
      normalizedTenant,
      normalizedTenant.catalogEnabled !== false,
      {
        catalogRubro: editedCatalogRubro,
        rubroFilters: currentData.catalogSettings?.rubroFilters,
        customSubfilters: currentData.catalogSettings?.customSubfilters,
        products: (currentData.catalogProducts || []).filter(
          (p) => (p.rubro || editedCatalogRubro) === editedCatalogRubro
        ),
      }
    );

    setEditingTenant(null);
    showToast(
      rubroChanged
        ? `Empresa actualizada y perfil cambiado a "${editedProf.label}".`
        : 'Datos de la empresa y catálogo actualizados.'
    );
  };

  // Delete Tenant (inline confirmation)
  const handleDeleteTenant = (tenant: Tenant) => {
    const updatedTenants = tenants.filter((t) => t.id !== tenant.id);
    setTenants(updatedTenants);
    saveTenants(updatedTenants);

    const updatedUsers = users.filter((u) => u.tenantId !== tenant.id);
    setUsers(updatedUsers);
    savePlatformUsers(updatedUsers);
    setConfirmDeleteTenantId(null);

    showToast(`Empresa "${tenant.name}" eliminada.`);
  };

  // Toggle Tenant Status (Suspended/Paused vs Active)
  const handleToggleTenantStatus = (tenant: Tenant) => {
    const isCurrentlyPaused = tenant.subscription?.isPaused || tenant.status === 'suspended';
    const updatedTenant = setTenantPausedState(
      tenant,
      !isCurrentlyPaused,
      !isCurrentlyPaused ? 'Pausada desde Gestión General' : undefined,
      'admin'
    );
    const updated = tenants.map((t) => (t.id === tenant.id ? updatedTenant : t));
    setTenants(updated);
    saveTenants(updated);
    showToast(
      `Empresa ${tenant.name} ahora está ${!isCurrentlyPaused ? 'EN PAUSA (Acceso restringido)' : 'REANUDADA (Servicio activo)'}.`
    );
  };

  const openCatalogConfigModal = (tenant: Tenant) => {
    const data = loadTenantData(tenant.id);
    const initialRubro: BusinessRubro =
      tenant.catalogRubro ||
      data.catalogSettings?.catalogRubro ||
      tenant.businessRubro ||
      tenant.config?.businessRubro ||
      'indumentaria';
    const preset = getCatalogRubroPreset(initialRubro);
    const existingFilters = normalizeFilterList(data.catalogSettings?.rubroFilters);

    setCatalogConfigModalTenant(tenant);
    setCatalogConfigRubro(initialRubro);
    setCatalogConfigFilters(
      existingFilters.length > 0 ? existingFilters : [...preset.defaultFilters]
    );
    setCatalogConfigFilterDraft('');
    setCatalogConfigSubfilters(normalizeFilterList(data.catalogSettings?.customSubfilters));
    setCatalogConfigSubfilterDraft('');
  };

  const handleSelectCatalogConfigRubro = (nextRubro: BusinessRubro) => {
    setCatalogConfigRubro(nextRubro);
    const preset = getCatalogRubroPreset(nextRubro);
    setCatalogConfigFilters([...preset.defaultFilters]);
  };

  const handleSaveCatalogConfigAndLaunch = (enableCatalog: boolean) => {
    if (!catalogConfigModalTenant) return;
    const target = catalogConfigModalTenant;
    const preset = getCatalogRubroPreset(catalogConfigRubro);
    const cleanFilters = normalizeFilterList(catalogConfigFilters);
    const finalFilters = cleanFilters.length > 0 ? cleanFilters : [...preset.defaultFilters];
    const cleanSubfilters = normalizeFilterList(catalogConfigSubfilters);

    const currentData = loadTenantData(target.id);
    const prevRubro: BusinessRubro =
      target.catalogRubro ||
      currentData.catalogSettings?.catalogRubro ||
      target.businessRubro ||
      currentData.config?.businessRubro ||
      'distribuidora';

    // Isolate pre-existing products that belonged to a different rubro
    const nextProducts = (currentData.catalogProducts || []).map((p) =>
      p.rubro ? p : { ...p, rubro: prevRubro }
    );
    const nowIso = new Date().toISOString();

    currentData.catalogProducts = nextProducts;
    currentData.catalogSettings = {
      published: currentData.catalogSettings?.published !== false,
      ...currentData.catalogSettings,
      catalogRubro: catalogConfigRubro,
      rubroFilters: finalFilters,
      customSubfilters: cleanSubfilters,
      storeName: currentData.catalogSettings?.storeName || target.name,
      whatsappPhone: currentData.catalogSettings?.whatsappPhone || target.phone || '',
      pickupAddress: currentData.catalogSettings?.pickupAddress || target.address || '',
      updatedAt: nowIso,
    };
    saveTenantData(target.id, currentData);

    const updatedTenant: Tenant = {
      ...target,
      catalogEnabled: enableCatalog,
      catalogRubro: catalogConfigRubro,
    };
    const updatedTenants = tenants.map((t) => (t.id === target.id ? updatedTenant : t));
    setTenants(updatedTenants);
    saveTenants(updatedTenants);

    const activeRubroProducts = nextProducts.filter(
      (p) => (p.rubro || catalogConfigRubro) === catalogConfigRubro
    );

    void setPublicCatalogSuperAdminEnabledInSupabase(updatedTenant, enableCatalog, {
      catalogRubro: catalogConfigRubro,
      rubroFilters: finalFilters,
      customSubfilters: cleanSubfilters,
      products: activeRubroProducts,
    });

    setCatalogConfigModalTenant(null);
    showToast(
      enableCatalog
        ? `Catálogo de "${target.name}" habilitado y lanzado exclusivamente en rubro ${preset.shortLabel}.`
        : `Rubro ${preset.shortLabel} guardado en el catálogo de "${target.name}" (pausado).`
    );
  };

  // Habilitar / Pausar Servicio de Catálogo Online por empresa (pide elegir rubro antes de lanzar si está pausado)
  const handleToggleTenantCatalog = (tenant: Tenant) => {
    const currentlyEnabled = tenant.catalogEnabled !== false;
    if (!currentlyEnabled) {
      openCatalogConfigModal(tenant);
      return;
    }
    const updated = tenants.map((t) =>
      t.id === tenant.id ? { ...t, catalogEnabled: false } : t
    );
    setTenants(updated);
    saveTenants(updated);
    void setPublicCatalogSuperAdminEnabledInSupabase(tenant, false);
    showToast(`Catálogo Online de "${tenant.name}" PAUSADO desde SuperGestión.`);
  };

  // Tilde de Pago Mensual (SaaS)
  const handleToggleTenantPayment = (tenant: Tenant, setAsPaid: boolean) => {
    const updatedTenant = toggleTenantMonthlyPayment(
      tenant,
      monthInfo.monthKey,
      setAsPaid,
      tenant.subscription?.monthlyFee,
      undefined,
      currentUser.fullName || 'Super Administrador'
    );
    const updated = tenants.map((t) => (t.id === tenant.id ? updatedTenant : t));
    setTenants(updated);
    saveTenants(updated);
    showToast(
      setAsPaid
        ? `✓ Abono de ${monthInfo.monthName} marcado como PAGADO para "${tenant.name}".`
        : `Abono de ${monthInfo.monthName} desmarcado para "${tenant.name}".`
    );
  };

  // Acreditar Plan Anual (12 Meses consecutivos)
  const handleApplyAnnualPayment = (tenant: Tenant) => {
    const monthlyFee = tenant.subscription?.monthlyFee ?? platformBilling.defaultMonthlyFee ?? 25000;
    const annualAmount = calculateAnnualFee(monthlyFee, platformBilling.annualDiscountPercent ?? 0);
    const updatedTenant = toggleTenantMonthlyPayment(
      tenant,
      monthInfo.monthKey,
      true,
      annualAmount,
      `Plan Anual (12 meses) acreditado por ${currentUser.fullName || 'Gestor General'}`,
      currentUser.fullName || 'Super Administrador',
      {
        paymentMethod: 'manual',
        planType: 'annual',
        monthsCount: 12,
      }
    );
    const updated = tenants.map((t) => (t.id === tenant.id ? updatedTenant : t));
    setTenants(updated);
    saveTenants(updated);
    const untilLabel = updatedTenant.subscription?.annualPlanUntilMonth
      ? formatMonthKeyEs(updatedTenant.subscription.annualPlanUntilMonth)
      : '12 meses';
    showToast(
      `✓ Plan Anual (12 meses, hasta ${untilLabel}) acreditado para "${tenant.name}" por $ ${annualAmount.toLocaleString('es-AR')}.`
    );
  };

  // Prorrogar por 1 Mes el uso de la plataforma
  const handleGrantExtensionOneMonth = (tenant: Tenant) => {
    const updatedTenant = grantTenantOneMonthExtension(
      tenant,
      `Prórroga mensual autorizada por ${currentUser.fullName}`,
      currentUser.fullName || 'Super Administrador'
    );
    const updated = tenants.map((t) => (t.id === tenant.id ? updatedTenant : t));
    setTenants(updated);
    saveTenants(updated);
    showToast(
      `⏱️ Prórroga de uso por 1 mes concedida a "${tenant.name}". Podrá continuar operando sin interrupción.`
    );
  };

  // Enviar mensaje de WhatsApp para cobrar el abono mensual
  const handleSendBillingWhatsApp = (tenant: Tenant) => {
    const evalStatus = getTenantSubscriptionStatus(tenant, billingDate);
    const rawPhone = tenant.phone || '';
    if (!rawPhone) {
      showToast('Esta empresa no tiene un teléfono / WhatsApp registrado.');
      return;
    }
    const cleanPhone = rawPhone.replace(/\D/g, '');
    const message = generateSubscriptionWhatsAppReminder(tenant, evalStatus);
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Guardar monto de abono mensual para una empresa
  const handleSaveMonthlyFee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFeeTenant) return;
    const updatedTenant: Tenant = {
      ...editingFeeTenant,
      subscription: {
        ...ensureTenantSubscription(editingFeeTenant),
        monthlyFee: Math.max(0, feeInputValue),
      },
    };
    const updated = tenants.map((t) => (t.id === editingFeeTenant.id ? updatedTenant : t));
    setTenants(updated);
    saveTenants(updated);
    setEditingFeeTenant(null);
    showToast(`Monto mensual para "${editingFeeTenant.name}" fijado en $ ${feeInputValue.toLocaleString('es-AR')}.`);
  };

  // Guardar configuración de Alias, CVU y Mercado Pago (Solo en Gestión / Superadmin)
  const handleSavePlatformBillingConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billingAliasInput.trim()) {
      showToast('Ingresá un Alias válido donde recibir los pagos.');
      return;
    }
    setIsSavingBillingConfig(true);
    try {
      const saved = await persistPlatformBillingConfigToServer({
        alias: billingAliasInput.trim(),
        accountHolderName: billingHolderInput.trim() || currentUser.fullName,
        cvu: billingCvuInput.trim(),
        bankOrWalletName: billingBankInput.trim() || 'Mercado Pago',
        defaultMonthlyFee: Math.max(0, Number(billingDefaultFeeInput) || 25000),
        annualDiscountPercent: Math.min(50, Math.max(0, Number(billingAnnualDiscountInput) || 0)),
        mpCheckoutLink: billingMpLinkInput.trim(),
        mpPublicKey: platformBilling.mpPublicKey || '',
        hasMpAccessToken: platformBilling.hasMpAccessToken || Boolean(billingMpTokenInput.trim()),
        mpAccessToken: billingMpTokenInput.trim() || undefined,
      });
      setPlatformBilling(saved);
      setBillingAliasInput(saved.alias || '');
      setBillingHolderInput(saved.accountHolderName || '');
      setBillingCvuInput(saved.cvu || '');
      setBillingBankInput(saved.bankOrWalletName || 'Mercado Pago');
      setBillingDefaultFeeInput(saved.defaultMonthlyFee || 25000);
      setBillingAnnualDiscountInput(saved.annualDiscountPercent ?? 0);
      setBillingMpLinkInput(saved.mpCheckoutLink || '');
      setBillingMpTokenInput('');
      setIsEditAliasModalOpen(false);
      showToast(`✅ CVU/Alias "${saved.alias}" y planes mensual/anual guardados correctamente.`);
    } finally {
      setIsSavingBillingConfig(false);
    }
  };

  // Guardar Canales de Contacto y Soporte (WhatsApp y Mail visibles para todos los usuarios)
  const handleSavePlatformSupportConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supportPhoneInput.trim() && !supportEmailInput.trim()) {
      showToast('Ingresá al menos un número de WhatsApp o correo electrónico de contacto.');
      return;
    }
    setIsSavingSupportConfig(true);
    try {
      const saved = await persistPlatformSupportConfigToServer({
        contactName: supportNameInput.trim() || currentUser.fullName || 'Soporte Técnico',
        whatsappPhone: supportPhoneInput.trim(),
        email: supportEmailInput.trim(),
        attentionHours: supportHoursInput.trim(),
        welcomeMessage: supportMessageInput.trim(),
      });
      setPlatformSupport(saved);
      setSupportNameInput(saved.contactName || '');
      setSupportPhoneInput(saved.whatsappPhone || '');
      setSupportEmailInput(saved.email || '');
      setSupportHoursInput(saved.attentionHours || '');
      setSupportMessageInput(saved.welcomeMessage || '');
      showToast('✅ Canales de Contacto guardados. Ya están disponibles para todos los usuarios.');
    } finally {
      setIsSavingSupportConfig(false);
    }
  };

  // Publicar o editar Comunicado / Novedad global
  const resetAnnouncementForm = () => {
    setEditingAnnouncementId(null);
    setAnnTitleInput('');
    setAnnMessageInput('');
    setAnnCategoryInput('novedad');
    setAnnAudienceInput('all');
    setAnnCtaTypeInput('none');
    setAnnCtaLabelInput('');
    setAnnCtaUrlInput('');
    setAnnExpiresAtInput('');
  };

  const handleSaveAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!annTitleInput.trim() || !annMessageInput.trim()) {
      showToast('Ingresá el título y el mensaje del comunicado.');
      return;
    }
    setIsSavingAnnouncement(true);
    try {
      const updated = await savePlatformAnnouncementToServer({
        id: editingAnnouncementId || undefined,
        title: annTitleInput.trim(),
        message: annMessageInput.trim(),
        category: annCategoryInput,
        audience: annAudienceInput,
        ctaType: annCtaTypeInput,
        ctaLabel: annCtaLabelInput.trim(),
        ctaUrl: annCtaUrlInput.trim(),
        active: true,
        expiresAt: annExpiresAtInput.trim(),
        authorName: currentUser.fullName || 'Superadministración',
      });
      setAnnouncements(updated);
      resetAnnouncementForm();
      showToast('📢 Comunicado publicado y visible para las cuentas seleccionadas.');
    } finally {
      setIsSavingAnnouncement(false);
    }
  };

  const handleToggleAnnouncement = async (ann: PlatformAnnouncement) => {
    const updated = await togglePlatformAnnouncementOnServer(ann.id, !ann.active);
    setAnnouncements(updated);
    showToast(ann.active ? 'Comunicado pausado.' : 'Comunicado reactivado.');
  };

  const handleDeleteAnnouncement = async (id: string) => {
    const updated = await deletePlatformAnnouncementFromServer(id);
    setAnnouncements(updated);
    setConfirmDeleteAnnId(null);
    showToast('Comunicado eliminado.');
  };

  // Copy or Share credentials
  const handleCopyCredentials = (tenant: Tenant) => {
    const tenantUser = users.find((u) => u.tenantId === tenant.id);
    if (!tenantUser) {
      showToast('Esta empresa aún no tiene un usuario asignado.');
      return;
    }

    const text = `Hola! Tu cuenta para la empresa "${tenant.name}" ha sido habilitada en el sistema de gestión.\n\n` +
      `🔑 DATOS DE ACCESO:\n` +
      `• ID / Código: ${tenant.tenantCode}\n` +
      `• Usuario: ${tenantUser.username}\n` +
      `• Contraseña: ${tenantUser.password}\n\n` +
      `Ingresá desde el navegador y colocá tus datos para acceder a tu panel privado.`;

    navigator.clipboard.writeText(text);
    showToast('📋 Credenciales de acceso copiadas al portapapeles.');
  };

  // Send credentials via WhatsApp directly to client phone
  const handleSendWhatsAppCredentials = (tenant: Tenant) => {
    const tenantUser = users.find((u) => u.tenantId === tenant.id);
    if (!tenantUser) {
      showToast('Esta empresa aún no tiene un usuario asignado.');
      return;
    }
    const rawPhone = tenant.phone || tenantUser.phone || '';
    if (!rawPhone) {
      showToast('No hay teléfono registrado para enviar por WhatsApp.');
      return;
    }
    const cleanPhone = rawPhone.replace(/\D/g, '');
    const text = `Hola! Tu cuenta para la empresa "${tenant.name}" ha sido habilitada en el sistema de gestión.\n\n` +
      `🔑 DATOS DE ACCESO:\n` +
      `• ID / Código de Empresa: ${tenant.tenantCode}\n` +
      `• Usuario: ${tenantUser.username}\n` +
      `• Contraseña: ${tenantUser.password}\n\n` +
      `Podés ingresar directamente con tu usuario y contraseña. Tus datos de ventas y cobranzas son 100% privados de tu empresa.`;

    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Handle Create User
  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userFormUsername.trim() || !userFormPassword.trim()) {
      showToast('Por favor complete usuario y contraseña.');
      return;
    }

    const cleanUsername = userFormUsername.trim().toLowerCase();
    const existing = users.find((u) => u.username.toLowerCase() === cleanUsername);
    if (existing) {
      showToast(`El usuario "${cleanUsername}" ya existe. Elija otro nombre.`);
      return;
    }

    const assignedTenant = tenants.find((t) => t.id === userFormTenantId);

    const newUser: PlatformUser = {
      id: `usr-${Date.now()}`,
      username: cleanUsername,
      password: userFormPassword.trim(),
      fullName: userFormFullName.trim() || cleanUsername,
      email: userFormEmail.trim(),
      phone: userFormPhone.trim(),
      role: userFormRole,
      tenantId: userFormTenantId,
      tenantCode: assignedTenant?.tenantCode,
      createdAt: new Date().toISOString().split('T')[0],
      active: true,
    };

    const updatedUsers = [...users, newUser];
    setUsers(updatedUsers);
    savePlatformUsers(updatedUsers);

    // Si se eligió un rubro distinto al crear el usuario, aplicarlo a la empresa asignada
    if (
      assignedTenant &&
      userFormRubro !== (assignedTenant.businessRubro || assignedTenant.config?.businessRubro || 'distribuidora')
    ) {
      updateTenantBusinessRubro(assignedTenant.id, userFormRubro);
      setTenants(loadTenants());
    }

    setIsNewUserModalOpen(false);
    setUserFormUsername('');
    setUserFormPassword('1234');
    setUserFormFullName('');
    setUserFormPhone('');
    setUserFormEmail('');

    showToast(`✅ Acceso creado para "${newUser.username}" en ${assignedTenant?.name || 'la empresa'}.`);
  };

  // Handle Edit User Save
  const handleSaveEditedUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    const assignedTenant = tenants.find((t) => t.id === editingUser.tenantId);
    const updatedUser = {
      ...editingUser,
      tenantCode: assignedTenant?.tenantCode || editingUser.tenantCode,
    };

    const updatedUsers = users.map((u) => (u.id === editingUser.id ? updatedUser : u));
    setUsers(updatedUsers);
    savePlatformUsers(updatedUsers);

    let rubroMsg = '';
    if (
      editingUser.role !== 'superadmin' &&
      assignedTenant &&
      editingUserRubro !== (assignedTenant.businessRubro || assignedTenant.config?.businessRubro || 'distribuidora')
    ) {
      updateTenantBusinessRubro(assignedTenant.id, editingUserRubro);
      setTenants(loadTenants());
      rubroMsg = ` Rubro cambiado a ${getRubroProfile(editingUserRubro).shortLabel}.`;
    }

    setEditingUser(null);
    showToast(`Usuario ${editingUser.username} actualizado.${rubroMsg}`);
  };

  // Delete User (inline confirmation)
  const handleDeleteUser = (user: PlatformUser) => {
    if (user.role === 'superadmin' && users.filter((u) => u.role === 'superadmin').length <= 1) {
      showToast('No puede eliminar el único Administrador del servicio.');
      return;
    }
    const updatedUsers = users.filter((u) => u.id !== user.id);
    setUsers(updatedUsers);
    savePlatformUsers(updatedUsers);
    setConfirmDeleteUserId(null);
    showToast(`Usuario ${user.username} eliminado.`);
  };

  // Filtered lists
  const filteredTenants = tenants.filter((t) => {
    const matchesSearch =
      t.name.toLowerCase().includes(tenantSearch.toLowerCase()) ||
      t.tenantCode.toLowerCase().includes(tenantSearch.toLowerCase()) ||
      t.email?.toLowerCase().includes(tenantSearch.toLowerCase()) ||
      t.city?.toLowerCase().includes(tenantSearch.toLowerCase()) ||
      t.province?.toLowerCase().includes(tenantSearch.toLowerCase());

    if (!matchesSearch) return false;
    if (lifecycleFilter === 'all') return true;
    const evalSt = getTenantSubscriptionStatus(t, billingDate);
    return evalSt.lifecycleCategory === lifecycleFilter;
  });

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.fullName.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
      (u.tenantCode && u.tenantCode.toLowerCase().includes(userSearch.toLowerCase()));

    const matchesTenant =
      selectedTenantFilter === 'all' ||
      u.tenantId === selectedTenantFilter ||
      (selectedTenantFilter === 'superadmin' && u.role === 'superadmin');

    return matchesSearch && matchesTenant;
  });

  return (
    <div className="min-h-screen bg-[#071021] text-[#E2E8F0] flex flex-col font-sans">
      {/* Top Header */}
      <header className="bg-[#091428] border-b border-[#B6C2D2]/20 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <BrandMark size="md" icon="shield-navy" name="Panel Gestor" />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base font-bold text-white tracking-tight">
                  Panel de Gestión de Empresas Clientes
                </h1>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#13264A] text-[#CBD5E1] border border-[#B6C2D2]/25 font-mono">
                  GESTOR GENERAL
                </span>
              </div>
              <p className="text-xs text-[#94A3B8]">
                Alta de distribuidoras, abonos mensuales, prórrogas, Alias receptor y Mercado Pago
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:flex flex-col text-right">
              <span className="text-xs font-semibold text-white">{currentUser.fullName}</span>
              <span className="text-[11px] text-[#94A3B8] font-mono">{currentUser.email}</span>
            </div>

            {onOpenUserProfile && (
              <button
                type="button"
                onClick={onOpenUserProfile}
                className="py-1.5 px-3 rounded-lg bg-[#13264A] hover:bg-[#1B3566] text-[#E2E8F0] text-xs font-semibold flex items-center gap-1.5 border border-[#B6C2D2]/25 transition-colors cursor-pointer"
                title="Editar mi perfil y contraseña"
              >
                <KeyRound className="w-3.5 h-3.5 text-[#CBD5E1]" />
                <span>Mi Clave</span>
              </button>
            )}

            <button
              type="button"
              onClick={onLogout}
              className="py-1.5 px-3 rounded-lg bg-[#13264A] hover:bg-[#7F1D1D]/70 text-[#E2E8F0] text-xs font-semibold flex items-center gap-1.5 border border-[#B6C2D2]/25 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 text-rose-400" />
              <span>Cerrar Sesión</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full space-y-6">
        {/* Privacy Notice Banner */}
        <div className="bg-[#0B1933] border border-[#B6C2D2]/20 rounded-xl p-4 flex items-start gap-3.5 text-xs text-[#CBD5E1]">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-bold text-white">Privacidad y Confidencialidad de Empresas Clientes</p>
            <p className="text-[#94A3B8]">
              Usted administra las altas de empresas, sus abonos y credenciales. Cada distribuidora opera en su propio entorno privado 100% aislado.
            </p>
          </div>
        </div>

        {/* KPI Summary Cards */}
        {(() => {
          const billingEvaluations = tenants.map((t) => ({
            tenant: t,
            evalStatus: getTenantSubscriptionStatus(t, billingDate),
          }));

          const paidTenants = billingEvaluations.filter((b) => b.evalStatus.isPaidForCurrentMonth);
          const overdueTenants = billingEvaluations.filter((b) => b.evalStatus.isOverdue && !b.evalStatus.isExtended && !b.evalStatus.isPaused);
          const pendingWindowTenants = billingEvaluations.filter((b) => b.evalStatus.status === 'pending_window');
          const extendedTenants = billingEvaluations.filter((b) => b.evalStatus.isExtended);
          const pausedTenants = billingEvaluations.filter((b) => b.evalStatus.lifecycleCategory === 'paused');
          const trialTenants = billingEvaluations.filter((b) => b.evalStatus.lifecycleCategory === 'trial');
          const functioningTenants = billingEvaluations.filter((b) => b.evalStatus.lifecycleCategory === 'functioning');

          const totalMonthlyFeeExpected = billingEvaluations
            .filter((b) => b.evalStatus.lifecycleCategory === 'functioning')
            .reduce((acc, b) => acc + (b.tenant.subscription?.monthlyFee || 25000), 0);
          const totalMonthlyCollected = paidTenants.reduce((acc, b) => acc + (b.tenant.subscription?.monthlyFee || 25000), 0);
          const totalMonthlyPending = Math.max(0, totalMonthlyFeeExpected - totalMonthlyCollected);
          const tenantsToCollectCount = overdueTenants.length + pendingWindowTenants.length;

          return (
            <>
              {/* Calendario y Regla de Cobro Mensual (1 al 5) */}
              <div className="bg-[#0B1933] border border-[#B6C2D2]/20 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-[#13264A] text-[#E2E8F0] border border-[#B6C2D2]/20">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap tabular-nums">
                      <span className="font-bold text-white text-sm">
                        Calendario Mensual: {monthInfo.formattedDateStr}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#13264A] text-[#E2E8F0] border border-[#B6C2D2]/25">
                        Día {monthInfo.dayOfMonth} del mes
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#0F2142] text-[#CBD5E1] border border-[#B6C2D2]/20">
                        Vencimiento: del 1 al 5
                      </span>
                    </div>
                    <p className="text-[#94A3B8] mt-1">
                      {monthInfo.isWithinWindow ? (
                        <span className="text-amber-300 font-medium tabular-nums">
                          Período regular abierto (restan {monthInfo.daysRemainingInWindow} días hasta el día 5).
                        </span>
                      ) : (
                        <span className="text-rose-300 font-medium">
                          Período del 1 al 5 cerrado. Las empresas sin tilde de pago ven el aviso de abono vencido.
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start md:self-center flex-wrap">
                  <button
                    type="button"
                    onClick={() => setIsEditAliasModalOpen(true)}
                    className="px-3.5 py-2 rounded-lg bg-[#E2E8F0] hover:bg-white text-[#091428] font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Configurar o modificar el Alias adonde ingresan los pagos de las empresas"
                  >
                    <Wallet className="w-4 h-4" />
                    <span>Alias: {platformBilling.alias || 'Definir Alias'}</span>
                    <Edit2 className="w-3.5 h-3.5 opacity-75" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('billing')}
                    className="px-3.5 py-2 rounded-lg bg-[#162E59] hover:bg-[#1E3A6D] text-white border border-[#B6C2D2]/25 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <DollarSign className="w-4 h-4 text-emerald-400" />
                    <span>Cobranzas del Mes</span>
                  </button>
                </div>
              </div>

              {/* Barra Rápida Persistente de Alias Receptor */}
              <div className="bg-[#091428] border border-[#B6C2D2]/25 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[#13264A] text-[#E2E8F0] flex items-center justify-center border border-[#B6C2D2]/25 shrink-0">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
                        Alias Receptor Guardado:
                      </span>
                      <span className="font-mono font-bold text-sm text-white bg-[#071021] px-2.5 py-0.5 rounded-md border border-[#B6C2D2]/30 select-all">
                        {platformBilling.alias || 'Sin Alias configurado'}
                      </span>
                    </div>
                    <p className="text-[#94A3B8] text-[11px] mt-0.5">
                      Titular: <strong className="text-[#E2E8F0]">{platformBilling.accountHolderName || currentUser.fullName}</strong>
                      {platformBilling.cvu ? ` · CVU: ${platformBilling.cvu}` : ''}
                      {platformBilling.mpCheckoutLink ? ` · Link MP activo` : ''}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsEditAliasModalOpen(true)}
                  className="px-4 py-2 rounded-lg bg-[#13264A] hover:bg-[#1B3566] text-[#E2E8F0] border border-[#B6C2D2]/30 text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Modificar Alias / Datos de Cobro</span>
                </button>
              </div>

              {/* DISCREPANCIA DE GESTIÓN EN 1 CLIC: FUNCIONANDO / A PRUEBA (30 DÍAS) / EN PAUSA */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setLifecycleFilter('all');
                    setBillingStatusFilter('all');
                    if (activeTab === 'users') setActiveTab('tenants');
                  }}
                  className={`text-left rounded-xl p-4 border transition-colors cursor-pointer flex items-center justify-between ${
                    lifecycleFilter === 'all'
                      ? 'bg-[#162E59] border-[#E2E8F0] shadow-md'
                      : 'bg-[#0B1933] border-[#B6C2D2]/20 hover:border-[#B6C2D2]/45'
                  }`}
                >
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
                      Total Cuentas
                    </p>
                    <p className="text-2xl font-black text-white mt-1 tabular-nums">{tenants.length}</p>
                    <p className="text-[11px] text-[#CBD5E1] mt-1">Ver cartera completa</p>
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-[#0F2142] text-[#E2E8F0] border border-[#B6C2D2]/20 flex items-center justify-center">
                    <Building2 className="w-5 h-5" />
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setLifecycleFilter('functioning');
                    setBillingStatusFilter('all');
                    if (activeTab === 'users') setActiveTab('tenants');
                  }}
                  className={`text-left rounded-xl p-4 border transition-colors cursor-pointer flex items-center justify-between ${
                    lifecycleFilter === 'functioning'
                      ? 'bg-emerald-950/50 border-emerald-400 shadow-md'
                      : 'bg-[#0B1933] border-[#B6C2D2]/20 hover:border-emerald-500/50'
                  }`}
                >
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">
                      En Funcionamiento
                    </p>
                    <p className="text-2xl font-black text-emerald-400 mt-1 tabular-nums">
                      {functioningTenants.length}
                    </p>
                    <p className="text-[11px] text-[#CBD5E1] mt-1 tabular-nums">
                      {paidTenants.length} al día · {tenantsToCollectCount} a cobrar
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-emerald-950/60 text-emerald-400 border border-emerald-500/25 flex items-center justify-center">
                    <CheckCircle className="w-5 h-5" />
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setLifecycleFilter('trial');
                    setBillingStatusFilter('trial');
                    if (activeTab === 'users') setActiveTab('tenants');
                  }}
                  className={`text-left rounded-xl p-4 border transition-colors cursor-pointer flex items-center justify-between ${
                    lifecycleFilter === 'trial'
                      ? 'bg-sky-950/60 border-sky-400 shadow-md'
                      : 'bg-[#0B1933] border-[#B6C2D2]/20 hover:border-sky-400/50'
                  }`}
                >
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-sky-300">
                      A Prueba (30 Días)
                    </p>
                    <p className="text-2xl font-black text-sky-300 mt-1 tabular-nums">
                      {trialTenants.length}
                    </p>
                    <p className="text-[11px] text-[#CBD5E1] mt-1 tabular-nums">
                      Pasan a activas al abonar
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-sky-950/60 text-sky-300 border border-sky-400/25 flex items-center justify-center">
                    <Calendar className="w-5 h-5" />
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setLifecycleFilter('paused');
                    setBillingStatusFilter('paused');
                    if (activeTab === 'users') setActiveTab('tenants');
                  }}
                  className={`text-left rounded-xl p-4 border transition-colors cursor-pointer flex items-center justify-between ${
                    lifecycleFilter === 'paused'
                      ? 'bg-rose-950/60 border-rose-400 shadow-md'
                      : 'bg-[#0B1933] border-[#B6C2D2]/20 hover:border-rose-400/50'
                  }`}
                >
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-rose-300">
                      Cuentas en Pausa
                    </p>
                    <p className="text-2xl font-black text-rose-300 mt-1 tabular-nums">
                      {pausedTenants.length}
                    </p>
                    <p className="text-[11px] text-[#CBD5E1] mt-1 tabular-nums">
                      Sin acceso hasta abonar
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-rose-950/60 text-rose-300 border border-rose-500/30 flex items-center justify-center">
                    <Pause className="w-5 h-5" />
                  </div>
                </button>
              </div>

              {/* KPI Summary Financiero */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div
                  onClick={() => {
                    setActiveTab('billing');
                    setLifecycleFilter('all');
                    setBillingStatusFilter('paid');
                  }}
                  className="bg-[#0B1933] border border-[#B6C2D2]/20 rounded-xl p-4 flex items-center justify-between cursor-pointer hover:border-emerald-500/50 transition-colors"
                >
                  <div>
                    <p className="text-xs font-medium text-[#94A3B8]">
                      Cobrado ({monthInfo.monthName.split(' ')[0]})
                    </p>
                    <p className="text-2xl font-black text-emerald-400 font-mono tabular-nums mt-1">
                      $ {totalMonthlyCollected.toLocaleString('es-AR')}
                    </p>
                    <p className="text-[11px] text-emerald-300 mt-1 flex items-center gap-1 tabular-nums">
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span>{paidTenants.length} empresas al día</span>
                    </p>
                  </div>
                  <div className="w-11 h-11 rounded-lg bg-emerald-950/60 text-emerald-400 border border-emerald-500/25 flex items-center justify-center">
                    <DollarSign className="w-5 h-5" />
                  </div>
                </div>

                <div
                  onClick={() => {
                    setActiveTab('billing');
                    setLifecycleFilter('all');
                    setBillingStatusFilter('overdue');
                  }}
                  className={`border rounded-xl p-4 flex items-center justify-between cursor-pointer transition-colors ${
                    tenantsToCollectCount > 0
                      ? 'bg-rose-950/30 border-[#B91C1C]/80 hover:border-rose-400'
                      : 'bg-[#0B1933] border-[#B6C2D2]/20'
                  }`}
                >
                  <div>
                    <p className="text-xs font-bold text-rose-300 flex items-center gap-1">
                      <Flame className="w-3.5 h-3.5 text-rose-400" />
                      <span>Empresas a Cobrar (Activas)</span>
                    </p>
                    <p className="text-2xl font-black text-rose-300 font-mono tabular-nums mt-1">
                      $ {totalMonthlyPending.toLocaleString('es-AR')}
                    </p>
                    <p className="text-[11px] text-rose-200 font-semibold mt-1 tabular-nums">
                      {tenantsToCollectCount} pendientes de pago
                    </p>
                  </div>
                  <div className="w-11 h-11 rounded-lg bg-rose-950/70 text-rose-300 border border-rose-500/30 flex items-center justify-center">
                    <AlertCircle className="w-5 h-5" />
                  </div>
                </div>

                <div
                  onClick={() => {
                    setActiveTab('billing');
                    setLifecycleFilter('all');
                    setBillingStatusFilter('extended');
                  }}
                  className="bg-[#0B1933] border border-[#B6C2D2]/20 rounded-xl p-4 flex items-center justify-between cursor-pointer hover:border-[#B6C2D2]/45 transition-colors"
                >
                  <div>
                    <p className="text-xs font-medium text-[#94A3B8]">
                      Prórrogas y Pausas
                    </p>
                    <p className="text-2xl font-black text-white mt-1 tabular-nums">
                      {extendedTenants.length} <span className="text-xs text-[#94A3B8] font-normal">prórroga(s)</span>
                    </p>
                    <p className="text-[11px] text-[#94A3B8] mt-1 tabular-nums">
                      {pausedTenants.length} pausada(s) · {trialTenants.length} a prueba
                    </p>
                  </div>
                  <div className="w-11 h-11 rounded-lg bg-[#13264A] text-[#CBD5E1] border border-[#B6C2D2]/20 flex items-center justify-center">
                    <Clock className="w-5 h-5" />
                  </div>
                </div>
              </div>
            </>
          );
        })()}

        {/* Navigation Tabs */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-[#B6C2D2]/20 pb-3">
          <div className="flex items-center gap-1.5 bg-[#091428] p-1 rounded-xl border border-[#B6C2D2]/20 w-full sm:w-auto overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab('tenants')}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap ${
                activeTab === 'tenants'
                  ? 'bg-[#E2E8F0] text-[#091428]'
                  : 'text-[#94A3B8] hover:text-white hover:bg-[#13264A]'
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>Empresas Clientes ({tenants.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('billing')}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap ${
                activeTab === 'billing'
                  ? 'bg-[#E2E8F0] text-[#091428]'
                  : 'text-[#94A3B8] hover:text-white hover:bg-[#13264A]'
              }`}
            >
              <DollarSign className="w-4 h-4" />
              <span>Cobranzas y Monetización</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('users')}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap ${
                activeTab === 'users'
                  ? 'bg-[#E2E8F0] text-[#091428]'
                  : 'text-[#94A3B8] hover:text-white hover:bg-[#13264A]'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Usuarios y Claves ({users.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('support')}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap ${
                activeTab === 'support'
                  ? 'bg-[#E2E8F0] text-[#091428]'
                  : 'text-[#94A3B8] hover:text-white hover:bg-[#13264A]'
              }`}
            >
              <Headphones className="w-4 h-4" />
              <span>Canales de Contacto</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('announcements')}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap ${
                activeTab === 'announcements'
                  ? 'bg-[#E2E8F0] text-[#091428]'
                  : 'text-[#94A3B8] hover:text-white hover:bg-[#13264A]'
              }`}
            >
              <Megaphone className="w-4 h-4" />
              <span>
                Comunicados y Novedades ({announcements.filter((a) => a.active).length})
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {activeTab === 'tenants' && (
              <button
                type="button"
                onClick={() => setIsNewTenantModalOpen(true)}
                className="py-2.5 px-4 rounded-lg bg-[#E2E8F0] hover:bg-white text-[#091428] text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Nueva Empresa Cliente</span>
              </button>
            )}

            {activeTab === 'billing' && (
              <button
                type="button"
                onClick={() => {
                  const pendingTenants = tenants.filter(
                    (t) => !getTenantSubscriptionStatus(t, billingDate).isPaidForCurrentMonth
                  );
                  if (pendingTenants.length === 0) {
                    showToast('Todas las empresas tienen su abono mensual al día.');
                  } else {
                    showToast(`Hay ${pendingTenants.length} empresas pendientes de cobro este mes.`);
                  }
                }}
                className="py-2.5 px-4 rounded-lg bg-[#162E59] hover:bg-[#1E3A6D] text-white border border-[#B6C2D2]/30 text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Auditar Estado de Cobranzas</span>
              </button>
            )}

            {activeTab === 'users' && (
              <button
                onClick={() => setIsNewUserModalOpen(true)}
                className="py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-blue-600/25 transition-all cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Cargar Usuario a Empresa</span>
              </button>
            )}
          </div>
        </div>

        {/* TAB 1: EMPRESAS CLIENTES */}
        {activeTab === 'tenants' && (
          <div className="space-y-4">
            {/* Search & Lifecycle Discrepancy Filters */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                <input
                  type="text"
                  value={tenantSearch}
                  onChange={(e) => setTenantSearch(e.target.value)}
                  placeholder="Buscar empresa por nombre, ID, ciudad o provincia..."
                  className="w-full pl-10 pr-4 py-2.5 bg-[#0B1933] border border-[#B6C2D2]/25 rounded-xl text-xs text-white placeholder-[#64748B] focus:outline-hidden focus:ring-2 focus:ring-[#CBD5E1]/60"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto">
                {(['all', 'functioning', 'trial', 'paused'] as const).map((cat) => {
                  const labels = {
                    all: 'Todas',
                    functioning: 'En Funcionamiento',
                    trial: 'A Prueba (30d)',
                    paused: 'En Pausa',
                  };
                  const count =
                    cat === 'all'
                      ? tenants.length
                      : tenants.filter((t) => getTenantSubscriptionStatus(t, billingDate).lifecycleCategory === cat).length;

                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setLifecycleFilter(cat)}
                      className={`px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer transition-colors border tabular-nums ${
                        lifecycleFilter === cat
                          ? 'bg-[#E2E8F0] text-[#091428] border-white'
                          : 'bg-[#0B1933] text-[#CBD5E1] border-[#B6C2D2]/20 hover:bg-[#13264A]'
                      }`}
                    >
                      {labels[cat]} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            {filteredTenants.length === 0 ? (
              <div className="bg-[#0B1933] border border-[#B6C2D2]/20 rounded-xl p-10 text-center space-y-2">
                <Building2 className="w-8 h-8 text-[#94A3B8] mx-auto" />
                <p className="text-sm font-bold text-white">No hay empresas en esta categoría</p>
                <p className="text-xs text-[#94A3B8]">
                  Probá limpiando el buscador o cambiando el filtro entre Funcionando, A Prueba y En Pausa.
                </p>
              </div>
            ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTenants.map((tenant) => {
                const tenantOwnerUser = users.find(
                  (u) => u.tenantId === tenant.id && u.role === 'dueño'
                ) || users.find((u) => u.tenantId === tenant.id);

                const isPasswordVisible = tenantOwnerUser
                  ? visiblePasswords[tenantOwnerUser.id]
                  : false;
                const evalCardStatus = getTenantSubscriptionStatus(tenant, billingDate);

                return (
                  <div
                    key={tenant.id}
                    className="bg-[#0B1933] border border-[#B6C2D2]/20 rounded-2xl p-5 shadow-xs hover:border-[#B6C2D2]/40 transition-all flex flex-col justify-between"
                  >
                    <div>
                      {/* Top Bar: Code, Lifecycle Badge & Actions */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-[#13264A] text-[#E2E8F0] border border-[#B6C2D2]/30">
                            {tenant.tenantCode}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                              evalCardStatus.lifecycleCategory === 'paused'
                                ? 'bg-rose-950/60 text-rose-300 border border-rose-500/40'
                                : evalCardStatus.lifecycleCategory === 'trial'
                                ? 'bg-sky-950/70 text-sky-300 border border-sky-400/40'
                                : 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/35'
                            }`}
                          >
                            {evalCardStatus.lifecycleCategory === 'paused'
                              ? 'En Pausa'
                              : evalCardStatus.status === 'trial_expired'
                              ? 'Prueba Vencida'
                              : evalCardStatus.lifecycleCategory === 'trial'
                              ? `A Prueba (${evalCardStatus.trialDaysRemaining}d)`
                              : 'Funcionando'}
                          </span>
                          {tenant.subscription?.selfRegistered && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-[#091428] text-[#CBD5E1] border border-[#B6C2D2]/20">
                              Autoregistro
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => setEditingTenant(tenant)}
                            title="Editar Datos de la Empresa"
                            className="p-1.5 rounded-lg text-[#94A3B8] hover:text-white hover:bg-[#13264A] transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleTenantStatus(tenant)}
                            title={evalCardStatus.isPaused ? 'Reanudar acceso' : 'Pausar acceso a la empresa'}
                            className="p-1.5 rounded-lg text-[#94A3B8] hover:text-amber-300 hover:bg-[#13264A] transition-colors cursor-pointer"
                          >
                            {evalCardStatus.isPaused ? (
                              <Play className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Pause className="w-3.5 h-3.5 text-amber-300" />
                            )}
                          </button>
                          {confirmDeleteTenantId === tenant.id ? (
                            <div className="flex items-center gap-1 bg-[#071021] px-1.5 py-0.5 rounded border border-rose-500/40">
                              <button
                                type="button"
                                onClick={() => handleDeleteTenant(tenant)}
                                className="text-[10px] font-bold text-rose-300 hover:text-white px-1 cursor-pointer"
                              >
                                Eliminar
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteTenantId(null)}
                                className="text-[10px] text-[#94A3B8] hover:text-white px-1 cursor-pointer"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteTenantId(tenant.id)}
                              title="Eliminar Empresa"
                              className="p-1.5 rounded-lg text-[#94A3B8] hover:text-rose-400 hover:bg-[#13264A] transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Name & Category */}
                      <h3 className="text-base font-bold text-white tracking-tight">{tenant.name}</h3>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <span className="px-2 py-0.5 rounded bg-[#13264A] border border-[#B6C2D2]/25 text-[10px] font-bold text-[#E2E8F0]">
                          {getRubroProfile(tenant.businessRubro || tenant.config?.businessRubro || 'distribuidora').shortLabel}
                        </span>
                        <p className="text-xs text-[#CBD5E1] font-medium">{tenant.businessCategory || 'Mayorista'}</p>
                      </div>
                      {evalCardStatus.lifecycleCategory === 'trial' && evalCardStatus.trialEndsAt && (
                        <p className="text-[11px] text-sky-300 mt-1 font-mono tabular-nums">
                          Prueba gratis hasta: <strong>{evalCardStatus.trialEndsAt}</strong>
                        </p>
                      )}
                      {evalCardStatus.lifecycleCategory === 'paused' && tenant.subscription?.pauseReason && (
                        <p className="text-[11px] text-rose-300 mt-1">
                          Motivo: {tenant.subscription.pauseReason}
                        </p>
                      )}

                      {/* Geographic location: Ciudad y Provincia */}
                      <div className="mt-3 bg-slate-900/60 p-2.5 rounded-xl border border-slate-700/60 space-y-1.5 text-xs text-slate-300">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                          <span className="truncate">
                            {tenant.city || tenant.province ? (
                              <>
                                <strong>{tenant.city || 'Ciudad'}</strong>
                                {tenant.province ? `, ${tenant.province}` : ''}
                              </>
                            ) : (
                              'Ubicación no especificada'
                            )}
                          </span>
                        </div>
                        {tenant.address && (
                          <div className="text-[11px] text-slate-400 pl-5 truncate">
                            {tenant.address}
                          </div>
                        )}
                      </div>

                      {/* Contact: Phone & Email */}
                      <div className="mt-3 space-y-1 text-xs text-slate-300">
                        {tenant.phone && (
                          <div className="flex items-center gap-2">
                            <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{tenant.phone}</span>
                          </div>
                        )}
                        {tenant.email && (
                          <div className="flex items-center gap-2">
                            <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{tenant.email}</span>
                          </div>
                        )}
                      </div>

                      {/* Credentials Display for Customer */}
                      {tenantOwnerUser && (
                        <div className="mt-3 p-2.5 bg-slate-950/70 rounded-xl border border-slate-700/60 space-y-1.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-400 flex items-center gap-1 font-semibold">
                              <KeyRound className="w-3 h-3 text-amber-400" />
                              <span>Acceso del Cliente:</span>
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              Usuario: <strong className="text-white">{tenantOwnerUser.username}</strong>
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800 text-xs">
                            <span className="text-slate-400 text-[11px]">Contraseña:</span>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-amber-300 font-bold bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                                {isPasswordVisible ? tenantOwnerUser.password : '••••••••'}
                              </span>
                              <button
                                type="button"
                                onClick={() => togglePasswordVisibility(tenantOwnerUser.id)}
                                className="text-slate-400 hover:text-white"
                                title="Ver u ocultar contraseña"
                              >
                                {isPasswordVisible ? (
                                  <EyeOff className="w-3.5 h-3.5" />
                                ) : (
                                  <Eye className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Subscription & Monthly Billing Status Box */}
                    {(() => {
                      const evalStatus = getTenantSubscriptionStatus(tenant, billingDate);
                      return (
                        <div className="mt-3 p-3 rounded-xl bg-slate-950/80 border border-slate-700/70 space-y-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                              <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Abono Mensual ({monthInfo.monthName.split(' ')[0]}):</span>
                            </span>
                            <button
                              onClick={() => {
                                setEditingFeeTenant(tenant);
                                setFeeInputValue(tenant.subscription?.monthlyFee || 25000);
                              }}
                              className="font-mono font-bold text-emerald-300 hover:underline cursor-pointer"
                              title="Modificar cuota mensual"
                            >
                              $ {(tenant.subscription?.monthlyFee || 25000).toLocaleString('es-AR')}
                            </button>
                          </div>

                          <div className="flex items-center justify-between gap-1 flex-wrap">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                                evalStatus.status === 'paid'
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : evalStatus.status === 'extended'
                                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                  : evalStatus.status === 'trial_active'
                                  ? 'bg-sky-500/20 text-sky-300 border border-sky-400/35'
                                  : evalStatus.status === 'trial_expired'
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                  : evalStatus.status === 'paused'
                                  ? 'bg-rose-900/40 text-rose-300 border border-rose-500/40'
                                  : evalStatus.status === 'overdue'
                                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              }`}
                            >
                              {evalStatus.label}
                            </span>

                            {evalStatus.isOverdue && !evalStatus.isExtended && (
                              <span className="text-[10px] font-bold text-rose-400">
                                Debe cobrarle ({monthInfo.daysPastWindow}d mora)
                              </span>
                            )}
                          </div>

                          {/* Quick Interactive Controls */}
                          <div className="pt-2 border-t border-slate-800 grid grid-cols-2 gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleToggleTenantPayment(tenant, !evalStatus.isPaidForCurrentMonth)}
                              className={`py-1.5 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-all ${
                                evalStatus.isPaidForCurrentMonth
                                  ? 'bg-emerald-600 text-white shadow-xs'
                                  : 'bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30'
                              }`}
                              title={evalStatus.isPaidForCurrentMonth ? 'Desmarcar pago del mes' : 'Marcar como pagado este mes'}
                            >
                              <Check className="w-3 h-3" />
                              <span>{evalStatus.isPaidForCurrentMonth ? '✓ Pagado' : 'Tildar Pago'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleGrantExtensionOneMonth(tenant)}
                              className="py-1.5 px-2 rounded-lg text-[11px] font-bold bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 flex items-center justify-center gap-1 cursor-pointer transition-all"
                              title="Prorrogar por 1 mes el uso del sistema sin bloquear"
                            >
                              <Clock className="w-3 h-3" />
                              <span>+1 Mes Prórroga</span>
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleToggleTenantStatus(tenant)}
                              className={`py-1.5 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-all ${
                                evalStatus.isPaused
                                  ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30'
                                  : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              }`}
                              title={evalStatus.isPaused ? 'Reanudar servicio' : 'Pausar servicio a la empresa'}
                            >
                              {evalStatus.isPaused ? (
                                <>
                                  <Play className="w-3 h-3 text-emerald-400" />
                                  <span>Reanudar</span>
                                </>
                              ) : (
                                <>
                                  <Pause className="w-3 h-3 text-rose-400" />
                                  <span>Pausar</span>
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleSendBillingWhatsApp(tenant)}
                              className="py-1.5 px-2 rounded-lg text-[11px] font-bold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 flex items-center justify-center gap-1 cursor-pointer transition-all"
                              title="Enviar mensaje de cobranza del abono por WhatsApp"
                            >
                              <MessageCircle className="w-3 h-3 text-emerald-400" />
                              <span>Cobrar WA</span>
                            </button>
                          </div>

                          <div className="pt-1.5 border-t border-slate-800/80 flex items-center justify-between gap-1.5">
                            <button
                              type="button"
                              onClick={() => openCatalogConfigModal(tenant)}
                              className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                                tenant.catalogEnabled !== false
                                  ? 'bg-sky-600/20 hover:bg-sky-600/30 text-sky-200 border border-sky-400/30'
                                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                              }`}
                              title="Elegir rubro del catálogo, filtros y habilitar/lanzar para este cliente"
                            >
                              <Store className="w-3 h-3 shrink-0" />
                              <span className="truncate">
                                {tenant.catalogEnabled !== false
                                  ? `Catálogo: ${
                                      getCatalogRubroPreset(
                                        tenant.catalogRubro ||
                                          tenant.businessRubro ||
                                          tenant.config?.businessRubro
                                      ).shortLabel
                                    }`
                                  : 'Lanzar Catálogo (Elegir Rubro)'}
                              </span>
                            </button>

                            {tenant.catalogEnabled !== false && (
                              <button
                                type="button"
                                onClick={() => handleToggleTenantCatalog(tenant)}
                                title="Pausar Catálogo Online de este cliente"
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/50 text-slate-400 hover:text-rose-300 border border-slate-700 transition-colors cursor-pointer"
                              >
                                <Pause className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {tenant.catalogEnabled !== false && (
                              <a
                                href={`/?catalog=${encodeURIComponent(
                                  buildPublicCatalogHandle({
                                    tenantCode: tenant.tenantCode,
                                    tenantId: tenant.id,
                                  })
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Abrir catálogo público de la empresa"
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Bottom Actions: Copy / Send WhatsApp Credentials to client */}
                    <div className="mt-4 pt-3 border-t border-slate-700/60 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleCopyCredentials(tenant)}
                        className="py-2 px-3 rounded-xl bg-slate-700/60 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        title="Copiar mensaje de acceso para el cliente"
                      >
                        <Copy className="w-3.5 h-3.5 text-blue-400" />
                        <span>Copiar Datos</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSendWhatsAppCredentials(tenant)}
                        className="py-2 px-3 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        title="Enviar credenciales por WhatsApp al cliente"
                      >
                        <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                        <span>WhatsApp</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            )}
          </div>
        )}

        {/* TAB 2: MONETIZACIÓN Y COBRANZAS SAAS (MENSUAL 1 AL 5, PRÓRROGAS Y PAUSAS) */}
        {activeTab === 'billing' && (
          <div className="space-y-6">
            {/* Header info bar */}
            <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-emerald-400" />
                  <span>Control de Abonos Mensuales de Empresas Clientes</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Las empresas pagan mensualmente del 1 al 5. Desde el día 6, si no tienen tilde de pago, reciben avisos de corte. Podés pausarlas, tildar su pago o prorrogarles por 1 mes.
                </p>
              </div>

              {/* Simulation Date Selector for Testing Month Cycles */}
              <div className="flex items-center gap-2 bg-slate-900 p-2 rounded-xl border border-slate-700/70 text-xs">
                <Calendar className="w-4 h-4 text-blue-400" />
                <span className="text-slate-400">Fecha de prueba:</span>
                <input
                  type="date"
                  value={billingDate.toISOString().split('T')[0]}
                  onChange={(e) => {
                    if (e.target.value) {
                      setBillingDate(new Date(`${e.target.value}T12:00:00`));
                    }
                  }}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-white font-mono text-xs focus:ring-1 focus:ring-blue-500"
                />
                <button
                  onClick={() => setBillingDate(new Date())}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300"
                  title="Volver a la fecha actual"
                >
                  Hoy
                </button>
              </div>
            </div>

            {/* CONFIGURACIÓN EXCLUSIVA DE GESTIÓN: ALIAS RECEPTOR Y MERCADO PAGO */}
            <form
              onSubmit={handleSavePlatformBillingConfig}
              className="bg-[#0B1933] border border-[#B6C2D2]/30 rounded-xl p-5 space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center border border-sky-500/30">
                    <Wallet className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-black text-white">
                        Cuenta de Cobro del Servicio (Alias & Mercado Pago)
                      </h4>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30">
                        EXCLUSIVO DE GESTIÓN
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Definí tu Alias y datos de Mercado Pago adonde irá el dinero. Todas las distribuidoras verán el botón "Pagar" para abonarte mensualmente y que el sistema acredite el pago automáticamente.
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  {platformBilling.hasMpAccessToken ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold">
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>API Mercado Pago Conectada</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-500/20 text-sky-300 border border-sky-500/30 text-[11px] font-bold">
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>Cobro Activo por Alias / Checkout</span>
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 text-xs">
                <div>
                  <label className="block font-bold text-sky-300 mb-1">
                    Alias de Cobro (A dónde va el dinero): *
                  </label>
                  <input
                    type="text"
                    required
                    value={billingAliasInput}
                    onChange={(e) => setBillingAliasInput(e.target.value)}
                    placeholder="ej. mi.distribuidora.mp"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-sky-500/50 rounded-xl text-white font-mono font-bold focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-300 mb-1">
                    Titular de la Cuenta:
                  </label>
                  <input
                    type="text"
                    value={billingHolderInput}
                    onChange={(e) => setBillingHolderInput(e.target.value)}
                    placeholder="Nombre y Apellido"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block font-bold text-sky-300 mb-1">
                    CVU / CBU del Gestor General (Dueño):
                  </label>
                  <input
                    type="text"
                    value={billingCvuInput}
                    onChange={(e) => setBillingCvuInput(e.target.value)}
                    placeholder="00000031000... (tu CVU de Mercado Pago)"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-sky-500/40 rounded-xl text-white font-mono focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-300 mb-1">
                    Cuota Base Mensual ($ ARS):
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="500"
                    value={billingDefaultFeeInput}
                    onChange={(e) => setBillingDefaultFeeInput(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-emerald-400 font-mono font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5 text-xs pt-1">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">
                    Billetera / Entidad Receptora:
                  </label>
                  <input
                    type="text"
                    value={billingBankInput}
                    onChange={(e) => setBillingBankInput(e.target.value)}
                    placeholder="Mercado Pago"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block font-bold text-emerald-300 mb-1">
                    Descuento Plan Anual (% · 12M):
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="50"
                    step="1"
                    value={billingAnnualDiscountInput}
                    onChange={(e) => setBillingAnnualDiscountInput(Math.min(50, Math.max(0, Number(e.target.value) || 0)))}
                    placeholder="0"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-emerald-500/40 rounded-xl text-emerald-300 font-mono font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block font-mono">
                    Anual base: $ {calculateAnnualFee(billingDefaultFeeInput, billingAnnualDiscountInput).toLocaleString('es-AR')}
                  </span>
                </div>

                <div>
                  <label className="block font-bold text-slate-300 mb-1 flex items-center gap-1">
                    <Link2 className="w-3.5 h-3.5 text-sky-400" />
                    <span>Link de Pago / Suscripción MP (Opcional):</span>
                  </label>
                  <input
                    type="url"
                    value={billingMpLinkInput}
                    onChange={(e) => setBillingMpLinkInput(e.target.value)}
                    placeholder="https://mpago.la/..."
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-300 mb-1 flex items-center gap-1">
                    <Lock className="w-3.5 h-3.5 text-amber-400" />
                    <span>Access Token Mercado Pago (Checkout Pro):</span>
                  </label>
                  <input
                    type="password"
                    value={billingMpTokenInput}
                    onChange={(e) => setBillingMpTokenInput(e.target.value)}
                    placeholder={
                      platformBilling.hasMpAccessToken
                        ? '•••••••••••• (Token configurado - escribir para cambiar)'
                        : 'Credencial Checkout Pro MP (Opcional para cobro automático)'
                    }
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-amber-300 font-mono focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
                <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-2">
                  <span>
                    Alias visible para suscripciones (1 Mes o 1 Año):{' '}
                    <strong className="text-sky-300 font-mono">{platformBilling.alias}</strong>
                  </span>
                  {platformBilling.cvu && (
                    <span>
                      · CVU Gestor General:{' '}
                      <strong className="text-emerald-300 font-mono">{platformBilling.cvu}</strong>
                    </span>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={isSavingBillingConfig}
                  className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-black shadow-md shadow-sky-600/20 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60"
                >
                  <Wallet className="w-4 h-4" />
                  <span>{isSavingBillingConfig ? 'Guardando...' : 'Guardar CVU / Alias y Planes'}</span>
                </button>
              </div>
            </form>

            {/* SECCIÓN PRIORITARIA: EMPRESAS QUE DEBERÍAS COBRARLES ESTE MES */}
            {(() => {
              const tenantsToCollect = tenants.filter((t) => {
                const st = getTenantSubscriptionStatus(t, billingDate);
                return !st.isPaidForCurrentMonth && !st.isExtended && !st.isPaused && st.status !== 'trial_active';
              });

              if (tenantsToCollect.length === 0) {
                return (
                  <div className="bg-emerald-950/30 border border-emerald-500/40 rounded-2xl p-4 flex items-center gap-3 text-xs text-emerald-300">
                    <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                    <div>
                      <p className="font-bold text-white">¡Todas las empresas tienen su abono de {monthInfo.monthName} al día!</p>
                      <p className="text-emerald-400/80">No hay cuentas pendientes de cobro o en mora actualmente.</p>
                    </div>
                  </div>
                );
              }

              return (
                <div className="bg-rose-950/35 border border-[#B91C1C] rounded-xl p-5 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-[#991B1B] rounded-lg text-white">
                        <Flame className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                          <span>🔔 EMPRESAS QUE DEBERÍAS COBRARLES ESTE MES ({tenantsToCollect.length})</span>
                        </h4>
                        <p className="text-xs text-rose-300">
                          {monthInfo.isWithinWindow
                            ? `Plazo regular abierto hasta el día 5. Podés enviarles el recordatorio de cobro preventivo.`
                            : `⚠️ Plazo de cobro (1 al 5) vencido hace ${monthInfo.daysPastWindow} días. Tienen aviso de cuenta próxima a pausarse en su pantalla.`}
                        </p>
                      </div>
                    </div>

                    <span className="px-3 py-1 bg-rose-600 text-white font-mono font-bold text-xs rounded-xl shadow-xs">
                      Total a recaudar: ${tenantsToCollect.reduce((acc, t) => acc + (t.subscription?.monthlyFee || 25000), 0).toLocaleString('es-AR')}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
                    {tenantsToCollect.map((tenant) => {
                      const st = getTenantSubscriptionStatus(tenant, billingDate);
                      return (
                        <div
                          key={tenant.id}
                          className="bg-slate-900/90 border border-rose-700/60 rounded-xl p-3.5 space-y-2 flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                {tenant.tenantCode}
                              </span>
                              <span className="text-xs font-mono font-bold text-rose-400">
                                $ {(tenant.subscription?.monthlyFee || 25000).toLocaleString('es-AR')}
                              </span>
                            </div>
                            <h5 className="font-bold text-white text-sm mt-1">{tenant.name}</h5>
                            <p className="text-[11px] text-slate-400 truncate">
                              {tenant.phone || tenant.email || 'Sin contacto'}
                            </p>
                          </div>

                          <div className="pt-2 border-t border-slate-800 flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleToggleTenantPayment(tenant, true)}
                              className="flex-1 py-1.5 px-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                              title="Hacer tilde de pagado"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>✓ Tildar Pago</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleSendBillingWhatsApp(tenant)}
                              className="py-1.5 px-2.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                              title="Enviar recordatorio de cobro por WhatsApp"
                            >
                              <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Cobrar WA</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleGrantExtensionOneMonth(tenant)}
                              className="py-1.5 px-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                              title="Prorrogar 1 mes"
                            >
                              <Clock className="w-3.5 h-3.5" />
                              <span>+1M</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Billing Filters */}
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={billingSearch}
                  onChange={(e) => setBillingSearch(e.target.value)}
                  placeholder="Buscar empresa por nombre o código en cobranzas..."
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
                {(['all', 'trial', 'overdue', 'paid', 'extended', 'paused'] as const).map((filter) => {
                  const labelMap = {
                    all: 'Todas',
                    trial: 'A Prueba (30d)',
                    overdue: 'En Mora / Impagas',
                    paid: 'Al Día (Pagas)',
                    extended: 'Con Prórroga',
                    paused: 'En Pausa',
                  };
                  return (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => {
                        setBillingStatusFilter(filter);
                        if (filter === 'trial') setLifecycleFilter('trial');
                        else if (filter === 'paused') setLifecycleFilter('paused');
                        else if (filter === 'all') setLifecycleFilter('all');
                      }}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                        billingStatusFilter === filter
                          ? 'bg-[#E2E8F0] text-[#091428] shadow-xs'
                          : 'bg-[#0B1933] text-[#CBD5E1] border border-[#B6C2D2]/20 hover:bg-[#13264A]'
                      }`}
                    >
                      {labelMap[filter]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* TABLA COMPLETA DE MONETIZACIÓN Y ESTADO DE ABONOS */}
            <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Empresa</th>
                      <th className="py-3 px-4">Cuota Mensual</th>
                      <th className="py-3 px-4">Estado {monthInfo.monthName}</th>
                      <th className="py-3 px-4">Condición de Servicio</th>
                      <th className="py-3 px-4">Contacto</th>
                      <th className="py-3 px-4 text-right">Acciones de Cobro & Prórroga</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/60">
                    {tenants
                      .filter((t) => {
                        const matchesSearch =
                          t.name.toLowerCase().includes(billingSearch.toLowerCase()) ||
                          t.tenantCode.toLowerCase().includes(billingSearch.toLowerCase());
                        const st = getTenantSubscriptionStatus(t, billingDate);

                        if (lifecycleFilter !== 'all' && st.lifecycleCategory !== lifecycleFilter) {
                          return false;
                        }

                        let matchesStatus = true;
                        if (billingStatusFilter === 'trial') matchesStatus = st.lifecycleCategory === 'trial';
                        else if (billingStatusFilter === 'overdue') matchesStatus = st.isOverdue && !st.isExtended && !st.isPaused;
                        else if (billingStatusFilter === 'paid') matchesStatus = st.isPaidForCurrentMonth;
                        else if (billingStatusFilter === 'extended') matchesStatus = st.isExtended;
                        else if (billingStatusFilter === 'paused') matchesStatus = st.lifecycleCategory === 'paused';

                        return matchesSearch && matchesStatus;
                      })
                      .map((tenant) => {
                        const evalStatus = getTenantSubscriptionStatus(tenant, billingDate);
                        const isPaid = evalStatus.isPaidForCurrentMonth;
                        const fee = tenant.subscription?.monthlyFee || 25000;

                        return (
                          <tr key={tenant.id} className="hover:bg-slate-800/70 transition-colors">
                            {/* Company Name & Code */}
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                  {tenant.tenantCode}
                                </span>
                                <div>
                                  <div className="font-bold text-white text-sm">{tenant.name}</div>
                                  <div className="text-[11px] text-slate-400">
                                    {tenant.city ? `${tenant.city}, ` : ''}
                                    {tenant.province || 'Argentina'}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Monthly Fee */}
                            <td className="py-3.5 px-4 font-mono">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-emerald-400 text-sm">
                                  $ {fee.toLocaleString('es-AR')}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingFeeTenant(tenant);
                                    setFeeInputValue(fee);
                                  }}
                                  className="p-1 rounded text-slate-400 hover:text-white"
                                  title="Editar importe de cuota mensual"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              </div>
                              <span className="text-[10px] text-slate-500">por mes</span>
                            </td>

                            {/* Status in Current Month */}
                            <td className="py-3.5 px-4">
                              <div className="space-y-1">
                                <span
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider ${
                                    isPaid
                                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                      : evalStatus.isExtended
                                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                      : evalStatus.status === 'trial_active'
                                      ? 'bg-sky-500/20 text-sky-300 border border-sky-400/35'
                                      : evalStatus.status === 'trial_expired'
                                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                      : evalStatus.isPaused
                                      ? 'bg-rose-950/40 text-rose-300 border border-rose-500/40'
                                      : evalStatus.isOverdue
                                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  }`}
                                >
                                  {isPaid ? (
                                    <Check className="w-3 h-3" />
                                  ) : evalStatus.isExtended ? (
                                    <Clock className="w-3 h-3" />
                                  ) : evalStatus.lifecycleCategory === 'trial' ? (
                                    <Calendar className="w-3 h-3" />
                                  ) : (
                                    <Flame className="w-3 h-3" />
                                  )}
                                  <span>{evalStatus.label}</span>
                                </span>

                                {isPaid && (() => {
                                  const payRec = (tenant.subscription?.paymentHistory || []).find(
                                    (p) => p.monthKey === monthInfo.monthKey && p.status === 'paid'
                                  );
                                  return (
                                    <div className="space-y-1">
                                      {payRec?.paymentMethod === 'mercadopago' ? (
                                        <div className="text-[10px] text-sky-300 font-semibold flex items-center gap-1">
                                          <CreditCard className="w-3 h-3 text-sky-400" />
                                          <span>Abonado vía Mercado Pago {payRec.mpPaymentId ? `(#${payRec.mpPaymentId})` : ''}</span>
                                        </div>
                                      ) : payRec?.paymentMethod === 'transferencia' ? (
                                        <div className="text-[10px] text-emerald-300 font-semibold">
                                          ✓ Transferido al Alias ({payRec.paidAt})
                                        </div>
                                      ) : null}
                                      {payRec?.receiptImageUrl && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setPreviewReceiptModal({
                                              tenantName: tenant.name,
                                              monthName: monthInfo.monthName,
                                              imageUrl: payRec.receiptImageUrl!,
                                              summary: payRec.verificationNote || payRec.notes,
                                              mpPaymentId: payRec.mpPaymentId,
                                              amountPaid: payRec.amountPaid,
                                            })
                                          }
                                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold cursor-pointer"
                                        >
                                          <FileText className="w-3 h-3" />
                                          <span>Ver Comprobante Verificado</span>
                                        </button>
                                      )}
                                    </div>
                                  );
                                })()}

                                {evalStatus.isExtended && evalStatus.extensionExpiresAt && (
                                  <div className="text-[10px] text-indigo-300 font-semibold">
                                    ⏱️ Prórroga hasta: {evalStatus.extensionExpiresAt}
                                  </div>
                                )}

                                {evalStatus.lifecycleCategory === 'trial' && evalStatus.trialEndsAt && (
                                  <div className="text-[10px] text-sky-300 font-semibold font-mono tabular-nums">
                                    Prueba hasta: {evalStatus.trialEndsAt}
                                  </div>
                                )}

                                {evalStatus.isOverdue && !evalStatus.isExtended && (
                                  <div className="text-[10px] text-rose-400 font-bold">
                                    Venció el 5 de {monthInfo.monthName.split(' ')[0]}
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* Service Status: Funcionando / A Prueba / En Pausa */}
                            <td className="py-3.5 px-4">
                              <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                                  evalStatus.lifecycleCategory === 'paused'
                                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                    : evalStatus.lifecycleCategory === 'trial'
                                    ? 'bg-sky-500/20 text-sky-300 border border-sky-400/30'
                                    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                }`}
                              >
                                {evalStatus.lifecycleCategory === 'paused'
                                  ? 'En Pausa'
                                  : evalStatus.lifecycleCategory === 'trial'
                                  ? 'A Prueba'
                                  : 'Funcionando'}
                              </span>
                            </td>

                            {/* Contact info */}
                            <td className="py-3.5 px-4 text-slate-300">
                              <div className="flex items-center gap-1.5">
                                <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span>{tenant.phone || '-'}</span>
                              </div>
                              <div className="text-[11px] text-slate-400 truncate max-w-[140px]">
                                {tenant.email || '-'}
                              </div>
                            </td>

                            {/* Actions: Tilde, Prórroga 1M, Pausar, Cobrar WA */}
                            <td className="py-3.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                {/* TILDE DE PAGO MENSUAL */}
                                <button
                                  type="button"
                                  onClick={() => handleToggleTenantPayment(tenant, !isPaid)}
                                  className={`py-1 px-2.5 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-all ${
                                    isPaid
                                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                                      : 'bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600'
                                  }`}
                                  title={isPaid ? 'Hacer clic para desmarcar pago' : 'Tildar abono de 1 mes recibido'}
                                >
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>{isPaid ? '✓ Pagado' : 'Tildar 1M'}</span>
                                </button>

                                {/* ACREDITAR PLAN ANUAL (12 MESES) */}
                                {!(tenant.subscription?.annualPlanUntilMonth && tenant.subscription.annualPlanUntilMonth >= monthInfo.monthKey) && (
                                  <button
                                    type="button"
                                    onClick={() => handleApplyAnnualPayment(tenant)}
                                    className="py-1 px-2 rounded-lg bg-sky-600/20 hover:bg-sky-600/35 text-sky-300 border border-sky-500/35 text-xs font-bold flex items-center gap-1 cursor-pointer transition-all"
                                    title="Acreditar pago anual por 12 meses consecutivos"
                                  >
                                    <Calendar className="w-3 h-3" />
                                    <span>+1 Año (12M)</span>
                                  </button>
                                )}

                                {/* PRÓRROGA 1 MES */}
                                <button
                                  type="button"
                                  onClick={() => handleGrantExtensionOneMonth(tenant)}
                                  className="py-1 px-2 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-bold flex items-center gap-1 cursor-pointer transition-all"
                                  title="Prorrogar uso por 1 mes para que siga operando"
                                >
                                  <Clock className="w-3 h-3" />
                                  <span>+1M Prórroga</span>
                                </button>

                                {/* PAUSAR / REANUDAR */}
                                <button
                                  type="button"
                                  onClick={() => handleToggleTenantStatus(tenant)}
                                  className={`p-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                                    evalStatus.isPaused
                                      ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30'
                                      : 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-rose-400'
                                  }`}
                                  title={evalStatus.isPaused ? 'Reanudar acceso a la cuenta' : 'Pausar acceso a la empresa'}
                                >
                                  {evalStatus.isPaused ? <Play className="w-3.5 h-3.5 text-emerald-400" /> : <Pause className="w-3.5 h-3.5" />}
                                </button>

                                {/* CONFIGURAR RUBRO Y HABILITAR / PAUSAR CATÁLOGO ONLINE */}
                                <button
                                  type="button"
                                  onClick={() => openCatalogConfigModal(tenant)}
                                  className={`p-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all inline-flex items-center gap-1 ${
                                    tenant.catalogEnabled !== false
                                      ? 'bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/30'
                                      : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700'
                                  }`}
                                  title={
                                    tenant.catalogEnabled !== false
                                      ? `Catálogo ${getCatalogRubroPreset(tenant.catalogRubro || tenant.businessRubro).shortLabel} habilitado (clic para configurar rubro)`
                                      : 'Elegir rubro y lanzar Catálogo Online'
                                  }
                                >
                                  <Store className="w-3.5 h-3.5" />
                                </button>

                                {/* COBRAR POR WHATSAPP */}
                                <button
                                  type="button"
                                  onClick={() => handleSendBillingWhatsApp(tenant)}
                                  className="p-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 cursor-pointer"
                                  title="Enviar mensaje de cobro por WhatsApp"
                                >
                                  <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
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
          </div>
        )}

        {/* TAB 3: USERS AND PASSWORDS MANAGEMENT */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Buscar por usuario, nombre, clave o código ID..."
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <select
                value={selectedTenantFilter}
                onChange={(e) => setSelectedTenantFilter(e.target.value)}
                className="w-full sm:w-auto px-3.5 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-xs text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Todas las Empresas</option>
                <option value="superadmin">👑 Administrador del Servicio</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.tenantCode})
                  </option>
                ))}
              </select>
            </div>

            {/* Users Table */}
            <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Usuario</th>
                      <th className="py-3 px-4">Contraseña / Clave</th>
                      <th className="py-3 px-4">Nombre / Titular</th>
                      <th className="py-3 px-4">Empresa (ID de Página)</th>
                      <th className="py-3 px-4">Rol</th>
                      <th className="py-3 px-4">Contacto</th>
                      <th className="py-3 px-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/60">
                    {filteredUsers.map((user) => {
                      const isSuper = user.role === 'superadmin';
                      const assignedTenant = tenants.find((t) => t.id === user.tenantId);
                      const isPasswordVisible = visiblePasswords[user.id];

                      return (
                        <tr key={user.id} className="hover:bg-slate-800 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-white flex items-center gap-2">
                            <span>{user.username}</span>
                            {isSuper && (
                              <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-md font-sans">
                                Admin General
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2 font-mono">
                              <span className="bg-slate-900 px-2 py-1 rounded-md border border-slate-700 text-amber-300 font-bold">
                                {isPasswordVisible ? user.password : '••••••••'}
                              </span>
                              <button
                                type="button"
                                onClick={() => togglePasswordVisibility(user.id)}
                                className="text-slate-400 hover:text-white transition-colors p-1"
                                title={isPasswordVisible ? 'Ocultar clave' : 'Ver clave'}
                              >
                                {isPasswordVisible ? (
                                  <EyeOff className="w-3.5 h-3.5" />
                                ) : (
                                  <Eye className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-200">{user.fullName}</td>
                          <td className="py-3 px-4">
                            {isSuper ? (
                              <span className="text-amber-400 font-semibold">Plataforma General</span>
                            ) : assignedTenant ? (
                              <div className="flex items-center gap-1.5">
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                  {assignedTenant.tenantCode}
                                </span>
                                <span className="text-slate-300 font-medium truncate max-w-[150px]">
                                  {assignedTenant.name}
                                </span>
                              </div>
                            ) : (
                              <span className="text-rose-400">Sin empresa asignada</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                                user.role === 'superadmin'
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : user.role === 'dueño'
                                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                  : user.role === 'administrador'
                                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              }`}
                            >
                              {user.role}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-400">
                            <div>{user.phone || '-'}</div>
                            <div className="text-[11px] text-slate-500">{user.email || '-'}</div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setEditingUser(user)}
                                title="Editar Clave o Datos"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              {confirmDeleteUserId === user.id ? (
                                <div className="flex items-center gap-1 bg-slate-950 px-1.5 py-0.5 rounded border border-rose-500/40">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteUser(user)}
                                    className="text-[10px] font-bold text-rose-300 hover:text-white px-1 cursor-pointer"
                                  >
                                    Confirmar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteUserId(null)}
                                    className="text-[10px] text-slate-400 hover:text-white px-1 cursor-pointer"
                                  >
                                    No
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteUserId(user.id)}
                                  title="Eliminar Usuario"
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-700 transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: CANALES DE CONTACTO Y ASISTENCIA TÉCNICA */}
        {activeTab === 'support' && (
          <div className="space-y-6">
            <form
              onSubmit={handleSavePlatformSupportConfig}
              className="bg-[#0B1933] border border-[#B6C2D2]/25 rounded-2xl p-6 space-y-5"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center border border-sky-500/30 shrink-0">
                    <Headphones className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">
                      Canales de Contacto Directo para Usuarios del Sistema
                    </h3>
                    <p className="text-xs text-[#94A3B8]">
                      Cargá tu teléfono de WhatsApp y correo electrónico para que las cuentas usuarias puedan escribirte por dudas o asistencia técnica.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block font-bold text-emerald-300 mb-1.5 flex items-center gap-1.5">
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>Teléfono / WhatsApp de Contacto Directo:</span>
                  </label>
                  <input
                    type="text"
                    value={supportPhoneInput}
                    onChange={(e) => setSupportPhoneInput(e.target.value)}
                    placeholder="ej. +54 9 11 1234-5678"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-emerald-500/40 rounded-xl text-white font-mono tabular-nums focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                  <span className="text-[11px] text-[#94A3B8] mt-1 block">
                    Incluí el código de país (ej. +54 9 ...) para que el botón de WhatsApp abra el chat directamente.
                  </span>
                </div>

                <div>
                  <label className="block font-bold text-sky-300 mb-1.5 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5" />
                    <span>Correo Electrónico (Mail de Soporte / Dudas):</span>
                  </label>
                  <input
                    type="email"
                    value={supportEmailInput}
                    onChange={(e) => setSupportEmailInput(e.target.value)}
                    placeholder="ej. soporte@tusistema.com"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-sky-500/40 rounded-xl text-white font-mono focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
                  />
                  <span className="text-[11px] text-[#94A3B8] mt-1 block">
                    Los usuarios podrán enviarte un mail directo con el motivo de su consulta.
                  </span>
                </div>

                <div>
                  <label className="block font-bold text-slate-300 mb-1.5">
                    Nombre del Responsable o Área:
                  </label>
                  <input
                    type="text"
                    value={supportNameInput}
                    onChange={(e) => setSupportNameInput(e.target.value)}
                    placeholder="ej. Federico Roa · Soporte Técnico"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>Horarios de Atención (Opcional):</span>
                  </label>
                  <input
                    type="text"
                    value={supportHoursInput}
                    onChange={(e) => setSupportHoursInput(e.target.value)}
                    placeholder="ej. Lunes a Viernes de 9:00 a 19:00 hs"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="text-xs">
                <label className="block font-bold text-slate-300 mb-1.5">
                  Mensaje Orientativo para tus Usuarios (Opcional):
                </label>
                <textarea
                  rows={2}
                  value={supportMessageInput}
                  onChange={(e) => setSupportMessageInput(e.target.value)}
                  placeholder="Comunicate por WhatsApp o mail ante dudas operativas o asistencia técnica..."
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white focus:ring-2 focus:ring-sky-500 focus:outline-hidden resize-none"
                />
              </div>

              {/* Vista Previa de Enlaces Activos */}
              <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="text-xs text-[#94A3B8] space-y-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <span>
                      WhatsApp guardado:{' '}
                      <strong className="font-mono text-emerald-300">
                        {platformSupport.whatsappPhone || 'Sin cargar'}
                      </strong>
                    </span>
                    <span className="text-slate-600" aria-hidden="true">
                      ·
                    </span>
                    <span>
                      Mail guardado:{' '}
                      <strong className="font-mono text-sky-300">
                        {platformSupport.email || 'Sin cargar'}
                      </strong>
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Visible para todas las empresas clientes en la sección <strong className="text-white">Canales de Contacto</strong>.
                  </p>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                  {supportPhoneInput.replace(/\D/g, '') && (
                    <a
                      href={`https://wa.me/${supportPhoneInput.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-2.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>Probar WhatsApp</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  <button
                    type="submit"
                    disabled={isSavingSupportConfig}
                    className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-black shadow-md shadow-sky-600/20 inline-flex items-center gap-2 transition-all cursor-pointer disabled:opacity-60 whitespace-nowrap"
                  >
                    <Headphones className="w-4 h-4" />
                    <span>{isSavingSupportConfig ? 'Guardando...' : 'Guardar Canales de Contacto'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* TAB 5: COMUNICADOS Y NOVEDADES GLOBALES PARA EMPRESAS CLIENTES */}
        {activeTab === 'announcements' && (
          <div className="space-y-6">
            <form
              onSubmit={handleSaveAnnouncement}
              className="bg-[#0B1933] border border-[#B6C2D2]/25 rounded-2xl p-6 space-y-5"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center border border-amber-500/30 shrink-0">
                    <Megaphone className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">
                      {editingAnnouncementId ? 'Editar Comunicado Publicado' : 'Publicar Nuevo Comunicado / Novedad'}
                    </h3>
                    <p className="text-xs text-[#94A3B8]">
                      Enviá avisos de nuevas funciones, promociones (ej. Plan Anual) o recordatorios globales que aparecerán en el panel de tus usuarios.
                    </p>
                  </div>
                </div>
                {editingAnnouncementId && (
                  <button
                    type="button"
                    onClick={resetAnnouncementForm}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 cursor-pointer"
                  >
                    Cancelar edición
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="md:col-span-2">
                  <label className="block font-bold text-slate-200 mb-1.5">
                    Título del Comunicado / Novedad: *
                  </label>
                  <input
                    type="text"
                    required
                    value={annTitleInput}
                    onChange={(e) => setAnnTitleInput(e.target.value)}
                    placeholder="Ej. Nueva función: Estado de Cuenta instantáneo por WhatsApp y PDF"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white font-semibold focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-300 mb-1.5">Categoría / Tipo de Aviso:</label>
                  <select
                    value={annCategoryInput}
                    onChange={(e) => setAnnCategoryInput(e.target.value as AnnouncementCategory)}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white font-semibold"
                  >
                    <option value="novedad">Novedad / Nueva Función</option>
                    <option value="promo">Promoción / Plan Anual</option>
                    <option value="aviso_importante">Aviso Importante</option>
                    <option value="mantenimiento">Mantenimiento / Horarios</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-300 mb-1.5">Cuentas Destinatarias:</label>
                  <select
                    value={annAudienceInput}
                    onChange={(e) => setAnnAudienceInput(e.target.value as AnnouncementAudience)}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white font-semibold"
                  >
                    <option value="all">Todas las empresas usuarias</option>
                    <option value="active">Solo cuentas activas / al día</option>
                    <option value="trial">Solo cuentas en prueba gratis (30 días)</option>
                    <option value="paused">Solo cuentas en pausa</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-300 mb-1.5">Botón de Acción Directa (Opcional):</label>
                  <select
                    value={annCtaTypeInput}
                    onChange={(e) => setAnnCtaTypeInput(e.target.value as AnnouncementCtaType)}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white font-semibold"
                  >
                    <option value="none">Solo texto informativo (sin botón)</option>
                    <option value="annual_plan">Abrir Pago / Plan Anual del Abono</option>
                    <option value="contact_support">Abrir Canales de Contacto (WA / Mail)</option>
                    <option value="external_url">Abrir enlace externo personalizado</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-300 mb-1.5">Vigencia / Ocultar automáticamente después del (Opcional):</label>
                  <input
                    type="date"
                    value={annExpiresAtInput}
                    onChange={(e) => setAnnExpiresAtInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono"
                  />
                </div>

                {annCtaTypeInput !== 'none' && (
                  <>
                    <div>
                      <label className="block font-bold text-amber-300 mb-1.5">Texto del Botón (Opcional):</label>
                      <input
                        type="text"
                        value={annCtaLabelInput}
                        onChange={(e) => setAnnCtaLabelInput(e.target.value)}
                        placeholder={
                          annCtaTypeInput === 'annual_plan'
                            ? 'Ej. Ver Plan Anual'
                            : annCtaTypeInput === 'contact_support'
                            ? 'Ej. Consultar Soporte'
                            : 'Ej. Ver más detalle'
                        }
                        className="w-full px-3.5 py-2.5 bg-slate-950 border border-amber-500/40 rounded-xl text-white"
                      />
                    </div>
                    {annCtaTypeInput === 'external_url' && (
                      <div>
                        <label className="block font-bold text-amber-300 mb-1.5">URL del Enlace:</label>
                        <input
                          type="url"
                          value={annCtaUrlInput}
                          onChange={(e) => setAnnCtaUrlInput(e.target.value)}
                          placeholder="https://..."
                          className="w-full px-3.5 py-2.5 bg-slate-950 border border-amber-500/40 rounded-xl text-white font-mono"
                        />
                      </div>
                    )}
                  </>
                )}

                <div className="md:col-span-2">
                  <label className="block font-bold text-slate-200 mb-1.5">Mensaje Completo del Comunicado: *</label>
                  <textarea
                    rows={3}
                    required
                    value={annMessageInput}
                    onChange={(e) => setAnnMessageInput(e.target.value)}
                    placeholder="Escribí aquí el anuncio claro y breve para que todas tus cuentas lo vean al ingresar..."
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white focus:ring-2 focus:ring-amber-400 focus:outline-hidden resize-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="submit"
                  disabled={isSavingAnnouncement}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-[#091428] text-xs font-extrabold inline-flex items-center gap-2 cursor-pointer disabled:opacity-60 transition-colors whitespace-nowrap"
                >
                  <Send className="w-4 h-4" />
                  <span>
                    {isSavingAnnouncement
                      ? 'Publicando...'
                      : editingAnnouncementId
                      ? 'Guardar Cambios del Comunicado'
                      : 'Publicar Comunicado Global'}
                  </span>
                </button>
              </div>
            </form>

            {/* Listado de comunicados emitidos */}
            <div className="bg-[#0B1933] border border-[#B6C2D2]/25 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h4 className="text-sm font-bold text-white">
                  Historial de Comunicados Publicados ({announcements.length})
                </h4>
                <span className="text-xs text-[#94A3B8]">
                  Los avisos activos se muestran automáticamente en el panel superior de cada comercio.
                </span>
              </div>

              {announcements.length === 0 ? (
                <div className="p-8 rounded-xl border border-dashed border-slate-700 text-center text-xs text-slate-400">
                  Todavía no publicaste comunicados. Usá el formulario de arriba para enviar tu primera novedad o aviso a tus usuarios.
                </div>
              ) : (
                <div className="space-y-3">
                  {announcements.map((ann) => {
                    const catLabel =
                      ann.category === 'promo'
                        ? 'Promoción'
                        : ann.category === 'aviso_importante'
                        ? 'Aviso Importante'
                        : ann.category === 'mantenimiento'
                        ? 'Mantenimiento'
                        : 'Novedad';
                    const audienceLabel =
                      ann.audience === 'active'
                        ? 'Solo Activas'
                        : ann.audience === 'trial'
                        ? 'Solo Prueba 30d'
                        : ann.audience === 'paused'
                        ? 'Solo Pausadas'
                        : 'Todas las Cuentas';

                    return (
                      <div
                        key={ann.id}
                        className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          ann.active
                            ? 'bg-[#091428] border-[#B6C2D2]/25'
                            : 'bg-slate-950/60 border-slate-800 opacity-70'
                        }`}
                      >
                        <div className="space-y-1.5 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                ann.active
                                  ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-500/35'
                                  : 'bg-slate-800 text-slate-400 border border-slate-700'
                              }`}
                            >
                              {ann.active ? 'Activo' : 'Pausado'}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-[#162E59] text-[#E2E8F0] text-[10px] font-bold">
                              {catLabel}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-semibold">
                              Público: {audienceLabel}
                            </span>
                            {ann.expiresAt && (
                              <span className="text-[10px] font-mono text-amber-300">
                                Vigente hasta: {ann.expiresAt}
                              </span>
                            )}
                          </div>
                          <h5 className="text-sm font-bold text-white">{ann.title}</h5>
                          <p className="text-xs text-[#CBD5E1]">{ann.message}</p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                          <button
                            type="button"
                            onClick={() => handleToggleAnnouncement(ann)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1 cursor-pointer ${
                              ann.active
                                ? 'bg-slate-800 hover:bg-slate-700 text-amber-300'
                                : 'bg-emerald-700 hover:bg-emerald-600 text-white'
                            }`}
                          >
                            {ann.active ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                            <span>{ann.active ? 'Pausar' : 'Activar'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setEditingAnnouncementId(ann.id);
                              setAnnTitleInput(ann.title);
                              setAnnMessageInput(ann.message);
                              setAnnCategoryInput(ann.category);
                              setAnnAudienceInput(ann.audience);
                              setAnnCtaTypeInput(ann.ctaType || 'none');
                              setAnnCtaLabelInput(ann.ctaLabel || '');
                              setAnnCtaUrlInput(ann.ctaUrl || '');
                              setAnnExpiresAtInput(ann.expiresAt || '');
                            }}
                            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer"
                            title="Editar comunicado"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {confirmDeleteAnnId === ann.id ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleDeleteAnnouncement(ann.id)}
                                className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold cursor-pointer"
                              >
                                Confirmar
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteAnnId(null)}
                                className="px-2 py-1.5 text-[11px] text-slate-400 hover:text-white cursor-pointer"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteAnnId(ann.id)}
                              className="p-2 rounded-lg bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 cursor-pointer"
                              title="Eliminar comunicado"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* MODAL: NEW TENANT (NEW EMPRESA WITH PROVINCE, CITY, ADDRESS, USER & PASS) */}
      {isNewTenantModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-2xl w-full p-6 shadow-2xl relative my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Alta de Nueva Empresa Cliente</h3>
                  <p className="text-xs text-slate-400">
                    Defina los datos de la empresa, ubicación y sus credenciales de acceso privadas
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsNewTenantModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTenant} className="mt-4 space-y-4">
              {/* Row 1: Code/ID & Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Número de ID / Código de Acceso: *
                  </label>
                  <input
                    type="text"
                    required
                    value={tenantFormCode}
                    onChange={(e) => setTenantFormCode(e.target.value.toUpperCase())}
                    placeholder="ej. DIST-004 o BEBIDAS-77"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 font-mono uppercase tracking-wider focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Este ID será el identificador único de la empresa.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Nombre de la Empresa / Razón Social: *
                  </label>
                  <input
                    type="text"
                    required
                    value={tenantFormName}
                    onChange={(e) => setTenantFormName(e.target.value)}
                    placeholder="ej. Distribuidora Sur Alimentos"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Row 2: Provincia & Ciudad */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Provincia:
                  </label>
                  <select
                    value={tenantFormProvince}
                    onChange={(e) => setTenantFormProvince(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  >
                    {PROVINCIAS_ARGENTINA.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Ciudad / Localidad:
                  </label>
                  <input
                    type="text"
                    value={tenantFormCity}
                    onChange={(e) => setTenantFormCity(e.target.value)}
                    placeholder="ej. Mar del Plata, Rosario, Córdoba..."
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Row 3: Dirección & CUIT */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Dirección (Calle y Número):
                  </label>
                  <input
                    type="text"
                    value={tenantFormAddress}
                    onChange={(e) => setTenantFormAddress(e.target.value)}
                    placeholder="ej. Av. Colón 2340"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Modo / Rubro del Sistema:
                  </label>
                  <select
                    value={tenantFormRubro}
                    onChange={(e) => {
                      const nextRubro = e.target.value as BusinessRubro;
                      setTenantFormRubro(nextRubro);
                      setTenantFormCatalogRubro(nextRubro);
                      setTenantFormCategory(getRubroProfile(nextRubro).label);
                    }}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  >
                    {(Object.keys(RUBRO_PROFILES) as BusinessRubro[]).map((rk) => (
                      <option key={rk} value={rk}>
                        {RUBRO_PROFILES[rk].label} ({RUBRO_PROFILES[rk].badgeTag})
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {getRubroProfile(tenantFormRubro).featureBullets[0]}
                  </p>
                </div>
              </div>

              {/* Row 3b: Detalle de actividad & Rubro exclusivo del Catálogo Online */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Rubro Exclusivo del Catálogo Online:
                  </label>
                  <select
                    value={tenantFormCatalogRubro}
                    onChange={(e) => setTenantFormCatalogRubro(e.target.value as BusinessRubro)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  >
                    {(Object.keys(CATALOG_RUBRO_PRESETS) as BusinessRubro[]).map((rk) => (
                      <option key={rk} value={rk}>
                        {CATALOG_RUBRO_PRESETS[rk].label}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-sky-300 mt-1">
                    Filtros iniciales: {getCatalogRubroPreset(tenantFormCatalogRubro).defaultFilters.join(' · ')}
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-300">
                    Descripción / Sub-rubro comercial:
                  </label>
                  <input
                    type="text"
                    value={tenantFormCategory}
                    onChange={(e) => setTenantFormCategory(e.target.value)}
                    placeholder="ej. Bebidas, Ropa, Almacén, Materiales..."
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                  <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer pt-0.5">
                    <input
                      type="checkbox"
                      checked={tenantFormCatalogEnabled}
                      onChange={(e) => setTenantFormCatalogEnabled(e.target.checked)}
                      className="rounded border-slate-600"
                    />
                    <span>Habilitar y lanzar Catálogo Online al crear</span>
                  </label>
                </div>
              </div>

              {/* Row 4: Teléfono & Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Teléfono / WhatsApp de la Empresa:
                  </label>
                  <input
                    type="text"
                    value={tenantFormPhone}
                    onChange={(e) => setTenantFormPhone(e.target.value)}
                    placeholder="ej. +54 9 11 5566-7788"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Email / Correo de la Empresa:
                  </label>
                  <input
                    type="email"
                    value={tenantFormEmail}
                    onChange={(e) => setTenantFormEmail(e.target.value)}
                    placeholder="ej. contacto@empresa.com"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Initial User & Password Section */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-bold text-white">
                      Credenciales de Acceso para el Cliente (Usuario y Contraseña)
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={createInitialUser}
                    onChange={(e) => setCreateInitialUser(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </div>

                {createInitialUser && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                        Nombre del Titular:
                      </label>
                      <input
                        type="text"
                        value={initialOwnerName}
                        onChange={(e) => setInitialOwnerName(e.target.value)}
                        placeholder="ej. Carlos Pérez"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                        Usuario de Ingreso: *
                      </label>
                      <input
                        type="text"
                        required
                        value={initialUsername}
                        onChange={(e) => setInitialUsername(e.target.value)}
                        placeholder="ej. distsur_admin"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                        Contraseña / Clave: *
                      </label>
                      <input
                        type="text"
                        required
                        value={initialPassword}
                        onChange={(e) => setInitialPassword(e.target.value)}
                        placeholder="ej. 1234"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-amber-300 font-mono font-bold"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsNewTenantModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white shadow-md shadow-blue-600/30 flex items-center gap-1.5 cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Crear y Habilitar Empresa</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT TENANT */}
      {editingTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-lg w-full p-6 shadow-2xl relative my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">
                Editar Datos de la Empresa ({editingTenant.tenantCode})
              </h3>
              <button
                onClick={() => setEditingTenant(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditedTenant} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Nombre Comercial:</label>
                <input
                  type="text"
                  required
                  value={editingTenant.name}
                  onChange={(e) => setEditingTenant({ ...editingTenant, name: e.target.value })}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">ID / Código:</label>
                  <input
                    type="text"
                    required
                    value={editingTenant.tenantCode}
                    onChange={(e) =>
                      setEditingTenant({ ...editingTenant, tenantCode: e.target.value.toUpperCase() })
                    }
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Modo / Rubro del Sistema:</label>
                  <select
                    value={editingTenant.businessRubro || editingTenant.config?.businessRubro || 'distribuidora'}
                    onChange={(e) => {
                      const nextRubro = e.target.value as BusinessRubro;
                      setEditingTenant({
                        ...editingTenant,
                        businessRubro: nextRubro,
                        businessCategory: getRubroProfile(nextRubro).label,
                      });
                    }}
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
                  >
                    {(Object.keys(RUBRO_PROFILES) as BusinessRubro[]).map((rk) => (
                      <option key={rk} value={rk}>
                        {RUBRO_PROFILES[rk].label} ({RUBRO_PROFILES[rk].badgeTag})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-300">
                <strong className="text-white">Perfil del rubro:</strong>{' '}
                {getRubroProfile(editingTenant.businessRubro || editingTenant.config?.businessRubro || 'distribuidora').description}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Provincia:</label>
                  <select
                    value={editingTenant.province || 'Buenos Aires'}
                    onChange={(e) => setEditingTenant({ ...editingTenant, province: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
                  >
                    {PROVINCIAS_ARGENTINA.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Ciudad:</label>
                  <input
                    type="text"
                    value={editingTenant.city || ''}
                    onChange={(e) => setEditingTenant({ ...editingTenant, city: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Dirección:</label>
                <input
                  type="text"
                  value={editingTenant.address || ''}
                  onChange={(e) => setEditingTenant({ ...editingTenant, address: e.target.value })}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Teléfono:</label>
                  <input
                    type="text"
                    value={editingTenant.phone || ''}
                    onChange={(e) => setEditingTenant({ ...editingTenant, phone: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Email:</label>
                  <input
                    type="email"
                    value={editingTenant.email || ''}
                    onChange={(e) => setEditingTenant({ ...editingTenant, email: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Rubro Exclusivo del Catálogo Online:
                  </label>
                  <select
                    value={
                      editingTenant.catalogRubro ||
                      editingTenant.businessRubro ||
                      editingTenant.config?.businessRubro ||
                      'distribuidora'
                    }
                    onChange={(e) =>
                      setEditingTenant({
                        ...editingTenant,
                        catalogRubro: e.target.value as BusinessRubro,
                      })
                    }
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
                  >
                    {(Object.keys(CATALOG_RUBRO_PRESETS) as BusinessRubro[]).map((rk) => (
                      <option key={rk} value={rk}>
                        {CATALOG_RUBRO_PRESETS[rk].label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end pb-1">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingTenant.catalogEnabled !== false}
                      onChange={(e) =>
                        setEditingTenant({
                          ...editingTenant,
                          catalogEnabled: e.target.checked,
                        })
                      }
                      className="rounded border-slate-600"
                    />
                    <span>Catálogo Online Habilitado</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingTenant(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white cursor-pointer"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CONFIGURAR RUBRO, FILTROS Y LANZAR CATÁLOGO POR CLIENTE */}
      {catalogConfigModalTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-2xl w-full p-6 shadow-2xl relative my-8 space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-500/20 text-sky-300 flex items-center justify-center shrink-0">
                  <Store className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Rubro y Lanzamiento del Catálogo Online
                  </h3>
                  <p className="text-xs text-slate-400">
                    Cliente: <strong className="text-slate-200">{catalogConfigModalTenant.name}</strong> ({catalogConfigModalTenant.tenantCode})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCatalogConfigModalTenant(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Step 1: Select exclusive Rubro */}
            <div className="space-y-2.5">
              <label className="text-xs font-bold text-slate-200 block">
                1. Seleccioná el rubro exclusivo en el que se cargará este catálogo:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {(Object.keys(CATALOG_RUBRO_PRESETS) as BusinessRubro[]).map((rk) => {
                  const preset = CATALOG_RUBRO_PRESETS[rk];
                  const isSelected = catalogConfigRubro === rk;
                  return (
                    <button
                      key={rk}
                      type="button"
                      onClick={() => handleSelectCatalogConfigRubro(rk)}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-sky-600/20 border-sky-400 text-white ring-1 ring-sky-400/50'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold">{preset.label}</span>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-sky-300 shrink-0" />}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Filtros: <span className="text-slate-200 font-semibold">{preset.defaultFilters.join(', ')}</span>
                      </p>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-sky-300/90 bg-sky-950/40 border border-sky-800/60 rounded-xl px-3 py-2">
                Cada vez que el cliente cargue productos, el catálogo trabajará únicamente dentro del rubro{' '}
                <strong>{getCatalogRubroPreset(catalogConfigRubro).shortLabel}</strong> y aplicará sus filtros.
              </p>
            </div>

            {/* Step 2: Primary Rubro Filters (e.g. Niños, Hombres, Mujeres) */}
            <div className="space-y-2.5 bg-slate-950 border border-slate-800 rounded-2xl p-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-sky-300" />
                  <span>2. Filtros del rubro (ej. Niños, Hombres, Mujeres):</span>
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setCatalogConfigFilters([...getCatalogRubroPreset(catalogConfigRubro).defaultFilters])
                  }
                  className="text-[11px] font-semibold text-sky-400 hover:underline cursor-pointer"
                >
                  Restaurar sugeridos
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {catalogConfigFilters.map((flt) => (
                  <span
                    key={flt}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs font-semibold text-white"
                  >
                    <span>{flt}</span>
                    {catalogConfigFilters.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setCatalogConfigFilters((prev) => prev.filter((item) => item !== flt))
                        }
                        className="text-slate-400 hover:text-rose-400 cursor-pointer"
                        title={`Quitar filtro ${flt}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </span>
                ))}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={catalogConfigFilterDraft}
                  onChange={(e) => setCatalogConfigFilterDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const clean = catalogConfigFilterDraft.trim();
                      if (clean) {
                        setCatalogConfigFilters((prev) => normalizeFilterList([...prev, clean]));
                        setCatalogConfigFilterDraft('');
                      }
                    }
                  }}
                  placeholder="Agregar filtro del rubro (ej. Unisex, Accesorios)..."
                  className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    const clean = catalogConfigFilterDraft.trim();
                    if (!clean) return;
                    setCatalogConfigFilters((prev) => normalizeFilterList([...prev, clean]));
                    setCatalogConfigFilterDraft('');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Agregar</span>
                </button>
              </div>
            </div>

            {/* Step 3: Optional Initial Subfilters */}
            <div className="space-y-2.5 bg-slate-950 border border-slate-800 rounded-2xl p-4">
              <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-emerald-400" />
                <span>3. Subfiltros iniciales (el cliente luego también podrá agregar los suyos):</span>
              </label>

              {catalogConfigSubfilters.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {catalogConfigSubfilters.map((sub) => (
                    <span
                      key={sub}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/60 border border-emerald-700/60 text-xs font-semibold text-emerald-200"
                    >
                      <span>{sub}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setCatalogConfigSubfilters((prev) => prev.filter((item) => item !== sub))
                        }
                        className="text-emerald-300/70 hover:text-rose-400 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-1.5">
                {getCatalogRubroPreset(catalogConfigRubro).suggestedSubfilters.map((sug) => {
                  const alreadyAdded = catalogConfigSubfilters.some(
                    (s) => s.toLowerCase() === sug.toLowerCase()
                  );
                  if (alreadyAdded) return null;
                  return (
                    <button
                      key={sug}
                      type="button"
                      onClick={() =>
                        setCatalogConfigSubfilters((prev) => normalizeFilterList([...prev, sug]))
                      }
                      className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] font-semibold text-slate-300 cursor-pointer"
                    >
                      + {sug}
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={catalogConfigSubfilterDraft}
                  onChange={(e) => setCatalogConfigSubfilterDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const clean = catalogConfigSubfilterDraft.trim();
                      if (clean) {
                        setCatalogConfigSubfilters((prev) => normalizeFilterList([...prev, clean]));
                        setCatalogConfigSubfilterDraft('');
                      }
                    }
                  }}
                  placeholder="Agregar subfiltro personalizado (ej. Invierno, Talles Especiales)..."
                  className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    const clean = catalogConfigSubfilterDraft.trim();
                    if (!clean) return;
                    setCatalogConfigSubfilters((prev) => normalizeFilterList([...prev, clean]));
                    setCatalogConfigSubfilterDraft('');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Agregar</span>
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => handleSaveCatalogConfigAndLaunch(false)}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 cursor-pointer"
              >
                Guardar y Pausar Catálogo
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCatalogConfigModalTenant(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveCatalogConfigAndLaunch(true)}
                  className="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-xs font-bold text-white inline-flex items-center gap-1.5 cursor-pointer shadow-md shadow-sky-600/20"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    Habilitar y Lanzar en {getCatalogRubroPreset(catalogConfigRubro).shortLabel}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: NEW USER FOR A COMPANY */}
      {isNewUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-md w-full p-6 shadow-2xl relative my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Cargar Usuario a Empresa</h3>
                  <p className="text-xs text-slate-400">
                    Defina usuario, contraseña y la empresa correspondiente
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsNewUserModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Empresa Cliente Asignada: *
                </label>
                <select
                  required
                  value={userFormTenantId}
                  onChange={(e) => setUserFormTenantId(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:ring-2 focus:ring-blue-500"
                >
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} (ID: {t.tenantCode})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Rubro Operativo (Perfil de la Cuenta):
                </label>
                <select
                  value={userFormRubro}
                  onChange={(e) => setUserFormRubro(e.target.value as BusinessRubro)}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:ring-2 focus:ring-blue-500"
                >
                  {(Object.keys(RUBRO_PROFILES) as BusinessRubro[]).map((rk) => (
                    <option key={rk} value={rk}>
                      {RUBRO_PROFILES[rk].label} — {RUBRO_PROFILES[rk].badgeTag}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  {getRubroProfile(userFormRubro).featureBullets[0]}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Usuario de Login: *</label>
                  <input
                    type="text"
                    required
                    value={userFormUsername}
                    onChange={(e) => setUserFormUsername(e.target.value)}
                    placeholder="ej. dueno_sur"
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Contraseña: *</label>
                  <input
                    type="text"
                    required
                    value={userFormPassword}
                    onChange={(e) => setUserFormPassword(e.target.value)}
                    placeholder="ej. 1234"
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-amber-300 font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Nombre Completo: *</label>
                <input
                  type="text"
                  required
                  value={userFormFullName}
                  onChange={(e) => setUserFormFullName(e.target.value)}
                  placeholder="ej. Mario Rossi"
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Rol en la Empresa:</label>
                  <select
                    value={userFormRole}
                    onChange={(e) => setUserFormRole(e.target.value as any)}
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
                  >
                    <option value="dueño">Dueño / Titular</option>
                    <option value="administrador">Administrador</option>
                    <option value="vendedor">Vendedor</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Teléfono:</label>
                  <input
                    type="text"
                    value={userFormPhone}
                    onChange={(e) => setUserFormPhone(e.target.value)}
                    placeholder="+54 9 11..."
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Correo Electrónico:</label>
                <input
                  type="email"
                  value={userFormEmail}
                  onChange={(e) => setUserFormEmail(e.target.value)}
                  placeholder="usuario@empresa.com"
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsNewUserModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white shadow-md shadow-blue-600/30 flex items-center gap-1.5 cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Crear Acceso</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT USER */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-md w-full p-6 shadow-2xl relative my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Editar Usuario: {editingUser.username}</h3>
              <button
                onClick={() => setEditingUser(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditedUser} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Nombre Completo:</label>
                <input
                  type="text"
                  required
                  value={editingUser.fullName}
                  onChange={(e) => setEditingUser({ ...editingUser, fullName: e.target.value })}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Contraseña / Clave: *
                </label>
                <input
                  type="text"
                  required
                  value={editingUser.password}
                  onChange={(e) => setEditingUser({ ...editingUser, password: e.target.value })}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-amber-300 font-mono font-bold"
                />
              </div>

              {editingUser.role !== 'superadmin' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">Empresa Asignada:</label>
                    <select
                      value={editingUser.tenantId || ''}
                      onChange={(e) => setEditingUser({ ...editingUser, tenantId: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
                    >
                      {tenants.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} (ID: {t.tenantCode})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      Rubro y Perfil Operativo del Usuario / Empresa:
                    </label>
                    <select
                      value={editingUserRubro}
                      onChange={(e) => setEditingUserRubro(e.target.value as BusinessRubro)}
                      className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
                    >
                      {(Object.keys(RUBRO_PROFILES) as BusinessRubro[]).map((rk) => (
                        <option key={rk} value={rk}>
                          {RUBRO_PROFILES[rk].label} — {RUBRO_PROFILES[rk].badgeTag}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-400 mt-1">
                      {getRubroProfile(editingUserRubro).description}
                    </p>
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Teléfono:</label>
                  <input
                    type="text"
                    value={editingUser.phone || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, phone: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Email:</label>
                  <input
                    type="email"
                    value={editingUser.email || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white cursor-pointer"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT MONTHLY FEE */}
      {editingFeeTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-sm w-full p-6 shadow-2xl relative my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Cuota Mensual SaaS</h3>
                  <p className="text-[11px] text-slate-400">{editingFeeTenant.name}</p>
                </div>
              </div>
              <button
                onClick={() => setEditingFeeTenant(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMonthlyFee} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Monto mensual a cobrar ($ ARS):
                </label>
                <input
                  type="number"
                  min="0"
                  step="500"
                  required
                  value={feeInputValue}
                  onChange={(e) => setFeeInputValue(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-base font-mono font-bold text-emerald-400 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Este importe se usará como referencia en las cobranzas y los recordatorios automáticos de WhatsApp.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingFeeTenant(null)}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white shadow-md cursor-pointer"
                >
                  Guardar Cuota
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL RÁPIDO: EDITAR ALIAS Y CUENTA DE COBRO (DISPONIBLE DESDE CUALQUIER PESTAÑA) */}
      {isEditAliasModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-sky-500/40 rounded-3xl max-w-lg w-full p-6 shadow-2xl relative my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-sky-500/20 text-sky-400 rounded-xl border border-sky-500/30">
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">Alias y Cuenta Receptora de Pagos</h3>
                  <p className="text-[11px] text-slate-400">
                    Modificá tu Alias las veces que necesites. Se actualiza al instante para todas las empresas.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditAliasModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePlatformBillingConfig} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-sky-300 mb-1">
                  Alias donde recibir las transferencias: *
                </label>
                <input
                  type="text"
                  required
                  value={billingAliasInput}
                  onChange={(e) => setBillingAliasInput(e.target.value)}
                  placeholder="ej. mi.alias.mercadopago"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-sky-500/50 rounded-xl text-sm font-mono font-black text-white focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Titular de la Cuenta:</label>
                  <input
                    type="text"
                    value={billingHolderInput}
                    onChange={(e) => setBillingHolderInput(e.target.value)}
                    placeholder="Nombre y Apellido"
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-sky-300 mb-1">CVU / CBU del Gestor General (Dueño):</label>
                  <input
                    type="text"
                    value={billingCvuInput}
                    onChange={(e) => setBillingCvuInput(e.target.value)}
                    placeholder="00000031000... (tu CVU)"
                    className="w-full px-3.5 py-2 bg-slate-950 border border-sky-500/40 rounded-xl text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Link de Pago MP (Opcional):</label>
                  <input
                    type="url"
                    value={billingMpLinkInput}
                    onChange={(e) => setBillingMpLinkInput(e.target.value)}
                    placeholder="https://mpago.la/..."
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Cuota Mensual ($ ARS):</label>
                  <input
                    type="number"
                    min="0"
                    step="500"
                    value={billingDefaultFeeInput}
                    onChange={(e) => setBillingDefaultFeeInput(Number(e.target.value))}
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-emerald-400 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-emerald-300 mb-1">Desc. Plan Anual (%):</label>
                  <input
                    type="number"
                    min="0"
                    max="50"
                    step="1"
                    value={billingAnnualDiscountInput}
                    onChange={(e) => setBillingAnnualDiscountInput(Math.min(50, Math.max(0, Number(e.target.value) || 0)))}
                    className="w-full px-3.5 py-2 bg-slate-950 border border-emerald-500/40 rounded-xl text-emerald-300 font-mono font-bold"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditAliasModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingBillingConfig}
                  className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-xs font-black text-white shadow-md cursor-pointer disabled:opacity-60 flex items-center gap-1.5"
                >
                  <Wallet className="w-4 h-4" />
                  <span>{isSavingBillingConfig ? 'Guardando...' : 'Guardar Alias'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: PREVISUALIZAR COMPROBANTE VERIFICADO */}
      {previewReceiptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-md w-full p-5 shadow-2xl space-y-4 my-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block">
                  Comprobante Verificado Automáticamente
                </span>
                <h3 className="text-sm font-black text-white">
                  {previewReceiptModal.tenantName} • {previewReceiptModal.monthName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewReceiptModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-950 rounded-2xl p-2 border border-slate-800 flex items-center justify-center max-h-[60vh] overflow-hidden">
              <img
                src={previewReceiptModal.imageUrl}
                alt="Comprobante de pago"
                className="max-h-[55vh] w-auto object-contain rounded-xl"
              />
            </div>

            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 text-xs space-y-1">
              {previewReceiptModal.amountPaid !== undefined && (
                <div className="font-bold text-emerald-400">
                  Importe acreditado: $ {Number(previewReceiptModal.amountPaid).toLocaleString('es-AR')}
                </div>
              )}
              {previewReceiptModal.mpPaymentId && (
                <div className="font-mono text-slate-300">Operación N°: {previewReceiptModal.mpPaymentId}</div>
              )}
              {previewReceiptModal.summary && (
                <div className="text-slate-400 text-[11px]">{previewReceiptModal.summary}</div>
              )}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setPreviewReceiptModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
