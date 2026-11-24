import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  FilePlus,
  User,
  Bike,
  Calendar,
  DollarSign,
  Upload,
  CheckCircle,
  Clock,
  Plus,
  AlertTriangle,
  Ban,
  ShieldAlert,
  MessageCircle,
  ArrowLeft,
  RotateCcw,
  Percent,
  Layers,
  Tag,
  ShoppingBasket,
  Trash2,
  Edit2,
  UserPlus,
  RefreshCw,
} from 'lucide-react';
import {
  ALLOWED_INSTALLMENT_COUNTS,
  ArgentinaLiveRates,
  DEFAULT_ARGENTINA_RATES_FALLBACK,
  buildInstallmentSuggestionMap,
  computeSuggestedInstallmentInterest,
  fetchArgentinaLiveRates,
} from '../utils/argentinaRates';
import {
  Client,
  Salesperson,
  Boleta,
  DistributorConfig,
  Administrator,
  SaleMode,
  SaleLineItem,
  SaleItemPaymentMode,
} from '../types';
import { addDaysToDate, formatCurrency, formatDateEs, getNextWednesday, getBoletaBalance } from '../utils/alerts';
import { createWhatsAppUrl, generateBlockedChargeOwnerWhatsAppMessage, hasUsablePhone } from '../utils/whatsapp';
import {
  getBusinessLabels,
  calculateInstallmentPlanPreview,
  calculateBasketCheckoutSummary,
  BasketCheckoutSummary,
} from '../utils/businessMode';
import type { ReceiptModalData } from './PaymentReceiptModal';

export interface BasketCheckoutPayload {
  basketId: string;
  baseNumber: string;
  client: Client;
  salesperson: Salesperson;
  saleDate: string;
  termDays: number;
  firstDueDate: string;
  isSigned: boolean;
  notes?: string;
  photoUrl?: string;
  contadoMethod: 'efectivo' | 'transferencia' | 'cheque' | 'otro';
  summary: BasketCheckoutSummary;
  installmentsCount: number;
  interestPercent: number;
}

interface NewBoletaModalProps {
  isOpen: boolean;
  onClose: () => void;
  clients: Client[];
  salespeople: Salesperson[];
  boletas: Boleta[];
  admins?: Administrator[];
  config: DistributorConfig;
  onSaveBoleta: (boleta: Omit<Boleta, 'id' | 'remindersLog' | 'createdAt' | 'status'>) => void;
  onSaveBoletaPlan?: (boletasList: Omit<Boleta, 'id' | 'remindersLog' | 'createdAt' | 'status'>[]) => void;
  onSaveBasketOperation?: (payload: BasketCheckoutPayload) => void;
  onOpenReceipt?: (receipt: ReceiptModalData) => void;
  onQuickCreateClient: (client: Client) => void;
  onUpdateClient?: (client: Client) => void;
  onNotifyOwnersBlockedAttempt?: (client: Client, existingBoleta: Boleta) => void;
  preselectedClientId?: string | null;
}

export const NewBoletaModal: React.FC<NewBoletaModalProps> = ({
  isOpen,
  onClose,
  clients,
  salespeople,
  boletas,
  admins = [],
  config,
  onSaveBoleta,
  onSaveBoletaPlan,
  onSaveBasketOperation,
  onOpenReceipt,
  onQuickCreateClient,
  onUpdateClient,
  onNotifyOwnersBlockedAttempt,
  preselectedClientId,
}) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const labels = getBusinessLabels(config);
  const availableSaleModes: { id: SaleMode; label: string }[] = [
    {
      id: 'standard',
      label:
        labels.id === 'distribuidora'
          ? 'Factura / Remito Único'
          : labels.id === 'comercio_fiado'
          ? 'Fiado en Libreta'
          : '1 Producto / Fiado',
    },
    ...(labels.allowBasketMode && !labels.enforceSingleBoleta
      ? [{ id: 'canasto_mixto' as SaleMode, label: 'Canasto por Productos' }]
      : []),
    ...(labels.allowSenaReserva
      ? [
          {
            id: 'sena_reserva' as SaleMode,
            label: labels.id === 'comercio_fiado' ? 'Entrega / Seña' : 'Seña / Reserva',
          },
        ]
      : []),
    ...(labels.allowInstallments
      ? [{ id: 'cuotas_personales' as SaleMode, label: 'Cuotas (2 a 12)' }]
      : []),
  ];
  const showModeSelector = availableSaleModes.length > 1;
  const effectiveSalespeople: Salesperson[] =
    !labels.requireSalesperson || salespeople.length === 0
      ? [
          ...salespeople,
          ...(salespeople.some((s) => s.id === 'mostrador')
            ? []
            : [
                {
                  id: 'mostrador',
                  name: 'Mostrador / Venta Directa',
                  phone: config.distributorPhone || '',
                  email: config.distributorEmail || '',
                  address: '',
                  birthDate: '',
                  zone: 'Local Comercial',
                  active: true,
                },
              ]),
        ]
      : salespeople;

  // Helper to find a client who doesn't currently owe a boleta
  const getInitialAvailableClient = () => {
    const nonDebtor = clients.find(
      (c) => !boletas.some((b) => b.clientId === c.id && b.status === 'pending')
    );
    return nonDebtor ? nonDebtor.id : '';
  };

  // Form states
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [selectedSalespersonId, setSelectedSalespersonId] = useState<string>(
    effectiveSalespeople[0]?.id || 'mostrador'
  );
  const [boletaNumber, setBoletaNumber] = useState<string>(
    `0001-${Math.floor(100000 + Math.random() * 900000)}`
  );
  const [saleDate, setSaleDate] = useState<string>(todayStr);
  const [amount, setAmount] = useState<string>('');
  const [termDays, setTermDays] = useState<number>(config.defaultTermDays || labels.defaultTermDays || 7);
  const [isSigned, setIsSigned] = useState<boolean>(true);
  const [notes, setNotes] = useState<string>('');
  const [itemSummary, setItemSummary] = useState<string>('');
  const [saleMode, setSaleMode] = useState<SaleMode>('standard');
  const [downPaymentStr, setDownPaymentStr] = useState<string>('');
  const [installmentsCount, setInstallmentsCount] = useState<number>(3);
  const [liveRates, setLiveRates] = useState<ArgentinaLiveRates>(DEFAULT_ARGENTINA_RATES_FALLBACK);
  const [isLoadingLiveRates, setIsLoadingLiveRates] = useState<boolean>(false);
  const [hasManualInterestOverride, setHasManualInterestOverride] = useState<boolean>(false);
  const [interestPercentStr, setInterestPercentStr] = useState<string>(() =>
    String(
      computeSuggestedInstallmentInterest({
        installmentsCount: 3,
        intervalDays: 30,
        baseAnnualTna: DEFAULT_ARGENTINA_RATES_FALLBACK.personalLoansTna,
      })
    )
  );
  const [installmentIntervalDays, setInstallmentIntervalDays] = useState<number>(30);
  const [photoUrl, setPhotoUrl] = useState<string>('');
  const [clientSearch, setClientSearch] = useState<string>('');
  const [overrideCreditLimit, setOverrideCreditLimit] = useState<boolean>(false);
  const [isEditingClientLimitInline, setIsEditingClientLimitInline] = useState<boolean>(false);
  const [inlineLimitInput, setInlineLimitInput] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [sequentialNotice, setSequentialNotice] = useState<string | null>(null);
  const [openReceiptOnSave, setOpenReceiptOnSave] = useState<boolean>(labels.id !== 'distribuidora');

  // Dynamic Canasto Mixto state (multiple products, each assignable to Contado Hoy / 1 Pago Fiado / Cuotas)
  const [basketItems, setBasketItems] = useState<SaleLineItem[]>([]);
  const [newItemName, setNewItemName] = useState<string>('');
  const [newItemQty, setNewItemQty] = useState<string>('1');
  const [newItemUnitPrice, setNewItemUnitPrice] = useState<string>('');
  const [newItemMode, setNewItemMode] = useState<SaleItemPaymentMode>('un_pago_fiado');
  const [contadoMethod, setContadoMethod] = useState<'efectivo' | 'transferencia' | 'cheque' | 'otro'>('efectivo');

  // Notified debtor tracking so each unique attempt triggers automatic notice once
  const notifiedDebtorRef = useRef<Set<string>>(new Set());

  // Inline new client modal state
  const [isCreatingClient, setIsCreatingClient] = useState<boolean>(false);
  const [newClientNumber, setNewClientNumber] = useState<string>('');
  const [newClientName, setNewClientName] = useState<string>('');
  const [newClientContact, setNewClientContact] = useState<string>('');
  const [newClientPhone, setNewClientPhone] = useState<string>('');
  const [newClientEmail, setNewClientEmail] = useState<string>('');
  const [newClientAddress, setNewClientAddress] = useState<string>('');
  const [newClientZone, setNewClientZone] = useState<string>('Zona Centro');
  const [newClientCuitOrDni, setNewClientCuitOrDni] = useState<string>('');
  const [newClientNotes, setNewClientNotes] = useState<string>('');
  const [newClientCreditLimit, setNewClientCreditLimit] = useState<string>(
    config.defaultClientCreditLimit && config.defaultClientCreditLimit > 0
      ? String(config.defaultClientCreditLimit)
      : ''
  );
  const [newClientSalespersonId, setNewClientSalespersonId] = useState<string>(
    effectiveSalespeople[0]?.id || 'mostrador'
  );

  // Inline edit existing selected client state
  const [isEditingClientInline, setIsEditingClientInline] = useState<boolean>(false);
  const [editClientDraft, setEditClientDraft] = useState<Partial<Client> | null>(null);

  // Automated notification to owners when an unpaid client is selected / attempted
  const [hasNotifiedOwners, setHasNotifiedOwners] = useState(false);

  // Derived variables
  const selectedClient = clients.find((c) => c.id === selectedClientId);
  const selectedSalesperson =
    effectiveSalespeople.find((s) => s.id === selectedSalespersonId) ||
    effectiveSalespeople[0] || {
      id: 'mostrador',
      name: 'Mostrador / Venta Directa',
      phone: config.distributorPhone || '',
      zone: 'Local',
      active: true,
    };
  const numAmount = parseFloat(amount) || 0;
  const numDownPayment =
    saleMode !== 'standard' ? Math.max(0, Math.min(numAmount, parseFloat(downPaymentStr) || 0)) : 0;
  const numInterestPercent =
    saleMode === 'cuotas_personales' ? Math.max(0, parseFloat(interestPercentStr) || 0) : 0;

  const suggestedInterestForCurrent = computeSuggestedInstallmentInterest({
    installmentsCount,
    intervalDays: installmentIntervalDays,
    baseAnnualTna: liveRates.personalLoansTna,
  });
  const suggestedRateMap = buildInstallmentSuggestionMap(
    liveRates.personalLoansTna,
    installmentIntervalDays
  );

  const calculatedDueDate = addDaysToDate(saleDate || todayStr, termDays);

  const planPreview =
    saleMode === 'cuotas_personales'
      ? calculateInstallmentPlanPreview({
          baseAmount: numAmount,
          downPayment: numDownPayment,
          installmentsCount,
          interestPercent: numInterestPercent,
          intervalDays: installmentIntervalDays,
          saleDate: saleDate || todayStr,
          firstDueDate: calculatedDueDate,
        })
      : null;

  const basketSummary =
    saleMode === 'canasto_mixto'
      ? calculateBasketCheckoutSummary({
          items: basketItems,
          downPaymentOnInstallments: parseFloat(downPaymentStr) || 0,
          installmentsCount,
          interestPercent: Math.max(0, parseFloat(interestPercentStr) || 0),
          intervalDays: installmentIntervalDays,
          saleDate: saleDate || todayStr,
          firstDueDate: calculatedDueDate,
        })
      : null;

  const effectiveFinancedTotal =
    saleMode === 'canasto_mixto' && basketSummary
      ? basketSummary.totalPendingDebtGenerated
      : saleMode === 'cuotas_personales' && planPreview
      ? planPreview.totalFinancedWithInterest
      : Math.max(0, numAmount - numDownPayment);

  const clientPendingBoletas = selectedClientId
    ? boletas.filter((b) => b.clientId === selectedClientId && b.status === 'pending')
    : [];
  const existingPendingBoleta = clientPendingBoletas[0];
  const existingPendingDebtTotal = clientPendingBoletas.reduce(
    (acc, b) => acc + getBoletaBalance(b).balanceDue,
    0
  );

  // Hard block ONLY when single-pending-boleta policy is active
  const isHardBlocked = Boolean(labels.enforceSingleBoleta && existingPendingBoleta);

  const clientCreditLimit =
    selectedClient?.creditLimit && selectedClient.creditLimit > 0 ? selectedClient.creditLimit : 0;
  const projectedTotalDebt =
    (labels.enforceSingleBoleta ? 0 : existingPendingDebtTotal) + effectiveFinancedTotal;
  const isExceedingCreditLimit = Boolean(
    clientCreditLimit > 0 && projectedTotalDebt > clientCreditLimit
  );

  // Calculate elapsed days if boleta exists
  const existingBoletaDaysElapsed = existingPendingBoleta
    ? Math.max(
        0,
        Math.floor(
          (new Date(todayStr).getTime() - new Date(existingPendingBoleta.saleDate).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      )
    : 0;

  // Filter clients by search
  const filteredClients = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
      c.contactPerson?.toLowerCase().includes(clientSearch.toLowerCase()) ||
      c.address?.toLowerCase().includes(clientSearch.toLowerCase()) ||
      (c.clientNumber && c.clientNumber.toLowerCase().includes(clientSearch.toLowerCase()))
  );

  const loadLiveRates = async (forceRefresh = false) => {
    setIsLoadingLiveRates(true);
    try {
      const rates = await fetchArgentinaLiveRates(forceRefresh);
      setLiveRates(rates);
    } finally {
      setIsLoadingLiveRates(false);
    }
  };

  // Auto-sync interest rate from live Argentine BCRA benchmark whenever user picks a cuota count or frequency (unless manually overridden)
  useEffect(() => {
    if (isOpen && !hasManualInterestOverride) {
      setInterestPercentStr(String(suggestedInterestForCurrent));
    }
  }, [isOpen, hasManualInterestOverride, suggestedInterestForCurrent]);

  // When modal opens or rubro changes, reset fields cleanly
  useEffect(() => {
    if (isOpen) {
      const preselectedFound = preselectedClientId
        ? clients.find((c) => c.id === preselectedClientId)
        : undefined;
      const initialId = preselectedFound
        ? preselectedFound.id
        : labels.enforceSingleBoleta
        ? getInitialAvailableClient()
        : '';
      setSelectedClientId(initialId);
      setIsCreatingClient(false);
      setIsEditingClientInline(false);
      setEditClientDraft(null);
      setIsEditingClientLimitInline(false);
      setClientSearch('');
      setNewClientNumber('');
      setNewClientName('');
      setNewClientContact('');
      setNewClientPhone('');
      setNewClientEmail('');
      setNewClientAddress('');
      setNewClientZone('Zona Centro');
      setNewClientCuitOrDni('');
      setNewClientNotes('');
      setSaleMode(
        labels.id === 'ecommerce_kiosco' && labels.allowBasketMode && !labels.enforceSingleBoleta
          ? 'canasto_mixto'
          : 'standard'
      );
      setDownPaymentStr('');
      setItemSummary('');
      setAmount('');
      setNotes('');
      setPhotoUrl('');
      setBasketItems([]);
      setNewItemName('');
      setNewItemQty('1');
      setNewItemUnitPrice('');
      setNewItemMode('un_pago_fiado');
      setInstallmentsCount(3);
      setInstallmentIntervalDays(30);
      setHasManualInterestOverride(false);
      setInterestPercentStr(
        String(
          computeSuggestedInstallmentInterest({
            installmentsCount: 3,
            intervalDays: 30,
            baseAnnualTna: liveRates.personalLoansTna,
          })
        )
      );
      void loadLiveRates(false);
      setTermDays(config.defaultTermDays || labels.defaultTermDays || 7);
      setOpenReceiptOnSave(labels.id !== 'distribuidora');
      setNewClientCreditLimit(
        config.defaultClientCreditLimit && config.defaultClientCreditLimit > 0
          ? String(config.defaultClientCreditLimit)
          : ''
      );
      setNewClientSalespersonId(effectiveSalespeople[0]?.id || 'mostrador');
      setFormError(null);
      setSequentialNotice(null);
      if (initialId) {
        const found = clients.find((c) => c.id === initialId);
        if (found?.assignedSalespersonId) {
          setSelectedSalespersonId(found.assignedSalespersonId);
        }
      } else {
        setSelectedSalespersonId(effectiveSalespeople[0]?.id || 'mostrador');
      }
    }
  }, [isOpen, preselectedClientId, config.businessRubro, config.enforceSinglePendingBoleta]);

  // Automated notification to owners ONLY when hard-blocked under single-boleta rule
  useEffect(() => {
    if (isOpen && isHardBlocked && existingPendingBoleta && selectedClient) {
      const key = `${selectedClient.id}-${existingPendingBoleta.id}`;
      if (!notifiedDebtorRef.current.has(key)) {
        notifiedDebtorRef.current.add(key);
        setHasNotifiedOwners(true);
        if (onNotifyOwnersBlockedAttempt) {
          onNotifyOwnersBlockedAttempt(selectedClient, existingPendingBoleta);
        }
      }
    } else if (!isHardBlocked) {
      setHasNotifiedOwners(false);
    }
  }, [isOpen, isHardBlocked, selectedClientId, existingPendingBoleta, selectedClient, onNotifyOwnersBlockedAttempt]);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setPhotoUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleManualWhatsAppToOwners = () => {
    if (!selectedClient || !existingPendingBoleta) return;
    const targetOwner = admins.find((a) => a.role === 'dueño' || a.receiveAdminAlerts) || admins[0] || {
      name: 'Dueño',
      phone: config.senderPhone || '',
      email: config.senderEmail || '',
      id: 'adm-1',
      role: 'dueño' as const,
      receiveAdminAlerts: true,
    };
    const msg = generateBlockedChargeOwnerWhatsAppMessage(
      selectedClient,
      existingPendingBoleta,
      targetOwner.name,
      config
    );
    const url = createWhatsAppUrl(targetOwner.phone || config.senderPhone || '', msg);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleSelectClient = (clientId: string) => {
    setSelectedClientId(clientId);
    setOverrideCreditLimit(false);
    setIsEditingClientLimitInline(false);
    setIsEditingClientInline(false);
    setEditClientDraft(null);
    setFormError(null);
    const client = clients.find((c) => c.id === clientId);
    if (client?.assignedSalespersonId) {
      setSelectedSalespersonId(client.assignedSalespersonId);
    }
  };

  const handleOpenInlineEditClient = () => {
    if (!selectedClient) return;
    setEditClientDraft({ ...selectedClient });
    setIsEditingClientInline(true);
    setIsEditingClientLimitInline(false);
  };

  const handleSaveInlineClientDetails = () => {
    if (!selectedClient || !editClientDraft || !onUpdateClient) return;
    if (!editClientDraft.name?.trim()) {
      setFormError('El nombre del cliente no puede quedar vacío.');
      return;
    }
    const parsedLimit = Number(editClientDraft.creditLimit);
    onUpdateClient({
      ...selectedClient,
      ...editClientDraft,
      name: editClientDraft.name.trim(),
      contactPerson: editClientDraft.contactPerson?.trim() || editClientDraft.name.trim(),
      phone: editClientDraft.phone?.trim() || '',
      email: editClientDraft.email?.trim() || '',
      address: editClientDraft.address?.trim() || '',
      zone: editClientDraft.zone?.trim() || 'Zona Centro',
      cuitOrDni: editClientDraft.cuitOrDni?.trim() || undefined,
      notes: editClientDraft.notes?.trim() || undefined,
      creditLimit: parsedLimit > 0 ? parsedLimit : undefined,
    });
    setIsEditingClientInline(false);
    setEditClientDraft(null);
    setOverrideCreditLimit(false);
  };

  const handleSaveInlineClientLimit = () => {
    if (!selectedClient || !onUpdateClient) return;
    const parsed = Number(inlineLimitInput);
    onUpdateClient({
      ...selectedClient,
      creditLimit: parsed > 0 ? parsed : undefined,
    });
    setIsEditingClientLimitInline(false);
    setOverrideCreditLimit(false);
  };

  const startCreatingClient = (prefillName = '') => {
    setIsCreatingClient(true);
    setIsEditingClientInline(false);
    if (!newClientNumber) {
      setNewClientNumber(`CLI-${String(clients.length + 1).padStart(3, '0')}`);
    }
    if (prefillName.trim()) {
      setNewClientName(prefillName.trim());
    }
    setNewClientSalespersonId(selectedSalespersonId || effectiveSalespeople[0]?.id || 'mostrador');
    setFormError(null);
  };

  const buildNewClientFromForm = (): Client | null => {
    if (!newClientName.trim()) return null;

    const assignedSeller = effectiveSalespeople.find((s) => s.id === newClientSalespersonId);
    const parsedLimit = Number(newClientCreditLimit);

    return {
      id: `cli-${Date.now()}`,
      clientNumber:
        newClientNumber.trim() || `CLI-${String(clients.length + 1).padStart(3, '0')}`,
      name: newClientName.trim(),
      contactPerson: newClientContact.trim() || newClientName.trim(),
      phone: newClientPhone.trim(),
      email: newClientEmail.trim(),
      address: newClientAddress.trim(),
      zone: newClientZone.trim() || 'Zona Centro',
      cuitOrDni: newClientCuitOrDni.trim() || undefined,
      notes: newClientNotes.trim() || undefined,
      creditLimit: parsedLimit > 0 ? parsedLimit : undefined,
      assignedSalespersonId: newClientSalespersonId,
      assignedSalespersonName: assignedSeller?.name,
      createdAt: todayStr,
    };
  };

  const resetNewClientFormFields = () => {
    setIsCreatingClient(false);
    setNewClientNumber('');
    setNewClientName('');
    setNewClientContact('');
    setNewClientPhone('');
    setNewClientEmail('');
    setNewClientAddress('');
    setNewClientZone('Zona Centro');
    setNewClientCuitOrDni('');
    setNewClientNotes('');
    setNewClientCreditLimit(
      config.defaultClientCreditLimit && config.defaultClientCreditLimit > 0
        ? String(config.defaultClientCreditLimit)
        : ''
    );
  };

  const handleCreateClient = (e: React.FormEvent) => {
    e.preventDefault();
    const newClient = buildNewClientFromForm();
    if (!newClient) {
      setFormError('Ingresá al menos el Nombre del Cliente / Comercio para registrarlo.');
      return;
    }

    onQuickCreateClient(newClient);
    setSelectedClientId(newClient.id);
    if (newClient.assignedSalespersonId) {
      setSelectedSalespersonId(newClient.assignedSalespersonId);
    }
    resetNewClientFormFields();
    setFormError(null);
  };

  const handleAddBasketItem = () => {
    const cleanName = newItemName.trim();
    const qty = Math.max(1, parseFloat(newItemQty) || 1);
    const unit = Math.max(0, parseFloat(newItemUnitPrice) || 0);
    if (!cleanName) {
      setFormError('Escribí el nombre del producto o prenda para agregarlo al canasto.');
      return;
    }
    if (unit <= 0) {
      setFormError('Ingresá un precio unitario mayor a cero para el producto.');
      return;
    }
    setFormError(null);
    const subtotal = Math.round(qty * unit * 100) / 100;
    const item: SaleLineItem = {
      id: `item-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: cleanName,
      quantity: qty,
      unitPrice: unit,
      subtotal,
      paymentMode: newItemMode,
    };
    setBasketItems((prev) => [...prev, item]);
    setNewItemName('');
    setNewItemQty('1');
    setNewItemUnitPrice('');
  };

  const handleChangeBasketItemMode = (itemId: string, nextMode: SaleItemPaymentMode) => {
    setBasketItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, paymentMode: nextMode } : it))
    );
  };

  const handleRemoveBasketItem = (itemId: string) => {
    setBasketItems((prev) => prev.filter((it) => it.id !== itemId));
  };

  const processSubmission = (keepOpenForSameClient: boolean) => {
    setFormError(null);
    setSequentialNotice(null);

    if (isHardBlocked && existingPendingBoleta) {
      setFormError(
        `El cliente "${selectedClient?.name}" ya tiene la boleta #${existingPendingBoleta.boletaNumber} pendiente de cobro.`
      );
      return;
    }

    // Resolve existing client OR seamlessly create the inline new client atomically along with the invoice
    let activeClient: Client | undefined = selectedClient;
    let justCreatedClient = false;

    if (!activeClient && isCreatingClient) {
      const created = buildNewClientFromForm();
      if (!created) {
        setFormError('Completá al menos el Nombre del Cliente / Comercio antes de guardar la factura.');
        return;
      }
      activeClient = created;
      justCreatedClient = true;
    }

    if (!activeClient) {
      setFormError('Seleccioná un cliente existente o completá el registro del cliente nuevo.');
      return;
    }

    // Re-evaluate credit limit cleanly against activeClient (especially if newly created)
    const activeCreditLimit =
      activeClient.creditLimit && activeClient.creditLimit > 0 ? activeClient.creditLimit : 0;
    const activeExistingDebt = justCreatedClient ? 0 : existingPendingDebtTotal;
    const activeProjectedDebt =
      (labels.enforceSingleBoleta ? 0 : activeExistingDebt) + effectiveFinancedTotal;
    const activeExceedsCreditLimit = Boolean(
      activeCreditLimit > 0 && activeProjectedDebt > activeCreditLimit
    );

    const commitNewClientIfNeeded = () => {
      if (justCreatedClient && activeClient) {
        onQuickCreateClient(activeClient);
        setSelectedClientId(activeClient.id);
        if (activeClient.assignedSalespersonId) {
          setSelectedSalespersonId(activeClient.assignedSalespersonId);
        }
        resetNewClientFormFields();
      }
    };

    const activeSalesperson =
      (justCreatedClient &&
        activeClient.assignedSalespersonId &&
        effectiveSalespeople.find((s) => s.id === activeClient!.assignedSalespersonId)) ||
      selectedSalesperson;

    if (saleMode === 'canasto_mixto') {
      if (basketItems.length === 0 || !basketSummary || basketSummary.grandBaseTotal <= 0) {
        setFormError('Agregá al menos un producto con precio al canasto antes de guardar.');
        return;
      }

      if (
        basketSummary.installmentBaseTotal > 0 &&
        (parseFloat(downPaymentStr) || 0) >= basketSummary.installmentBaseTotal
      ) {
        setFormError(
          'La seña sobre los productos en cuotas debe ser menor al total de esos productos.'
        );
        return;
      }

      if (activeExceedsCreditLimit && !overrideCreditLimit) {
        setFormError(
          `El saldo financiado proyectado ($${activeProjectedDebt.toLocaleString('es-AR')}) supera el tope de fiado de ${activeClient.name} ($${activeCreditLimit.toLocaleString('es-AR')}).`
        );
        return;
      }

      commitNewClientIfNeeded();

      const baseNum = boletaNumber.trim() || `0001-${Date.now().toString().slice(-6)}`;
      if (onSaveBasketOperation) {
        onSaveBasketOperation({
          basketId: `bsk-${Date.now()}`,
          baseNumber: baseNum,
          client: activeClient,
          salesperson: activeSalesperson,
          saleDate,
          termDays,
          firstDueDate: calculatedDueDate,
          isSigned,
          notes: notes.trim() || undefined,
          photoUrl: photoUrl || undefined,
          contadoMethod,
          summary: basketSummary,
          installmentsCount,
          interestPercent: Math.max(0, parseFloat(interestPercentStr) || 0),
        });
      }

      if (keepOpenForSameClient) {
        setBasketItems([]);
        setDownPaymentStr('');
        setNotes('');
        setBoletaNumber(`0001-${Math.floor(100000 + Math.random() * 900000)}`);
        setSequentialNotice(
          `Canasto #${baseNum} guardado para ${activeClient.name}. Ya podés cargar otro.`
        );
        return;
      }

      onClose();
      return;
    }

    if (!numAmount || numAmount <= 0) {
      setFormError(`Ingresá un monto válido mayor a cero para la ${labels.saleSingular}.`);
      return;
    }

    if (saleMode !== 'standard' && numDownPayment >= numAmount) {
      setFormError('La seña o entrega inicial debe ser menor al total de la venta para generar saldo a cobrar.');
      return;
    }

    if (activeExceedsCreditLimit && !overrideCreditLimit) {
      setFormError(
        `La deuda proyectada ($${activeProjectedDebt.toLocaleString('es-AR')}) supera el tope de fiado de ${activeClient.name} ($${activeCreditLimit.toLocaleString('es-AR')}). Subí su tope o tildá la autorización por única vez.`
      );
      return;
    }

    commitNewClientIfNeeded();

    const baseNum = boletaNumber.trim() || `0001-${Date.now().toString().slice(-6)}`;

    if (saleMode === 'cuotas_personales' && planPreview && onSaveBoletaPlan) {
      const planId = `plan-${Date.now()}`;
      const planBoletas: Omit<Boleta, 'id' | 'remindersLog' | 'createdAt' | 'status'>[] =
        planPreview.installments.map((inst) => {
          const diffDays = Math.max(
            1,
            Math.round(
              (new Date(inst.dueDate).getTime() - new Date(saleDate || todayStr).getTime()) /
                (1000 * 60 * 60 * 24)
            )
          );
          return {
            boletaNumber: `${baseNum}-C${inst.installmentNumber}/${installmentsCount}`,
            clientId: activeClient!.id,
            clientName: activeClient!.name,
            clientAddress: activeClient!.address,
            clientPhone: activeClient!.phone,
            salespersonId: activeSalesperson.id,
            salespersonName: activeSalesperson.name,
            salespersonPhone: activeSalesperson.phone,
            saleDate,
            amount: inst.amount,
            termDays: diffDays,
            dueDate: inst.dueDate,
            notes: notes.trim() || undefined,
            isSigned,
            photoUrl: photoUrl || undefined,
            saleMode: 'cuotas_personales',
            planId,
            installmentNumber: inst.installmentNumber,
            totalInstallments: installmentsCount,
            baseAmount: numAmount,
            downPayment: numDownPayment > 0 ? numDownPayment : undefined,
            interestRatePercent: numInterestPercent,
            interestPercent: numInterestPercent,
            interestAmount: inst.interestPart,
            itemSummary: itemSummary.trim() || undefined,
          };
        });

      onSaveBoletaPlan(planBoletas);

      if (!keepOpenForSameClient && openReceiptOnSave && onOpenReceipt) {
        onOpenReceipt({
          receiptNumber: `COMP-${baseNum}`,
          boletaNumber: baseNum,
          clientId: activeClient.id,
          clientName: activeClient.name,
          clientAddress: activeClient.address,
          salespersonName: activeSalesperson.name,
          paymentDate: saleDate,
          amountPaidNow: numDownPayment,
          paymentMethod: 'efectivo',
          originalAmount: planPreview.totalOperationValue,
          totalPaidAccumulated: numDownPayment,
          remainingBalance: planPreview.totalFinancedWithInterest,
          receivedBy: activeSalesperson.name,
          notes: itemSummary.trim() || notes.trim() || undefined,
          basketSummaryLines: planPreview.installments.map(
            (i) =>
              `Cuota ${i.installmentNumber}/${installmentsCount}: ${formatCurrency(
                i.amount,
                config.currencySymbol
              )} (Vence ${formatDateEs(i.dueDate)})`
          ),
          isFullSettlement: false,
          initialPhone: activeClient.phone || '',
          saleModeLabel: `PLAN ${installmentsCount} CUOTAS PERSONALES`,
        });
      }

      if (keepOpenForSameClient) {
        setAmount('');
        setItemSummary('');
        setDownPaymentStr('');
        setNotes('');
        setBoletaNumber(`0001-${Math.floor(100000 + Math.random() * 900000)}`);
        setSequentialNotice(
          `Plan #${baseNum} guardado para ${activeClient.name}. Ya podés cargar otra venta.`
        );
        return;
      }

      onClose();
      return;
    }

    const pendingAmount =
      saleMode === 'sena_reserva' ? Math.max(1, numAmount - numDownPayment) : numAmount;

    onSaveBoleta({
      boletaNumber: baseNum,
      clientId: activeClient.id,
      clientName: activeClient.name,
      clientAddress: activeClient.address,
      clientPhone: activeClient.phone,
      salespersonId: activeSalesperson.id,
      salespersonName: activeSalesperson.name,
      salespersonPhone: activeSalesperson.phone,
      saleDate,
      amount: pendingAmount,
      termDays,
      dueDate: calculatedDueDate,
      notes: notes.trim() || undefined,
      isSigned,
      photoUrl: photoUrl || undefined,
      saleMode,
      baseAmount: saleMode === 'sena_reserva' ? numAmount : undefined,
      downPayment: saleMode === 'sena_reserva' && numDownPayment > 0 ? numDownPayment : undefined,
      itemSummary: itemSummary.trim() || undefined,
    });

    if (!keepOpenForSameClient && openReceiptOnSave && onOpenReceipt) {
      onOpenReceipt({
        receiptNumber: `COMP-${baseNum}`,
        boletaNumber: baseNum,
        clientId: activeClient.id,
        clientName: activeClient.name,
        clientAddress: activeClient.address,
        salespersonName: activeSalesperson.name,
        paymentDate: saleDate,
        amountPaidNow: saleMode === 'sena_reserva' ? numDownPayment : 0,
        paymentMethod: 'efectivo',
        originalAmount: numAmount,
        totalPaidAccumulated: saleMode === 'sena_reserva' ? numDownPayment : 0,
        remainingBalance: pendingAmount,
        receivedBy: activeSalesperson.name,
        notes: itemSummary.trim() || notes.trim() || undefined,
        basketSummaryLines: [`Vencimiento: ${formatDateEs(calculatedDueDate)} (${termDays} días)`],
        isFullSettlement: false,
        initialPhone: activeClient.phone || '',
        saleModeLabel:
          saleMode === 'sena_reserva' ? 'RESERVA C/ SEÑA' : 'COMPROBANTE DE COMPRA',
      });
    }

    if (keepOpenForSameClient) {
      setAmount('');
      setItemSummary('');
      setDownPaymentStr('');
      setNotes('');
      setBoletaNumber(`0001-${Math.floor(100000 + Math.random() * 900000)}`);
      setSequentialNotice(
        `${labels.saleSingular} #${baseNum} guardada para ${activeClient.name}. Cargá el próximo producto/venta.`
      );
      return;
    }

    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    processSubmission(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative my-8">
        <div className="flex items-center justify-between border-b pb-4 border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0B1933]/10 dark:bg-[#CBD5E1]/15 text-[#0B1933] dark:text-[#E2E8F0] flex items-center justify-center">
              <FilePlus className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Cargar {labels.saleSingular}
                </h2>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#E9EEF5] dark:bg-[#162E59] text-[#0B1933] dark:text-[#CBD5E1] border border-[#CBD5E1] dark:border-[#B6C2D2]/25">
                  {labels.shortLabel}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {labels.enforceSingleBoleta
                  ? 'Perfil Mayorista: Máximo 1 factura fiada pendiente por cliente + Tope de crédito ($).'
                  : labels.featureBullets[0]}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* CLIENT SELECTOR & QUICK CREATE / INLINE EDIT */}
          <div className="bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/80 space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-blue-600" />
                <span>Cliente / Comercio Destinatario:</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  if (isCreatingClient) {
                    setIsCreatingClient(false);
                  } else {
                    startCreatingClient(clientSearch);
                  }
                }}
                className="text-xs text-blue-600 hover:text-blue-500 dark:text-blue-400 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>{isCreatingClient ? 'Volver a buscar cliente existente' : '+ Registrar cliente nuevo'}</span>
              </button>
            </div>

            {isCreatingClient ? (
              <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-slate-700">
                <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 text-[11px] text-blue-900 dark:text-blue-200">
                  Completá los datos del nuevo cliente acá mismo mientras cargás la factura: podés tocar <strong>Guardar Cliente y Seguir</strong> o ir directo abajo y guardar <strong>factura + cliente juntos</strong>.
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-0.5">Nº de Cliente:</label>
                    <input
                      type="text"
                      placeholder="CLI-001"
                      value={newClientNumber}
                      onChange={(e) => setNewClientNumber(e.target.value)}
                      className="w-full text-xs p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-[10px] font-bold text-slate-500 block mb-0.5">Nombre del Cliente / Comercio:</label>
                    <input
                      type="text"
                      placeholder="Ej. Almacén Los Amigos o María López"
                      value={newClientName}
                      onChange={(e) => setNewClientName(e.target.value)}
                      className="w-full text-xs p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-0.5">Persona a cargo / Titular (opcional):</label>
                    <input
                      type="text"
                      placeholder="Ej. Juan Gómez"
                      value={newClientContact}
                      onChange={(e) => setNewClientContact(e.target.value)}
                      className="w-full text-xs p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-0.5">Teléfono / WhatsApp (opcional):</label>
                    <input
                      type="text"
                      placeholder="+54 9 11 ... (si lo tenés)"
                      value={newClientPhone}
                      onChange={(e) => setNewClientPhone(e.target.value)}
                      className="w-full text-xs p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-0.5">Dirección (opcional):</label>
                    <input
                      type="text"
                      placeholder="Ej. San Martín 1540"
                      value={newClientAddress}
                      onChange={(e) => setNewClientAddress(e.target.value)}
                      className="w-full text-xs p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-0.5">Zona / Barrio:</label>
                    <input
                      type="text"
                      placeholder="Ej. Zona Centro"
                      value={newClientZone}
                      onChange={(e) => setNewClientZone(e.target.value)}
                      className="w-full text-xs p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-0.5">CUIT / DNI (opcional):</label>
                    <input
                      type="text"
                      placeholder="20-33445566-7"
                      value={newClientCuitOrDni}
                      onChange={(e) => setNewClientCuitOrDni(e.target.value)}
                      className="w-full text-xs p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-0.5">Email (opcional):</label>
                    <input
                      type="email"
                      placeholder="cliente@correo.com"
                      value={newClientEmail}
                      onChange={(e) => setNewClientEmail(e.target.value)}
                      className="w-full text-xs p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-0.5">
                      {labels.requireSalesperson ? 'Vendedor a cargo:' : 'Atendido por:'}
                    </label>
                    <select
                      value={newClientSalespersonId}
                      onChange={(e) => setNewClientSalespersonId(e.target.value)}
                      className="w-full text-xs p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-medium"
                    >
                      {effectiveSalespeople.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.zone})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-0.5">
                      Tope de Fiado ({config.currencySymbol}, opcional):
                    </label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <input
                        type="number"
                        min="0"
                        step="1000"
                        placeholder="0 = sin tope"
                        value={newClientCreditLimit}
                        onChange={(e) => setNewClientCreditLimit(e.target.value)}
                        className="flex-1 min-w-[120px] text-xs font-mono font-bold p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                      {[150000, 300000, 1000000].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setNewClientCreditLimit(String(preset))}
                          className="px-2 py-1.5 rounded-lg text-[10px] font-mono font-semibold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 cursor-pointer"
                        >
                          ${preset.toLocaleString('es-AR')}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-0.5">Notas / Horario de cobro (opcional):</label>
                    <input
                      type="text"
                      placeholder="Ej. Prefiere pagar los viernes"
                      value={newClientNotes}
                      onChange={(e) => setNewClientNotes(e.target.value)}
                      className="w-full text-xs p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <span className="text-[11px] text-slate-500 dark:text-[#94A3B8]">
                    También podés seguir completando la venta abajo y guardar todo junto en un solo clic.
                  </span>
                  <button
                    type="button"
                    onClick={handleCreateClient}
                    className="px-3 py-1.5 bg-[#0B1933] hover:bg-[#162E59] text-white text-xs font-semibold rounded-lg cursor-pointer"
                  >
                    Guardar Cliente y Seleccionar Ahora
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex flex-col sm:flex-row gap-2 mb-2">
                  <input
                    type="text"
                    placeholder="Buscar cliente por nombre, número o dirección..."
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    className="flex-1 text-xs p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                  />
                  {clientSearch.trim().length > 0 && (
                    <button
                      type="button"
                      onClick={() => startCreatingClient(clientSearch)}
                      className="px-3 py-2 rounded-lg bg-[#0B1933] hover:bg-[#162E59] dark:bg-[#E2E8F0] dark:hover:bg-white text-white dark:text-[#091428] text-xs font-bold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Registrar «{clientSearch.trim()}»</span>
                    </button>
                  )}
                </div>

                {filteredClients.length === 0 ? (
                  <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700/60 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-amber-900 dark:text-amber-200">
                      No encontramos ningún cliente llamado <strong>«{clientSearch}»</strong> en tu cartera.
                    </span>
                    <button
                      type="button"
                      onClick={() => startCreatingClient(clientSearch)}
                      className="px-3 py-1.5 rounded-lg bg-[#0B1933] hover:bg-[#162E59] text-white font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Crear Nuevo Cliente Ahora</span>
                    </button>
                  </div>
                ) : (
                  <select
                    value={selectedClientId}
                    onChange={(e) => handleSelectClient(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-medium text-slate-800 dark:text-slate-200"
                    required
                  >
                    <option value="">-- Seleccionar cliente / comercio para cargar {labels.saleSingular} --</option>
                    {filteredClients.map((c) => {
                      const hasPending = boletas.some(
                        (b) => b.clientId === c.id && b.status === 'pending'
                      );
                      const isProblematic = c.creditHistory?.reputationStatus === 'problematico' || (c.creditHistory?.totalPurgedUnpaid || 0) > 0;
                      const isRegular = c.creditHistory?.reputationStatus === 'regular';

                      let tag = '✓ [Confiable]';
                      if (isProblematic) {
                        tag = '🚨 [PROBLEMÁTICO]';
                      } else if (isRegular) {
                        tag = '🟡 [Regular]';
                      }
                      const limitTag = c.creditLimit && c.creditLimit > 0 ? ` · Tope $${c.creditLimit.toLocaleString('es-AR')}` : '';

                      return (
                        <option key={c.id} value={c.id}>
                          {c.clientNumber ? `[${c.clientNumber}] ` : ''}
                          {c.name} — {c.contactPerson} ({c.zone}){limitTag} {tag}{' '}
                          {hasPending
                            ? labels.enforceSingleBoleta
                              ? '⚠️ (TIENE BOLETA FIADA ACTIVA)'
                              : '· (Con saldo abierto)'
                            : ''}
                        </option>
                      );
                    })}
                  </select>
                )}

                {/* Tope de Fiado del Cliente Seleccionado + Edición Rápida de Datos y Tope */}
                {selectedClient && !isHardBlocked && (
                  <div className="mt-2 p-2.5 rounded-lg bg-white dark:bg-[#0B1933] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 space-y-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap tabular-nums">
                        <span className="text-slate-500 dark:text-[#94A3B8]">Tope de fiado asignado:</span>
                        <strong className="font-mono text-[#0B1933] dark:text-white">
                          {clientCreditLimit > 0
                            ? `${config.currencySymbol} ${clientCreditLimit.toLocaleString('es-AR')}`
                            : 'Sin tope fijo'}
                        </strong>
                        {hasUsablePhone(selectedClient.phone) ? (
                          <span className="text-[11px] text-slate-400 font-mono">· {selectedClient.phone}</span>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">· Sin teléfono</span>
                        )}
                      </div>
                      {onUpdateClient && (
                        isEditingClientLimitInline ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min="0"
                              step="1000"
                              placeholder="0 = sin tope"
                              value={inlineLimitInput}
                              onChange={(e) => setInlineLimitInput(e.target.value)}
                              className="w-28 text-xs font-mono p-1 rounded border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-white dark:bg-[#071021]"
                            />
                            <button
                              type="button"
                              onClick={handleSaveInlineClientLimit}
                              className="px-2 py-1 rounded bg-[#0B1933] text-white text-[11px] font-semibold cursor-pointer"
                            >
                              Guardar
                            </button>
                            <button
                              type="button"
                              onClick={() => setIsEditingClientLimitInline(false)}
                              className="px-1.5 py-1 text-[11px] text-slate-500 cursor-pointer"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                if (isEditingClientInline) setIsEditingClientInline(false);
                                else handleOpenInlineEditClient();
                              }}
                              className="text-[11px] font-semibold text-blue-700 dark:text-blue-300 hover:underline inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Edit2 className="w-3 h-3" />
                              <span>{isEditingClientInline ? 'Cerrar edición' : 'Editar datos del cliente'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setInlineLimitInput(clientCreditLimit > 0 ? String(clientCreditLimit) : '');
                                setIsEditingClientLimitInline(true);
                                setIsEditingClientInline(false);
                              }}
                              className="text-[11px] font-semibold text-[#162E59] dark:text-[#CBD5E1] hover:underline cursor-pointer"
                            >
                              Modificar tope
                            </button>
                          </div>
                        )
                      )}
                    </div>

                    {isEditingClientInline && editClientDraft && onUpdateClient && (
                      <div className="pt-2 border-t border-slate-200 dark:border-[#B6C2D2]/15 space-y-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 block mb-0.5">Nombre / Comercio:</label>
                            <input
                              type="text"
                              value={editClientDraft.name || ''}
                              onChange={(e) => setEditClientDraft({ ...editClientDraft, name: e.target.value })}
                              className="w-full text-xs p-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071021]"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 block mb-0.5">Titular / Contacto:</label>
                            <input
                              type="text"
                              value={editClientDraft.contactPerson || ''}
                              onChange={(e) => setEditClientDraft({ ...editClientDraft, contactPerson: e.target.value })}
                              className="w-full text-xs p-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071021]"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 block mb-0.5">Teléfono / WhatsApp:</label>
                            <input
                              type="text"
                              value={editClientDraft.phone || ''}
                              onChange={(e) => setEditClientDraft({ ...editClientDraft, phone: e.target.value })}
                              className="w-full text-xs p-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071021] font-mono"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 block mb-0.5">Dirección:</label>
                            <input
                              type="text"
                              value={editClientDraft.address || ''}
                              onChange={(e) => setEditClientDraft({ ...editClientDraft, address: e.target.value })}
                              className="w-full text-xs p-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071021]"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 block mb-0.5">Zona:</label>
                            <input
                              type="text"
                              value={editClientDraft.zone || ''}
                              onChange={(e) => setEditClientDraft({ ...editClientDraft, zone: e.target.value })}
                              className="w-full text-xs p-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071021]"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 block mb-0.5">CUIT / DNI:</label>
                            <input
                              type="text"
                              value={editClientDraft.cuitOrDni || ''}
                              onChange={(e) => setEditClientDraft({ ...editClientDraft, cuitOrDni: e.target.value })}
                              className="w-full text-xs p-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071021] font-mono"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 block mb-0.5">Email:</label>
                            <input
                              type="email"
                              value={editClientDraft.email || ''}
                              onChange={(e) => setEditClientDraft({ ...editClientDraft, email: e.target.value })}
                              className="w-full text-xs p-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071021]"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 block mb-0.5">Tope Fiado ($):</label>
                            <input
                              type="number"
                              min="0"
                              step="1000"
                              value={editClientDraft.creditLimit || ''}
                              onChange={(e) =>
                                setEditClientDraft({
                                  ...editClientDraft,
                                  creditLimit: e.target.value ? Number(e.target.value) : undefined,
                                })
                              }
                              className="w-full text-xs p-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#071021] font-mono"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setIsEditingClientInline(false)}
                            className="px-2.5 py-1 text-[11px] text-slate-500 hover:bg-slate-100 rounded cursor-pointer"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={handleSaveInlineClientDetails}
                            className="px-3 py-1 rounded bg-[#0B1933] hover:bg-[#162E59] text-white text-[11px] font-bold cursor-pointer"
                          >
                            Guardar Cambios del Cliente
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Banner de Advertencia de Cliente Problemático */}
                {selectedClient && (selectedClient.creditHistory?.reputationStatus === 'problematico' || (selectedClient.creditHistory?.totalPurgedUnpaid || 0) > 0) && (
                  <div className="mt-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black uppercase text-rose-700 dark:text-rose-300">
                            ⚠️ Cliente Problemático / Riesgo Crediticio
                          </span>
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-200 text-rose-900">
                            Historial Moroso
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-700 dark:text-slate-300 mt-0.5 leading-snug">
                          {(selectedClient.creditHistory?.totalPurgedUnpaid || 0) > 0 ? (
                            <>
                              Este cliente tiene <strong>{selectedClient.creditHistory?.totalPurgedUnpaid} boleta(s) purgada(s) sin pagar (&gt;30 días)</strong> por una deuda histórica de <strong>$ {(selectedClient.creditHistory?.totalPurgedDebtAmount || 0).toLocaleString('es-AR')}</strong>.
                            </>
                          ) : (
                            <>
                              Este cliente registra reiterados retrasos de pago y superó frecuentemente los plazos permitidos.
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {!selectedClientId && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 italic">
                    ℹ️ Seleccioná un cliente de la lista para cargar su boleta o creá uno nuevo.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* INFO CARD WHEN MULTI-TICKET CLIENT HAS EXISTING OPEN DEBT */}
          {!isHardBlocked && selectedClient && clientPendingBoletas.length > 0 && (
            <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-300/70 dark:border-amber-700/50 text-xs flex flex-wrap items-center justify-between gap-2">
              <div className="text-amber-950 dark:text-amber-200 tabular-nums">
                <strong>Cuenta corriente abierta:</strong> {selectedClient.name} tiene{' '}
                <strong>{clientPendingBoletas.length}</strong> comprobante(s) pendiente(s) por{' '}
                <strong className="font-mono">
                  {config.currencySymbol} {existingPendingDebtTotal.toLocaleString('es-AR')}
                </strong>
                . Esta venta se sumará a su cuenta.
              </div>
              {clientCreditLimit > 0 && (
                <span className="text-[11px] font-mono font-bold text-slate-600 dark:text-[#CBD5E1] tabular-nums">
                  Disponible:{' '}
                  {config.currencySymbol}{' '}
                  {Math.max(0, clientCreditLimit - existingPendingDebtTotal).toLocaleString('es-AR')}
                </span>
              )}
            </div>
          )}

          {/* 🛑 PROMINENT WARNING & BLOCKING BANNER IF CLIENT ALREADY HAS PENDING BOLETA */}
          {isHardBlocked && existingPendingBoleta && selectedClient && (
            <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/70 border-2 border-rose-500 text-rose-950 dark:text-rose-100 shadow-lg space-y-3 animate-in fade-in slide-in-from-top-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <div className="p-2 rounded-lg bg-rose-600 text-white shrink-0 mt-0.5 shadow-sm">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-black text-sm text-rose-700 dark:text-rose-300 uppercase tracking-tight flex items-center gap-1.5">
                      <span>Crédito Bloqueado: Este cliente ya posee una boleta activa</span>
                    </h3>
                    <p className="text-xs text-rose-800 dark:text-rose-200 font-medium mt-0.5 leading-relaxed">
                      Por control de la distribuidora, <strong>no se puede cargar una segunda boleta fiada</strong> a un cliente que tiene saldo adeudado sin cancelar.
                    </p>
                  </div>
                </div>

                {/* Quick exit button in header */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedClientId('');
                    setClientSearch('');
                  }}
                  className="px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:text-white hover:bg-rose-600 border border-rose-400 rounded-lg transition-colors shrink-0"
                  title="Salir de este cliente"
                >
                  Cambiar cliente
                </button>
              </div>

              {/* DETAILS OF THE EXISTING BOLETA AS REQUESTED BY USER */}
              <div className="bg-white/90 dark:bg-slate-900/90 rounded-xl p-3 border border-rose-200 dark:border-rose-800/80 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-slate-800 dark:text-slate-200 shadow-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    ¿Cuál es la boleta existente?
                  </span>
                  <span className="font-mono font-bold text-rose-600 dark:text-rose-400 text-sm">
                    Boleta Nº {existingPendingBoleta.boletaNumber}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    Monto pendiente adeudado:
                  </span>
                  {(() => {
                    const exBal = getBoletaBalance(existingPendingBoleta);
                    return exBal.hasPartialPayments ? (
                      <div>
                        <span className="font-black text-rose-600 dark:text-rose-400 text-sm">
                          ${exBal.balanceDue.toLocaleString('es-AR')}
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          (Original: ${exBal.originalAmount.toLocaleString('es-AR')} • Entregado: -${exBal.totalPaid.toLocaleString('es-AR')})
                        </span>
                      </div>
                    ) : (
                      <span className="font-black text-slate-900 dark:text-white text-sm">
                        ${existingPendingBoleta.amount.toLocaleString('es-AR')}
                      </span>
                    );
                  })()}
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    ¿De qué fecha es la venta?
                  </span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {formatDateEs(existingPendingBoleta.saleDate)}{' '}
                    <span className="text-rose-600 font-bold">
                      ({existingBoletaDaysElapsed} días transcurridos)
                    </span>
                  </span>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    ¿Cuántos días de vencimiento tiene?
                  </span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {existingPendingBoleta.termDays} días de plazo pactado
                  </span>
                  <span className="text-[11px] text-slate-500 block">
                    Vencimiento: {formatDateEs(existingPendingBoleta.dueDate)}
                  </span>
                </div>

                <div className="sm:col-span-2 pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between text-[11px] text-slate-500 gap-1">
                  <span>
                    Vendedor responsable: <strong>{existingPendingBoleta.salespersonName}</strong>
                  </span>
                  <span className="font-bold text-rose-600 dark:text-rose-400">
                    Acción requerida: Cobrar y registrar pago de esta boleta primero
                  </span>
                </div>
              </div>

              {/* AUTOMATIC NOTIFICATION TO OWNERS BANNER */}
              <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-semibold text-[11px] sm:text-xs">
                    Aviso automático emitido a los dueños: Se notificó que se anuló la carga por existir la boleta #{existingPendingBoleta.boletaNumber} pendiente.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleManualWhatsAppToOwners}
                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold rounded-lg shrink-0 shadow-xs transition-colors self-end sm:self-auto"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>WhatsApp Dueños</span>
                </button>
              </div>

              {/* BUTTONS TO EXIT AND CHOOSE ANOTHER CLIENT WITHOUT BLOCKING */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-rose-200/80 dark:border-rose-800/60">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedClientId('');
                    setClientSearch('');
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow transition-transform active:scale-98"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Salir de este cliente y cargar otra boleta</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedClientId('');
                    setIsCreatingClient(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-xl"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Crear nuevo cliente</span>
                </button>
              </div>
            </div>
          )}

          {/* MODALIDAD DE VENTA SEGÚN PERFIL DE RUBRO */}
          {showModeSelector ? (
            <div className="p-3.5 rounded-xl bg-[#F4F6F9] dark:bg-[#091428] border border-[#CBD5E1] dark:border-[#B6C2D2]/20 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <label className="text-xs font-bold text-[#0B1933] dark:text-white flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-[#162E59] dark:text-[#CBD5E1]" />
                  <span>Modalidad de Operación ({labels.shortLabel}):</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {availableSaleModes.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setSaleMode(m.id);
                        if (m.id === 'cuotas_personales' || m.id === 'canasto_mixto') {
                          setHasManualInterestOverride(false);
                        }
                      }}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer whitespace-nowrap ${
                        saleMode === m.id
                          ? 'bg-[#0B1933] text-white border-[#0B1933] dark:bg-[#E2E8F0] dark:text-[#091428] dark:border-[#E2E8F0]'
                          : 'bg-white dark:bg-[#071021] text-slate-700 dark:text-[#CBD5E1] border-slate-300 dark:border-[#B6C2D2]/25'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* CANASTO MIXTO: CARGA PRODUCTO POR PRODUCTO CON ASIGNACIÓN DINÁMICA */}
              {saleMode === 'canasto_mixto' && (
                <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-[#B6C2D2]/15">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[11px] font-bold text-[#0B1933] dark:text-white flex items-center gap-1.5">
                      <ShoppingBasket className="w-3.5 h-3.5 text-[#162E59] dark:text-[#CBD5E1]" />
                      <span>Armar canasto del cliente (elegí qué va en 1 pago y qué en cuotas)</span>
                    </span>
                    {basketItems.length > 0 && (
                      <div className="flex items-center gap-1.5 text-[10px]">
                        <button
                          type="button"
                          onClick={() =>
                            setBasketItems((prev) =>
                              prev.map((it) => ({ ...it, paymentMode: 'un_pago_fiado' }))
                            )
                          }
                          className="px-2 py-0.5 rounded border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-white dark:bg-[#071021] text-slate-700 dark:text-[#CBD5E1] font-semibold cursor-pointer"
                        >
                          Todos 1 Pago
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setBasketItems((prev) =>
                              prev.map((it) => ({ ...it, paymentMode: 'cuotas' }))
                            )
                          }
                          className="px-2 py-0.5 rounded border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-white dark:bg-[#071021] text-slate-700 dark:text-[#CBD5E1] font-semibold cursor-pointer"
                        >
                          Todos en Cuotas
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Quick Add Item Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end bg-white dark:bg-[#0B1933] p-2.5 rounded-xl border border-[#CBD5E1] dark:border-[#B6C2D2]/25">
                    <div className="sm:col-span-4">
                      <label className="text-[10px] font-semibold text-slate-500 dark:text-[#94A3B8] block mb-0.5">
                        Producto / Prenda
                      </label>
                      <input
                        type="text"
                        placeholder={labels.itemPlaceholder}
                        value={newItemName}
                        onChange={(e) => setNewItemName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddBasketItem();
                          }
                        }}
                        className="w-full text-xs p-2 rounded-lg border border-slate-300 dark:border-[#B6C2D2]/25 bg-[#F8FAFC] dark:bg-[#071021] text-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-[10px] font-semibold text-slate-500 dark:text-[#94A3B8] block mb-0.5">
                        Cant.
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={newItemQty}
                        onChange={(e) => setNewItemQty(e.target.value)}
                        className="w-full text-xs font-mono font-bold p-2 rounded-lg border border-slate-300 dark:border-[#B6C2D2]/25 bg-[#F8FAFC] dark:bg-[#071021] text-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-[10px] font-semibold text-slate-500 dark:text-[#94A3B8] block mb-0.5">
                        Precio Unit. ($)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="10"
                        placeholder="15000"
                        value={newItemUnitPrice}
                        onChange={(e) => setNewItemUnitPrice(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddBasketItem();
                          }
                        }}
                        className="w-full text-xs font-mono font-bold p-2 rounded-lg border border-slate-300 dark:border-[#B6C2D2]/25 bg-[#F8FAFC] dark:bg-[#071021] text-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-[10px] font-semibold text-slate-500 dark:text-[#94A3B8] block mb-0.5">
                        Va en:
                      </label>
                      <select
                        value={newItemMode}
                        onChange={(e) => setNewItemMode(e.target.value as SaleItemPaymentMode)}
                        className="w-full text-[11px] font-semibold p-2 rounded-lg border border-slate-300 dark:border-[#B6C2D2]/25 bg-[#F8FAFC] dark:bg-[#071021] text-slate-900 dark:text-white"
                      >
                        <option value="contado_hoy">1 Pago Hoy</option>
                        <option value="un_pago_fiado">1 Pago Fiado</option>
                        <option value="cuotas">En Cuotas</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <button
                        type="button"
                        onClick={handleAddBasketItem}
                        className="w-full py-2 px-2.5 rounded-lg bg-[#0B1933] hover:bg-[#162E59] dark:bg-[#E2E8F0] dark:hover:bg-white text-white dark:text-[#091428] text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Agregar</span>
                      </button>
                    </div>
                  </div>

                  {/* Added Items List with Dynamic Mode Switch */}
                  {basketItems.length === 0 ? (
                    <div className="p-3 rounded-lg border border-dashed border-[#CBD5E1] dark:border-[#B6C2D2]/25 text-center text-[11px] text-slate-500 dark:text-[#94A3B8]">
                      Agregá productos arriba. En cada fila podés cambiar al instante si entra en <strong>1 Pago Hoy</strong>, <strong>1 Pago Fiado</strong> o <strong>En Cuotas</strong>.
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-52 overflow-y-auto">
                      {basketItems.map((it) => (
                        <div
                          key={it.id}
                          className="p-2 rounded-lg bg-white dark:bg-[#0B1933] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs tabular-nums"
                        >
                          <div className="min-w-0">
                            <span className="font-bold text-[#0B1933] dark:text-white block truncate">
                              {it.quantity}x {it.name}
                            </span>
                            <span className="text-[11px] text-slate-500 dark:text-[#94A3B8] font-mono">
                              {formatCurrency(it.unitPrice, config.currencySymbol)} c/u ={' '}
                              <strong className="text-[#0B1933] dark:text-white">
                                {formatCurrency(it.subtotal, config.currencySymbol)}
                              </strong>
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                            {[
                              { id: 'contado_hoy', label: '1 Pago Hoy' },
                              { id: 'un_pago_fiado', label: '1 Pago Fiado' },
                              { id: 'cuotas', label: 'En Cuotas' },
                            ].map((opt) => (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() =>
                                  handleChangeBasketItemMode(it.id, opt.id as SaleItemPaymentMode)
                                }
                                className={`px-2 py-1 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                                  it.paymentMode === opt.id
                                    ? opt.id === 'contado_hoy'
                                      ? 'bg-emerald-700 text-white border-emerald-700'
                                      : opt.id === 'un_pago_fiado'
                                      ? 'bg-[#0B1933] text-white border-[#0B1933] dark:bg-[#E2E8F0] dark:text-[#091428]'
                                      : 'bg-amber-600 text-white border-amber-600'
                                    : 'bg-[#F8FAFC] dark:bg-[#071021] text-slate-600 dark:text-[#CBD5E1] border-slate-300 dark:border-[#B6C2D2]/20'
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => handleRemoveBasketItem(it.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                              title="Quitar producto del canasto"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Dynamic Basket Payment Controls */}
                  {basketSummary && basketItems.length > 0 && (
                    <div className="space-y-2.5 pt-1">
                      {basketSummary.contadoTotal > 0 && (
                        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 text-xs">
                          <span className="font-semibold text-emerald-900 dark:text-emerald-200">
                            Cobro en el acto ({basketSummary.contadoItems.length} ítem/s en 1 Pago Hoy):{' '}
                            <strong className="font-mono">
                              {formatCurrency(basketSummary.contadoTotal, config.currencySymbol)}
                            </strong>
                          </span>
                          <select
                            value={contadoMethod}
                            onChange={(e) => setContadoMethod(e.target.value as any)}
                            className="text-[11px] font-semibold p-1.5 rounded border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-[#071021]"
                          >
                            <option value="efectivo">Efectivo</option>
                            <option value="transferencia">Transferencia / MP</option>
                            <option value="cheque">Cheque</option>
                            <option value="otro">Otro</option>
                          </select>
                        </div>
                      )}

                      {basketSummary.installmentBaseTotal > 0 && (
                        <div className="p-2.5 rounded-lg bg-white dark:bg-[#0B1933] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 space-y-2.5">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5">
                            <div className="lg:col-span-2">
                              <label className="text-[10px] font-semibold text-slate-600 dark:text-[#CBD5E1] block mb-1">
                                Seña sobre cuotas ($):
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="100"
                                placeholder="0"
                                value={downPaymentStr}
                                onChange={(e) => setDownPaymentStr(e.target.value)}
                                className="w-full text-xs font-mono font-bold p-1.5 rounded border border-slate-300 dark:border-[#B6C2D2]/25 bg-[#F8FAFC] dark:bg-[#071021]"
                              />
                            </div>

                            <div className="lg:col-span-5">
                              <label className="text-[10px] font-semibold text-slate-600 dark:text-[#CBD5E1] block mb-1">
                                Cuotas (2 a 6, saltos 9 y 12):
                              </label>
                              <div className="grid grid-cols-7 gap-1">
                                {ALLOWED_INSTALLMENT_COUNTS.map((cnt) => (
                                  <button
                                    key={cnt}
                                    type="button"
                                    onClick={() => {
                                      setInstallmentsCount(cnt);
                                      setHasManualInterestOverride(false);
                                    }}
                                    className={`py-1 rounded text-center border cursor-pointer leading-tight ${
                                      installmentsCount === cnt
                                        ? 'bg-[#0B1933] text-white border-[#0B1933] dark:bg-[#E2E8F0] dark:text-[#091428]'
                                        : 'bg-[#F8FAFC] dark:bg-[#071021] text-slate-700 dark:text-[#CBD5E1] border-slate-300 dark:border-[#B6C2D2]/25 hover:bg-slate-100'
                                    }`}
                                    title={`${cnt} cuotas · Sugerido AR ${suggestedRateMap[cnt]}%`}
                                  >
                                    <span className="block text-xs font-bold">{cnt}</span>
                                    <span className="block text-[9px] font-mono opacity-80">
                                      {suggestedRateMap[cnt]}%
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="lg:col-span-3">
                              <div className="flex items-center justify-between mb-1">
                                <label className="text-[10px] font-semibold text-slate-600 dark:text-[#CBD5E1]">
                                  Interés cuotas (%):
                                </label>
                                {hasManualInterestOverride &&
                                  Number(interestPercentStr) !== suggestedInterestForCurrent && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setHasManualInterestOverride(false);
                                        setInterestPercentStr(String(suggestedInterestForCurrent));
                                      }}
                                      className="text-[9px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                                    >
                                      Usar {suggestedInterestForCurrent}%
                                    </button>
                                  )}
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = Math.max(0, (parseFloat(interestPercentStr) || 0) - 1);
                                    setHasManualInterestOverride(true);
                                    setInterestPercentStr(String(Math.round(next * 10) / 10));
                                  }}
                                  className="px-2 py-1.5 rounded border border-slate-300 dark:border-[#B6C2D2]/25 bg-[#F8FAFC] dark:bg-[#071021] text-xs font-bold cursor-pointer"
                                  title="Bajar 1%"
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  min="0"
                                  max="300"
                                  step="0.5"
                                  value={interestPercentStr}
                                  onChange={(e) => {
                                    setHasManualInterestOverride(true);
                                    setInterestPercentStr(e.target.value);
                                  }}
                                  className="w-full text-xs font-mono font-bold p-1.5 rounded border border-slate-300 dark:border-[#B6C2D2]/25 bg-[#F8FAFC] dark:bg-[#071021] text-center"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = Math.min(300, (parseFloat(interestPercentStr) || 0) + 1);
                                    setHasManualInterestOverride(true);
                                    setInterestPercentStr(String(Math.round(next * 10) / 10));
                                  }}
                                  className="px-2 py-1.5 rounded border border-slate-300 dark:border-[#B6C2D2]/25 bg-[#F8FAFC] dark:bg-[#071021] text-xs font-bold cursor-pointer"
                                  title="Subir 1%"
                                >
                                  +
                                </button>
                              </div>
                            </div>

                            <div className="lg:col-span-2">
                              <label className="text-[10px] font-semibold text-slate-600 dark:text-[#CBD5E1] block mb-1">
                                Frecuencia:
                              </label>
                              <select
                                value={installmentIntervalDays}
                                onChange={(e) => {
                                  setInstallmentIntervalDays(Number(e.target.value));
                                  setHasManualInterestOverride(false);
                                }}
                                className="w-full text-xs font-semibold p-1.5 rounded border border-slate-300 dark:border-[#B6C2D2]/25 bg-[#F8FAFC] dark:bg-[#071021]"
                              >
                                <option value={7}>Cada 7 días</option>
                                <option value={15}>Cada 15 días</option>
                                <option value={30}>Cada 30 días</option>
                              </select>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-[#F4F6F9] dark:bg-[#071021] border border-[#CBD5E1]/70 dark:border-[#B6C2D2]/15 text-[10px] tabular-nums">
                            <span className="text-slate-600 dark:text-[#CBD5E1] flex items-center gap-1.5 flex-wrap">
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  liveRates.isLive ? 'bg-emerald-500' : 'bg-amber-500'
                                }`}
                              />
                              <strong>{liveRates.sourceLabel}:</strong> Prést. Pers.{' '}
                              <span className="font-mono font-bold">{liveRates.personalLoansTna}% TNA</span> · BADLAR{' '}
                              <span className="font-mono">{liveRates.badlarTna}%</span> · Ref. {formatDateEs(liveRates.referenceDate)}
                            </span>
                            <button
                              type="button"
                              onClick={() => void loadLiveRates(true)}
                              disabled={isLoadingLiveRates}
                              className="inline-flex items-center gap-1 font-bold text-[#0B1933] dark:text-[#E2E8F0] hover:underline cursor-pointer"
                            >
                              <RefreshCw className={`w-3 h-3 ${isLoadingLiveRates ? 'animate-spin' : ''}`} />
                              <span>Actualizar tasa</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Live Basket Summary Strip */}
                      <div className="p-3 rounded-lg bg-[#091428] text-white text-xs space-y-1.5 tabular-nums">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[#CBD5E1]">
                            Total Canasto: <strong className="font-mono text-white">{formatCurrency(basketSummary.totalWithInterest, config.currencySymbol)}</strong>
                            {basketSummary.installmentPlanPreview && basketSummary.installmentPlanPreview.totalInterest > 0 && (
                              <span className="text-[10px] text-[#94A3B8] ml-1.5">
                                (incl. +{formatCurrency(basketSummary.installmentPlanPreview.totalInterest, config.currencySymbol)} interés cuotas)
                              </span>
                            )}
                          </span>
                          <span className="text-emerald-300 font-mono font-bold">
                            Cobrado hoy: {formatCurrency(basketSummary.totalCashCollectedToday, config.currencySymbol)}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-3 text-[11px] text-[#E2E8F0] font-mono">
                          {basketSummary.singleDeferredTotal > 0 && (
                            <span>
                              • 1 Pago Fiado: {formatCurrency(basketSummary.singleDeferredTotal, config.currencySymbol)} (Vto {formatDateEs(calculatedDueDate)})
                            </span>
                          )}
                          {basketSummary.installmentPlanPreview && (
                            <span>
                              • {installmentsCount} Cuotas de {formatCurrency(basketSummary.installmentPlanPreview.installmentBaseAmount, config.currencySymbol)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {saleMode !== 'canasto_mixto' && (saleMode !== 'standard' || labels.id !== 'distribuidora') && (
                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-[#CBD5E1] flex items-center gap-1 mb-1">
                    <Tag className="w-3 h-3" />
                    <span>Detalle de prenda / producto o pedido (opcional):</span>
                  </label>
                  <input
                    type="text"
                    placeholder={
                      labels.id === 'indumentaria'
                        ? 'Ej. 2 Jean Mom talle 40 + 1 Campera Negra'
                        : labels.itemPlaceholder
                    }
                    value={itemSummary}
                    onChange={(e) => setItemSummary(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 dark:border-[#B6C2D2]/25 bg-white dark:bg-[#071021] text-slate-800 dark:text-white"
                  />
                </div>
              )}

              {(saleMode === 'sena_reserva' || saleMode === 'cuotas_personales') && (
                <div className="space-y-2.5 pt-1 border-t border-slate-200 dark:border-[#B6C2D2]/15">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5">
                    <div className={saleMode === 'cuotas_personales' ? 'lg:col-span-2' : 'sm:col-span-2 lg:col-span-4'}>
                      <label className="text-[11px] font-semibold text-slate-600 dark:text-[#CBD5E1] block mb-1">
                        Seña / Entrega Hoy ($):
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="100"
                        placeholder="0 = sin seña"
                        value={downPaymentStr}
                        onChange={(e) => setDownPaymentStr(e.target.value)}
                        className="w-full text-xs font-mono font-bold p-2 rounded-lg border border-slate-300 dark:border-[#B6C2D2]/25 bg-white dark:bg-[#071021]"
                      />
                    </div>

                    {saleMode === 'cuotas_personales' && (
                      <>
                        <div className="lg:col-span-5">
                          <label className="text-[11px] font-semibold text-slate-600 dark:text-[#CBD5E1] block mb-1">
                            Cantidad de cuotas (2 a 6, saltos a 9 y 12):
                          </label>
                          <div className="grid grid-cols-7 gap-1">
                            {ALLOWED_INSTALLMENT_COUNTS.map((cnt) => (
                              <button
                                key={cnt}
                                type="button"
                                onClick={() => {
                                  setInstallmentsCount(cnt);
                                  setHasManualInterestOverride(false);
                                }}
                                className={`py-1.5 rounded-lg text-center border cursor-pointer transition-colors leading-tight ${
                                  installmentsCount === cnt
                                    ? 'bg-[#0B1933] text-white border-[#0B1933] dark:bg-[#E2E8F0] dark:text-[#091428]'
                                    : 'bg-white dark:bg-[#071021] text-slate-700 dark:text-[#CBD5E1] border-slate-300 dark:border-[#B6C2D2]/25 hover:bg-slate-50'
                                }`}
                                title={`${cnt} cuotas · Interés sugerido Argentina: ${suggestedRateMap[cnt]}%`}
                              >
                                <span className="block text-xs font-bold">{cnt}</span>
                                <span className="block text-[9px] font-mono opacity-80">
                                  {suggestedRateMap[cnt]}%
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="lg:col-span-3">
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[11px] font-semibold text-slate-600 dark:text-[#CBD5E1] flex items-center gap-1">
                              <Percent className="w-3 h-3" />
                              <span>Interés plan (%):</span>
                            </label>
                            {hasManualInterestOverride &&
                              Number(interestPercentStr) !== suggestedInterestForCurrent && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setHasManualInterestOverride(false);
                                    setInterestPercentStr(String(suggestedInterestForCurrent));
                                  }}
                                  className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                                >
                                  Sugerido {suggestedInterestForCurrent}%
                                </button>
                              )}
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                const next = Math.max(0, (parseFloat(interestPercentStr) || 0) - 1);
                                setHasManualInterestOverride(true);
                                setInterestPercentStr(String(Math.round(next * 10) / 10));
                              }}
                              className="px-2.5 py-2 rounded-lg border border-slate-300 dark:border-[#B6C2D2]/25 bg-white dark:bg-[#071021] text-xs font-bold cursor-pointer hover:bg-slate-100"
                              title="Disminuir 1%"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="0"
                              max="300"
                              step="0.5"
                              value={interestPercentStr}
                              onChange={(e) => {
                                setHasManualInterestOverride(true);
                                setInterestPercentStr(e.target.value);
                              }}
                              className="w-full text-xs font-mono font-bold p-2 rounded-lg border border-slate-300 dark:border-[#B6C2D2]/25 bg-white dark:bg-[#071021] text-center"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const next = Math.min(300, (parseFloat(interestPercentStr) || 0) + 1);
                                setHasManualInterestOverride(true);
                                setInterestPercentStr(String(Math.round(next * 10) / 10));
                              }}
                              className="px-2.5 py-2 rounded-lg border border-slate-300 dark:border-[#B6C2D2]/25 bg-white dark:bg-[#071021] text-xs font-bold cursor-pointer hover:bg-slate-100"
                              title="Aumentar 1%"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        <div className="lg:col-span-2">
                          <label className="text-[11px] font-semibold text-slate-600 dark:text-[#CBD5E1] block mb-1">
                            Frecuencia:
                          </label>
                          <select
                            value={installmentIntervalDays}
                            onChange={(e) => {
                              setInstallmentIntervalDays(Number(e.target.value));
                              setHasManualInterestOverride(false);
                            }}
                            className="w-full text-xs font-semibold p-2 rounded-lg border border-slate-300 dark:border-[#B6C2D2]/25 bg-white dark:bg-[#071021]"
                          >
                            <option value={7}>Cada 7 días (Semanal)</option>
                            <option value={15}>Cada 15 días (Quincenal)</option>
                            <option value={30}>Cada 30 días (Mensual)</option>
                          </select>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Live Argentine BCRA Benchmark Strip */}
                  {saleMode === 'cuotas_personales' && (
                    <div className="p-2.5 rounded-lg bg-white dark:bg-[#0B1933] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 space-y-1.5 text-[11px] tabular-nums">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap text-slate-700 dark:text-[#CBD5E1]">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              liveRates.isLive ? 'bg-emerald-500' : 'bg-amber-500'
                            }`}
                          />
                          <strong className="text-[#0B1933] dark:text-white">
                            Tasa Argentina ({liveRates.sourceLabel}):
                          </strong>
                          <span>
                            Prést. Personales{' '}
                            <strong className="font-mono text-[#0B1933] dark:text-white">
                              {liveRates.personalLoansTna}% TNA
                            </strong>
                          </span>
                          <span className="text-slate-400">·</span>
                          <span>BADLAR {liveRates.badlarTna}%</span>
                          <span className="text-slate-400">·</span>
                          <span>Dep. 30d {liveRates.deposits30Tna}%</span>
                          <span className="text-[10px] text-slate-500 dark:text-[#94A3B8]">
                            (Act. {formatDateEs(liveRates.referenceDate)})
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => void loadLiveRates(true)}
                          disabled={isLoadingLiveRates}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#F4F6F9] dark:bg-[#071021] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 text-[10px] font-bold text-[#0B1933] dark:text-[#E2E8F0] hover:bg-[#E9EEF5] cursor-pointer"
                        >
                          <RefreshCw className={`w-3 h-3 ${isLoadingLiveRates ? 'animate-spin' : ''}`} />
                          <span>Actualizar en vivo</span>
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500 dark:text-[#94A3B8]">
                        <span>
                          Sugerido hoy para <strong>{installmentsCount} cuotas</strong>:{' '}
                          <strong className="font-mono text-[#0B1933] dark:text-white">
                            {suggestedInterestForCurrent}%
                          </strong>{' '}
                          {hasManualInterestOverride &&
                          Number(interestPercentStr) !== suggestedInterestForCurrent
                            ? `(Editado manualmente a ${Number(interestPercentStr) || 0}%)`
                            : '· Podés subirlo o bajarlo libremente arriba'}
                        </span>
                        <span className="font-mono">
                          2c: {suggestedRateMap[2]}% · 3c: {suggestedRateMap[3]}% · 4c: {suggestedRateMap[4]}% · 5c: {suggestedRateMap[5]}% · 6c: {suggestedRateMap[6]}% · 9c: {suggestedRateMap[9]}% · 12c: {suggestedRateMap[12]}%
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {saleMode === 'cuotas_personales' && planPreview && numAmount > 0 && (
                <div className="p-3 rounded-lg bg-white dark:bg-[#0B1933] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 space-y-2 text-xs tabular-nums">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-slate-500 dark:text-[#94A3B8]">Capital a financiar: </span>
                      <strong className="font-mono">{config.currencySymbol} {planPreview.financedCapital.toLocaleString('es-AR')}</strong>
                      <span className="text-slate-500 dark:text-[#94A3B8] ml-2">
                        (+{numInterestPercent}% = +{config.currencySymbol} {planPreview.totalInterest.toLocaleString('es-AR')})
                      </span>
                    </div>
                    <div className="font-bold text-[#0B1933] dark:text-white">
                      Total final: <span className="font-mono">{config.currencySymbol} {planPreview.totalFinancedWithInterest.toLocaleString('es-AR')}</span> ·{' '}
                      <span className="text-emerald-700 dark:text-emerald-300">
                        {installmentsCount} cuotas de {config.currencySymbol} {planPreview.installmentBaseAmount.toLocaleString('es-AR')}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[10px]">
                    {planPreview.installments.map((inst) => (
                      <span
                        key={inst.installmentNumber}
                        className="px-2 py-0.5 rounded bg-[#F4F6F9] dark:bg-[#071021] border border-[#CBD5E1] dark:border-[#B6C2D2]/20 font-mono"
                      >
                        C{inst.installmentNumber}: {config.currencySymbol} {inst.amount.toLocaleString('es-AR')} ({formatDateEs(inst.dueDate)})
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {saleMode === 'sena_reserva' && numAmount > 0 && (
                <div className="p-2.5 rounded-lg bg-white dark:bg-[#0B1933] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 flex flex-wrap items-center justify-between text-xs tabular-nums">
                  <span>Valor venta: <strong className="font-mono">{config.currencySymbol} {numAmount.toLocaleString('es-AR')}</strong> · Seña hoy: <strong className="font-mono">-{config.currencySymbol} {numDownPayment.toLocaleString('es-AR')}</strong></span>
                  <strong className="text-[#0B1933] dark:text-white font-mono">
                    Saldo pendiente a cobrar: {config.currencySymbol} {Math.max(0, numAmount - numDownPayment).toLocaleString('es-AR')}
                  </strong>
                </div>
              )}
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-[#F4F6F9] dark:bg-[#091428] border border-[#CBD5E1] dark:border-[#B6C2D2]/20 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-[#0B1933] dark:text-[#E2E8F0] font-semibold">
                <Layers className="w-3.5 h-3.5 text-[#162E59] dark:text-[#CBD5E1]" />
                <span>Perfil {labels.shortLabel}: 1 sola factura fiada activa por cliente · Tope de crédito ($)</span>
              </div>
              <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-[#94A3B8]">
                {labels.badgeTag}
              </span>
            </div>
          )}

          {/* Salesperson & Boleta Number */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1 mb-1">
                <Bike className="w-3.5 h-3.5 text-indigo-500" />
                <span>{labels.requireSalesperson ? 'Vendedor asignado:' : 'Vendedor / Caja:'}</span>
              </label>
              <select
                value={selectedSalespersonId}
                onChange={(e) => setSelectedSalespersonId(e.target.value)}
                className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-medium"
                required={labels.requireSalesperson}
              >
                {effectiveSalespeople.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.zone})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Número de {labels.saleSingular}:
              </label>
              <input
                type="text"
                placeholder="0001-00045231"
                value={boletaNumber}
                onChange={(e) => setBoletaNumber(e.target.value)}
                className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-bold text-slate-800 dark:text-slate-200"
                required
              />
            </div>
          </div>

          {/* Sale Date & Amount */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1 mb-1">
                <Calendar className="w-3.5 h-3.5 text-blue-500" />
                <span>Fecha de la Venta (Entrega fiada):</span>
              </label>
              <input
                type="date"
                value={saleDate}
                onChange={(e) => setSaleDate(e.target.value)}
                className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-medium"
                required
              />
            </div>

            {saleMode !== 'canasto_mixto' && (
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1 mb-1">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
                  <span>{saleMode === 'standard' ? `Monto Total de la ${labels.saleSingular} ($):` : 'Precio Total de Venta ($):'}</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="150000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold text-sm"
                  required
                />
              </div>
            )}
          </div>

          {/* Detalle libre de prenda/pedido si no se mostró arriba */}
          {!showModeSelector && labels.id !== 'distribuidora' && (
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Detalle de mercadería / pedido (opcional):
              </label>
              <input
                type="text"
                placeholder={labels.itemPlaceholder}
                value={itemSummary}
                onChange={(e) => setItemSummary(e.target.value)}
                className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
              />
            </div>
          )}

          {/* Term Configuration */}
          <div className="bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-amber-500" />
                <span>{saleMode === 'cuotas_personales' ? 'Vencimiento de 1ª Cuota:' : 'Plazo de Cobro Pactado:'}</span>
              </label>
              <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">
                Vence el {formatDateEs(calculatedDueDate)} ({termDays} días)
              </span>
            </div>

            {/* Quick buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              {labels.suggestedTerms.map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setTermDays(days)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    termDays === days
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {days} días
                </button>
              ))}

              {/* Botón Próximo Miércoles (en distribuidora) */}
              {labels.enforceSingleBoleta && (() => {
                const nextWed = getNextWednesday(saleDate || todayStr);
                const diffDays = nextWed.daysUntil;
                const isWedSelected = calculatedDueDate === nextWed.dateStr;
                return (
                  <button
                    type="button"
                    onClick={() => setTermDays(diffDays)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      isWedSelected
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700 hover:bg-indigo-50'
                    }`}
                    title="Vencer el miércoles próximo más cercano"
                  >
                    📅 Próximo Miércoles ({diffDays}d)
                  </button>
                );
              })()}

              <div className="flex items-center gap-1.5 ml-auto">
                <span className="text-xs text-slate-500">Manual:</span>
                <input
                  type="number"
                  min="1"
                  max="180"
                  value={termDays}
                  onChange={(e) => setTermDays(parseInt(e.target.value) || 1)}
                  className="w-14 text-xs p-1 rounded border border-slate-300 dark:border-slate-700 text-center font-bold"
                />
                <span className="text-xs text-slate-500">días</span>
              </div>
            </div>
          </div>

          {/* Signed Status and Photo Upload */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <input
                type="checkbox"
                id="isSignedCheckbox"
                checked={isSigned}
                onChange={(e) => setIsSigned(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
              />
              <label htmlFor="isSignedCheckbox" className="text-xs text-slate-700 dark:text-slate-300 font-medium cursor-pointer">
                Boleta volvió <strong>firmada de conformidad</strong> (fiada)
              </label>
            </div>

            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <Upload className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-700 dark:text-slate-300">Foto de remito firmado:</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
                <span className="text-[11px] text-blue-600 dark:text-blue-400 font-bold underline">
                  {photoUrl ? 'Cambiar foto' : 'Subir imagen'}
                </span>
              </label>
              {photoUrl && (
                <div className="flex items-center gap-1 text-[11px] text-emerald-600">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Foto lista</span>
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
              Observaciones / Términos de pago acordados:
            </label>
            <input
              type="text"
              placeholder="Ej. Pagará en efectivo cuando pase el vendedor; o contraboleta viernes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
            />
          </div>

          {/* Warning Banner if Amount Exceeds Client Credit Limit */}
          {isExceedingCreditLimit && selectedClient && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-400 dark:border-rose-700 text-rose-950 dark:text-rose-100 space-y-2.5">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-[#991B1B] dark:text-rose-400 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className="font-bold text-[#991B1B] dark:text-rose-300">
                    Supera el Tope de Fiado de {selectedClient.name}
                  </p>
                  <p className="text-[11px] tabular-nums">
                    Deuda total proyectada: <strong className="font-mono">${projectedTotalDebt.toLocaleString('es-AR')}</strong> · Tope configurado: <strong className="font-mono">${clientCreditLimit.toLocaleString('es-AR')}</strong> (Excede por <strong className="font-mono">${(projectedTotalDebt - clientCreditLimit).toLocaleString('es-AR')}</strong>).
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-rose-200 dark:border-rose-800/60">
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={overrideCreditLimit}
                    onChange={(e) => {
                      setOverrideCreditLimit(e.target.checked);
                      setFormError(null);
                    }}
                    className="rounded text-[#991B1B]"
                  />
                  <span>Autorizar excepción por única vez</span>
                </label>

                {onUpdateClient && (
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateClient({ ...selectedClient, creditLimit: projectedTotalDebt });
                      setFormError(null);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-[#0B1933] hover:bg-[#162E59] text-white text-[11px] font-semibold cursor-pointer"
                  >
                    Subir tope del cliente a ${projectedTotalDebt.toLocaleString('es-AR')}
                  </button>
                )}
              </div>
            </div>
          )}

          {sequentialNotice && (
            <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700 text-xs font-semibold text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>{sequentialNotice}</span>
            </div>
          )}

          {formError && (
            <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-700 text-xs font-medium text-rose-800 dark:text-rose-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {!isHardBlocked && (
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-[#CBD5E1] cursor-pointer">
              <input
                type="checkbox"
                checked={saleMode === 'canasto_mixto' ? true : openReceiptOnSave}
                disabled={saleMode === 'canasto_mixto'}
                onChange={(e) => setOpenReceiptOnSave(e.target.checked)}
                className="rounded text-[#0B1933]"
              />
              <span>
                Abrir <strong>Comprobante Visual (PNG + WhatsApp)</strong> automáticamente al guardar
              </span>
            </label>
          )}

          {/* Submit Actions */}
          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              Cancelar
            </button>

            {!isHardBlocked && !labels.enforceSingleBoleta && (selectedClient || (isCreatingClient && newClientName.trim().length > 0)) && (
              <button
                type="button"
                onClick={() => processSubmission(true)}
                className="px-4 py-2.5 text-xs font-bold rounded-lg bg-[#E9EEF5] hover:bg-[#DCE4F0] dark:bg-[#162E59] dark:hover:bg-[#1E3A6D] text-[#0B1933] dark:text-white border border-[#CBD5E1] dark:border-[#B6C2D2]/30 transition-colors cursor-pointer"
                title="Guarda esta venta y mantiene el mismo cliente abierto para cargar otro producto uno por uno"
              >
                Guardar y cargar otro al cliente
              </button>
            )}

            <button
              type="submit"
              disabled={isHardBlocked}
              className={`px-5 py-2.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 ${
                isHardBlocked
                  ? 'bg-rose-900/40 text-rose-300 border border-rose-700/50 cursor-not-allowed opacity-90'
                  : 'bg-[#0B1933] hover:bg-[#162E59] dark:bg-[#E2E8F0] dark:hover:bg-white text-white dark:text-[#091428] cursor-pointer'
              }`}
            >
              {isHardBlocked ? (
                <>
                  <Ban className="w-4 h-4 text-rose-400" />
                  <span>Bloqueado: Cliente ya tiene boleta activa</span>
                </>
              ) : (
                <span>
                  {isCreatingClient
                    ? `Guardar Cliente y ${labels.saleSingular}`
                    : saleMode === 'canasto_mixto'
                    ? 'Guardar Canasto y Emitir Comprobante'
                    : saleMode === 'cuotas_personales'
                    ? `Guardar Plan de ${installmentsCount} Cuotas`
                    : saleMode === 'sena_reserva'
                    ? 'Guardar Reserva / Seña'
                    : `Guardar ${labels.saleSingular}`}
                </span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
