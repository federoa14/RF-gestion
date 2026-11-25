import React, { useState } from 'react';
import {
  Users,
  Search,
  Plus,
  Phone,
  Mail,
  MapPin,
  Building,
  Edit2,
  Trash2,
  DollarSign,
  MessageCircle,
  X,
  Check,
  Bike,
  AlertTriangle,
  CheckCircle2,
  Filter,
  CreditCard,
  Hash,
  LayoutGrid,
  List,
  ShieldAlert,
  Database,
  History,
  Clock,
  FileText,
  Sparkles,
  ShoppingBag,
  Eye,
  Snowflake,
  UserCheck,
} from 'lucide-react';
import {
  Client,
  Boleta,
  Salesperson,
  DistributorConfig,
  CatalogLoyaltyAccount,
  CatalogPickupOrder,
  CatalogProduct,
  OnlineCatalogSettings,
} from '../types';
import { formatCurrency, formatDateEs, getBoletaBalance } from '../utils/alerts';
import { createWhatsAppUrl, hasUsablePhone } from '../utils/whatsapp';
import { getBusinessLabels, ExcessPaymentAllocationPlan } from '../utils/businessMode';
import { analyzeClientPurchaseInsights, formatWeekdayPlural } from '../utils/clientInsights';
import { analyzeColdClientsForIndumentaria } from '../utils/coldClientsRadar';
import { ClientAccountStatementModal } from './ClientAccountStatementModal';
import { ClientDetailModal } from './ClientDetailModal';
import { ColdClientsRadarPanel } from './ColdClientsRadarPanel';
import { ClientStatementQuickShareModal } from './ClientStatementQuickShareModal';
import { WebLoyaltyClientsPanel } from './WebLoyaltyClientsPanel';

interface ClientsManagerProps {
  clients: Client[];
  salespeople: Salesperson[];
  boletas: Boleta[];
  paidBoletas: Boleta[];
  config: DistributorConfig;
  currentDateRef?: string;
  activeUserName?: string;
  onSaveClient: (client: Client) => void;
  onDeleteClient: (clientId: string) => void;
  onSaveClientPhone?: (clientId: string, phone: string) => void;
  onApplyFifoClientPayment?: (
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
  ) => void;
  onNavigateToSalespeople?: () => void;
  onCreateSaleForClient?: (client: Client) => void;
  onQuickSendStatement?: (client: Client) => void;
  initialSection?: 'directory' | 'cold_radar' | 'web_clients';
  catalogEnabled?: boolean;
  webLoyaltyEnabled?: boolean;
  catalogLoyaltyAccounts?: CatalogLoyaltyAccount[];
  catalogOrders?: CatalogPickupOrder[];
  catalogProducts?: CatalogProduct[];
  catalogSettings?: OnlineCatalogSettings;
  catalogPublicUrl?: string;
  onRefreshCatalogLoyaltyAccounts?: () => Promise<void> | void;
  showToast?: (msg: string) => void;
}

export const ClientsManager: React.FC<ClientsManagerProps> = ({
  clients,
  salespeople,
  boletas,
  paidBoletas,
  config,
  currentDateRef,
  activeUserName = 'Administración',
  onSaveClient,
  onDeleteClient,
  onSaveClientPhone,
  onApplyFifoClientPayment,
  onNavigateToSalespeople,
  onCreateSaleForClient,
  onQuickSendStatement,
  initialSection = 'directory',
  catalogEnabled = false,
  webLoyaltyEnabled,
  catalogLoyaltyAccounts = [],
  catalogOrders = [],
  catalogProducts = [],
  catalogSettings = { published: true },
  catalogPublicUrl,
  onRefreshCatalogLoyaltyAccounts,
  showToast,
}) => {
  const canShowWebClients = webLoyaltyEnabled ?? catalogEnabled;
  const labels = getBusinessLabels(config);
  const isIndumentaria = config.businessRubro === 'indumentaria';
  const [sectionMode, setSectionMode] = useState<'directory' | 'cold_radar' | 'web_clients'>(
    isIndumentaria && initialSection === 'cold_radar'
      ? 'cold_radar'
      : canShowWebClients && initialSection === 'web_clients'
      ? 'web_clients'
      : 'directory'
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSellerFilter, setSelectedSellerFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'with_pending' | 'clear' | 'problematic' | 'confiable'>('all');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  React.useEffect(() => {
    if (sectionMode === 'cold_radar' && !isIndumentaria) {
      setSectionMode('directory');
    } else if (sectionMode === 'web_clients' && !canShowWebClients) {
      setSectionMode('directory');
    } else if (isIndumentaria && initialSection === 'cold_radar') {
      setSectionMode('cold_radar');
    } else if (canShowWebClients && initialSection === 'web_clients') {
      setSectionMode('web_clients');
    }
  }, [isIndumentaria, canShowWebClients, initialSection]);

  const coldClientsCount = React.useMemo(() => {
    if (!isIndumentaria) return 0;
    return analyzeColdClientsForIndumentaria({
      clients,
      boletas,
      paidBoletas,
      config,
      senderName: activeUserName,
      thresholdDays: 30,
      referenceDateStr: currentDateRef,
    }).length;
  }, [isIndumentaria, clients, boletas, paidBoletas, config, activeUserName, currentDateRef]);

  // Modal editing
  const [isEditing, setIsEditing] = useState(false);
  const [editingClient, setEditingClient] = useState<Partial<Client> | null>(null);

  // Modal de Ficha 360° del Cliente (Deuda + Últimas Compras + Hábitos y Frecuencia)
  const [detailClient, setDetailClient] = useState<Client | null>(null);
  const [localQuickShareClient, setLocalQuickShareClient] = useState<Client | null>(null);
  // Confirmación inline para eliminar cliente (sin window.confirm)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const triggerQuickSendStatement = (client: Client) => {
    if (onQuickSendStatement) {
      onQuickSendStatement(client);
    } else {
      setLocalQuickShareClient(client);
    }
  };

  // Modal para ver historial crediticio y deudas purgadas (>30 días)
  const [viewingCreditHistoryClient, setViewingCreditHistoryClient] = useState<Client | null>(null);
  // Modal de Cuenta Corriente unificada / Entrega FIFO
  const [statementClient, setStatementClient] = useState<Client | null>(null);

  // Compute stats per client
  const clientStats = clients.map((c) => {
    const clientPendingBoletas = boletas.filter(
      (b) => b.clientId === c.id && b.status === 'pending'
    );
    const clientPaidBoletas = paidBoletas.filter((b) => b.clientId === c.id);

    const activeBoleta = clientPendingBoletas[0];
    const pendingDebt = clientPendingBoletas.reduce(
      (acc, b) => acc + getBoletaBalance(b).balanceDue,
      0
    );
    const totalPaid = clientPaidBoletas.reduce((acc, b) => acc + (b.amount || 0), 0);
    const assignedSeller = salespeople.find((s) => s.id === c.assignedSalespersonId);

    const isProblematic =
      c.creditHistory?.reputationStatus === 'problematico' ||
      (c.creditHistory?.totalPurgedUnpaid || 0) > 0;

    const insights = analyzeClientPurchaseInsights(
      c,
      clientPendingBoletas,
      clientPaidBoletas,
      currentDateRef
    );

    return {
      client: c,
      activeBoleta,
      pendingCount: clientPendingBoletas.length,
      pendingDebt,
      paidCount: clientPaidBoletas.length,
      totalPaid,
      assignedSeller,
      isProblematic,
      insights,
    };
  });

  const filteredStats = clientStats.filter(({ client, activeBoleta, isProblematic }) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      client.name.toLowerCase().includes(term) ||
      client.contactPerson?.toLowerCase().includes(term) ||
      client.address?.toLowerCase().includes(term) ||
      client.zone?.toLowerCase().includes(term) ||
      (client.clientNumber && client.clientNumber.toLowerCase().includes(term)) ||
      (client.phone && client.phone.includes(term));

    const matchesSeller =
      selectedSellerFilter === 'all' || client.assignedSalespersonId === selectedSellerFilter;

    let matchesStatus = true;
    if (statusFilter === 'with_pending') matchesStatus = Boolean(activeBoleta);
    if (statusFilter === 'clear') matchesStatus = !activeBoleta;
    if (statusFilter === 'problematic') matchesStatus = isProblematic;
    if (statusFilter === 'confiable') {
      matchesStatus =
        client.creditHistory?.reputationStatus === 'confiable' ||
        (!client.creditHistory && !activeBoleta);
    }

    return matchesSearch && matchesSeller && matchesStatus;
  });

  const totalClientsCount = clients.length;
  const clientsWithPendingCount = clientStats.filter((c) => c.activeBoleta).length;
  const clientsClearCount = totalClientsCount - clientsWithPendingCount;
  const clientsProblematicCount = clientStats.filter((c) => c.isProblematic).length;
  const clientsConfiableCount = clientStats.filter(
    (c) =>
      c.client.creditHistory?.reputationStatus === 'confiable' ||
      (!c.client.creditHistory && !c.activeBoleta)
  ).length;

  const handleOpenNew = () => {
    const nextNum = `CLI-${String(clients.length + 1).padStart(3, '0')}`;
    setEditingClient({
      id: `cli-${Date.now()}`,
      clientNumber: nextNum,
      name: '',
      contactPerson: '',
      phone: '',
      email: '',
      address: '',
      zone: 'Zona Centro',
      assignedSalespersonId: salespeople[0]?.id || '',
      assignedSalespersonName: salespeople[0]?.name || '',
      cuitOrDni: '',
      creditLimit: config.defaultClientCreditLimit && config.defaultClientCreditLimit > 0 ? config.defaultClientCreditLimit : undefined,
      notes: '',
      createdAt: new Date().toISOString().split('T')[0],
    });
    setIsEditing(true);
  };

  const handleOpenEdit = (c: Client) => {
    setEditingClient({ ...c });
    setIsEditing(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient || !editingClient.name?.trim()) return;

    const assignedSeller = salespeople.find((s) => s.id === editingClient.assignedSalespersonId);
    const parsedLimit = Number(editingClient.creditLimit);

    const clientToSave: Client = {
      ...(editingClient as Client),
      name: editingClient.name.trim(),
      contactPerson: editingClient.contactPerson?.trim() || editingClient.name.trim(),
      phone: editingClient.phone?.trim() || '',
      clientNumber: editingClient.clientNumber?.trim() || `CLI-${Date.now().toString().slice(-4)}`,
      creditLimit: parsedLimit > 0 ? parsedLimit : undefined,
      assignedSalespersonId: editingClient.assignedSalespersonId,
      assignedSalespersonName: assignedSeller?.name,
    };

    onSaveClient(clientToSave);
    setIsEditing(false);
    setEditingClient(null);
  };

  const handleQuickAssignSeller = (clientId: string, newSellerId: string) => {
    const target = clients.find((c) => c.id === clientId);
    if (!target) return;
    const seller = salespeople.find((s) => s.id === newSellerId);
    onSaveClient({
      ...target,
      assignedSalespersonId: newSellerId,
      assignedSalespersonName: seller?.name,
    });
  };

  return (
    <div className="space-y-5">
      {/* Top Banner and Actions */}
      <div className="bg-white dark:bg-[#0B1933] p-5 rounded-xl border border-[#CBD5E1] dark:border-[#B6C2D2]/20 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0B1933] dark:bg-[#162E59] text-white flex items-center justify-center border border-[#B6C2D2]/25">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-[#0B1933] dark:text-white flex items-center gap-2 tabular-nums">
                <span>Central de Clientes</span>
                <span className="text-xs bg-[#E9EEF5] dark:bg-[#162E59] text-[#0B1933] dark:text-[#E2E8F0] px-2.5 py-0.5 rounded-md border border-[#CBD5E1] dark:border-[#B6C2D2]/25 font-mono font-bold">
                  {totalClientsCount} clientes
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-[#94A3B8]">
                Padrón con dirección, teléfono opcional, vendedor asignado y tope de fiado configurable por cliente
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {onNavigateToSalespeople && (
            <button
              type="button"
              onClick={onNavigateToSalespeople}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#F4F6F9] dark:bg-[#0F2142] hover:bg-[#E9EEF5] dark:hover:bg-[#162E59] text-[#0B1933] dark:text-[#E2E8F0] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            >
              <Bike className="w-4 h-4 text-[#162E59] dark:text-[#CBD5E1]" />
              <span>Ver Vendedores ({salespeople.length})</span>
            </button>
          )}

          {/* CREAR NUEVO CLIENTE BUTTON */}
          <button
            type="button"
            onClick={handleOpenNew}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#0B1933] hover:bg-[#162E59] dark:bg-[#E2E8F0] dark:hover:bg-white text-white dark:text-[#091428] rounded-lg text-xs sm:text-sm font-bold transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Crear Nuevo Cliente</span>
          </button>
        </div>
      </div>

      {/* Sub-navigation for Rubro Indumentaria and/or Web Catalog (Clientes Web con DNI) */}
      {(isIndumentaria || canShowWebClients) && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-[#0B1933] px-4 py-2.5 rounded-xl border border-[#CBD5E1] dark:border-[#B6C2D2]/20">
          <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-lg bg-[#F4F6F9] dark:bg-[#071021] border border-[#CBD5E1] dark:border-[#B6C2D2]/20">
            <button
              type="button"
              onClick={() => setSectionMode('directory')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                sectionMode === 'directory'
                  ? 'bg-[#0B1933] text-white dark:bg-[#E2E8F0] dark:text-[#091428]'
                  : 'text-slate-600 dark:text-[#94A3B8] hover:text-[#0B1933] dark:hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Cartera Completa ({totalClientsCount})</span>
            </button>
            {isIndumentaria && (
              <button
                type="button"
                onClick={() => setSectionMode('cold_radar')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  sectionMode === 'cold_radar'
                    ? 'bg-[#0B1933] text-white dark:bg-[#E2E8F0] dark:text-[#091428]'
                    : 'text-slate-600 dark:text-[#94A3B8] hover:text-[#0B1933] dark:hover:text-white'
                }`}
              >
                <Snowflake className="w-3.5 h-3.5" />
                <span>Radar de Clientes Fríos ({coldClientsCount})</span>
              </button>
            )}
            {canShowWebClients && (
              <button
                type="button"
                onClick={() => {
                  setSectionMode('web_clients');
                  void onRefreshCatalogLoyaltyAccounts?.();
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  sectionMode === 'web_clients'
                    ? 'bg-[#0B1933] text-white dark:bg-[#E2E8F0] dark:text-[#091428]'
                    : 'text-slate-600 dark:text-[#94A3B8] hover:text-[#0B1933] dark:hover:text-white'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>Clientes Web (DNI · {catalogLoyaltyAccounts.length})</span>
              </button>
            )}
          </div>
          <span className="text-[11px] text-slate-500 dark:text-[#94A3B8]">
            {sectionMode === 'web_clients'
              ? 'Participantes del Programa de Puntos por DNI · Sugerencias y promos por WhatsApp'
              : isIndumentaria
              ? 'Exclusivo rubro Indumentaria · Detecta inactividad y sugiere qué prenda ofrecer por WhatsApp'
              : 'Clientes Web marcados automáticamente por su DNI para campañas y seguimiento'}
          </span>
        </div>
      )}

      {canShowWebClients && sectionMode === 'web_clients' ? (
        <WebLoyaltyClientsPanel
          loyaltyAccounts={catalogLoyaltyAccounts}
          orders={catalogOrders}
          products={catalogProducts}
          settings={catalogSettings}
          currencySymbol={config.currencySymbol || '$'}
          catalogPublicUrl={catalogPublicUrl}
          onRefreshLoyaltyAccounts={onRefreshCatalogLoyaltyAccounts}
          showToast={showToast}
        />
      ) : isIndumentaria && sectionMode === 'cold_radar' ? (
        <ColdClientsRadarPanel
          clients={clients}
          boletas={boletas}
          paidBoletas={paidBoletas}
          config={config}
          activeUserName={activeUserName}
          currentDateRef={currentDateRef}
          onViewClientDetail={(client) => setDetailClient(client)}
          onMarkClientReactivated={(client, dateStr) =>
            onSaveClient({
              ...client,
              lastReactivationSentAt: dateStr,
            })
          }
          onCreateSaleForClient={onCreateSaleForClient}
        />
      ) : (
        <>
      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nombre de cliente, persona titular, número de cliente, teléfono o dirección..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-xs pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-800 dark:text-slate-200"
            />
          </div>

          {/* Vendedor a cargo ("Cliente de quién es") */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
              <Bike className="w-3.5 h-3.5 text-indigo-500" />
              <span className="text-[11px] font-bold text-slate-500">De quién es:</span>
              <select
                value={selectedSellerFilter}
                onChange={(e) => setSelectedSellerFilter(e.target.value)}
                className="bg-transparent font-medium text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
              >
                <option value="all">Todos los Vendedores ({salespeople.length})</option>
                {salespeople.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.zone})
                  </option>
                ))}
              </select>
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setViewMode('cards')}
                className={`p-1.5 rounded-lg text-xs transition-colors ${
                  viewMode === 'cards'
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-2xs font-bold'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
                title="Vista en tarjetas"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg text-xs transition-colors ${
                  viewMode === 'table'
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-2xs font-bold'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
                title="Vista en tabla / lista central"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Status Chips */}
        <div className="flex gap-2 overflow-x-auto pt-1 no-scrollbar">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              statusFilter === 'all'
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
            }`}
          >
            Todos los Clientes ({totalClientsCount})
          </button>

          <button
            onClick={() => setStatusFilter('problematic')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition-all ${
              statusFilter === 'problematic'
                ? 'bg-rose-700 text-white shadow-xs'
                : 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200 border border-rose-300 dark:border-rose-800 hover:bg-rose-200'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
            <span>🚨 Problemáticos / Riesgo ({clientsProblematicCount})</span>
          </button>

          <button
            onClick={() => setStatusFilter('confiable')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-all ${
              statusFilter === 'confiable'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>🟢 Confiables ({clientsConfiableCount})</span>
          </button>

          <button
            onClick={() => setStatusFilter('with_pending')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition-all ${
              statusFilter === 'with_pending'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Con Boleta Fiada Activa ({clientsWithPendingCount})</span>
          </button>

          <button
            onClick={() => setStatusFilter('clear')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-all ${
              statusFilter === 'clear'
                ? 'bg-slate-700 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Sin Boleta Activa ({clientsClearCount})</span>
          </button>
        </div>
      </div>

      {/* Main Content: Table or Cards */}
      {filteredStats.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
          <Users className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-700" />
          <h3 className="font-bold text-slate-800 dark:text-slate-200">
            No se encontraron clientes con los filtros seleccionados
          </h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Podés dar de alta un nuevo cliente indicando su número, nombre completo, dirección y vendedor asignado.
          </p>
          <button
            onClick={handleOpenNew}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg shadow"
          >
            <Plus className="w-4 h-4" />
            <span>Crear Nuevo Cliente</span>
          </button>
        </div>
      ) : viewMode === 'table' ? (
        /* TABLE VIEW (CENTRAL DE CLIENTES) */
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#0B1933] border-b border-[#B6C2D2]/25 text-[#E2E8F0] font-semibold text-xs">
                  <th className="py-3 px-4">Nº Cliente</th>
                  <th className="py-3 px-4">Cliente / Comercio</th>
                  <th className="py-3 px-4">Tope de Fiado</th>
                  <th className="py-3 px-4">Vendedor ("De quién es")</th>
                  <th className="py-3 px-4">Teléfono & WhatsApp</th>
                  <th className="py-3 px-4">Dirección</th>
                  <th className="py-3 px-4">Estado Boleta Fiada</th>
                  <th className="py-3 px-4">Historial & Reputación</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
                {filteredStats.map(({ client, activeBoleta, pendingCount, pendingDebt, insights }) => (
                  <tr key={client.id} className="hover:bg-slate-50 dark:hover:bg-[#10203E] transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-[#0B1933] dark:text-[#CBD5E1] whitespace-nowrap">
                      {client.clientNumber || '—'}
                    </td>
                    <td
                      onClick={() => setDetailClient(client)}
                      className="py-3 px-4 font-bold text-slate-900 dark:text-white cursor-pointer group"
                      title="Clic para ver ficha completa, últimas compras, qué ofrecerle y cuándo"
                    >
                      <span className="group-hover:underline inline-flex items-center gap-1.5">
                        <span>{client.name}</span>
                        <Eye className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#0B1933] dark:group-hover:text-white" />
                      </span>
                      <span className="block text-[10px] text-slate-400 font-normal">
                        {client.contactPerson && client.contactPerson !== client.name ? `${client.contactPerson} · ` : ''}
                        {client.zone}
                        {insights.lastPurchaseDate ? ` · Últ. compra: ${formatDateEs(insights.lastPurchaseDate)}` : ''}
                      </span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-mono tabular-nums">
                      {client.creditLimit && client.creditLimit > 0 ? (
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(client)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#E9EEF5] dark:bg-[#162E59] text-[#0B1933] dark:text-[#E2E8F0] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 font-bold text-[11px] cursor-pointer hover:bg-[#DCE4F0]"
                          title="Clic para modificar el tope de fiado"
                        >
                          {formatCurrency(client.creditLimit, config.currencySymbol)}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(client)}
                          className="text-[11px] text-slate-400 hover:text-[#0B1933] dark:hover:text-white cursor-pointer"
                        >
                          Sin tope fijo
                        </button>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <select
                        value={client.assignedSalespersonId || ''}
                        onChange={(e) => handleQuickAssignSeller(client.id, e.target.value)}
                        className="text-xs p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-medium"
                      >
                        <option value="">{labels.requireSalesperson ? 'Sin vendedor asignado' : 'Mostrador / Directo'}</option>
                        {salespeople.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {hasUsablePhone(client.phone) ? (
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-slate-600 dark:text-slate-300">{client.phone}</span>
                          <a
                            href={createWhatsAppUrl(
                              client.phone,
                              `Hola ${client.name}, te escribimos de ${config.distributorName}.`
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                            title="Abrir WhatsApp"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Sin teléfono</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400 max-w-xs truncate">
                      {client.address || '—'}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {activeBoleta ? (
                        <div className="inline-flex flex-col">
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 px-2 py-0.5 rounded-md font-mono tabular-nums">
                            <AlertTriangle className="w-3 h-3 text-rose-600" />
                            <span>
                              {pendingCount > 1
                                ? `${pendingCount} comp. (${formatCurrency(pendingDebt, config.currencySymbol)})`
                                : `#${activeBoleta.boletaNumber} (${formatCurrency(pendingDebt, config.currencySymbol)})`}
                            </span>
                          </span>
                          <span className="text-[10px] text-slate-400 mt-0.5">
                            Vto: {formatDateEs(activeBoleta.dueDate)}
                          </span>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-md">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Al día (Habilitado)</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setViewingCreditHistoryClient(client)}
                        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-bold transition-all ${
                          client.creditHistory?.reputationStatus === 'problematico' || (client.creditHistory?.totalPurgedUnpaid || 0) > 0
                            ? 'bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-950 dark:text-rose-200 hover:bg-rose-200'
                            : client.creditHistory?.reputationStatus === 'regular'
                            ? 'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950 dark:text-amber-200 hover:bg-amber-200'
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 hover:bg-emerald-200'
                        }`}
                        title="Ver historial de boletas purgadas y score"
                      >
                        {client.creditHistory?.reputationStatus === 'problematico' || (client.creditHistory?.totalPurgedUnpaid || 0) > 0 ? (
                          <>
                            <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                            <span>🚨 Problemático ({(client.creditHistory?.totalPurgedUnpaid || 0)} purgadas)</span>
                          </>
                        ) : client.creditHistory?.reputationStatus === 'regular' ? (
                          <>
                            <Clock className="w-3.5 h-3.5 text-amber-600" />
                            <span>🟡 Regular (Demoras)</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>🟢 Confiable</span>
                          </>
                        )}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => triggerQuickSendStatement(client)}
                          className="px-2 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                          title="Enviar Estado de Cuenta instantáneo por WhatsApp (Escrito, PNG o PDF)"
                        >
                          <MessageCircle className="w-3 h-3" />
                          <span>Estado WA</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDetailClient(client)}
                          className="px-2 py-1 rounded-lg bg-[#0B1933] hover:bg-[#162E59] dark:bg-[#E2E8F0] dark:hover:bg-white text-white dark:text-[#091428] text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                          title="Ver Ficha 360°, últimas compras y productos frecuentes"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Ficha</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setStatementClient(client)}
                          className="px-2 py-1 rounded-lg bg-[#E9EEF5] hover:bg-[#DCE4F0] dark:bg-[#13264A] dark:hover:bg-[#1B3566] text-[#0B1933] dark:text-[#E2E8F0] text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                          title="Ver Cuenta Corriente unificada y registrar entrega general"
                        >
                          <FileText className="w-3 h-3" />
                          <span>Cta. Cte.</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(client)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-800 cursor-pointer"
                          title="Editar cliente"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {confirmDeleteId === client.id ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteClient(client.id);
                                setConfirmDeleteId(null);
                              }}
                              className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold cursor-pointer"
                            >
                              Eliminar
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-1.5 py-1 rounded text-[10px] text-slate-500 hover:bg-slate-100 cursor-pointer"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(client.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                            title="Eliminar cliente"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* CARDS VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredStats.map(({ client, activeBoleta, pendingCount, pendingDebt, assignedSeller, insights }) => (
            <div
              key={client.id}
              className={`p-4 rounded-2xl border bg-white dark:bg-slate-900 shadow-xs flex flex-col justify-between space-y-3 transition-all ${
                activeBoleta
                  ? 'border-rose-200 dark:border-rose-900/60 ring-1 ring-rose-500/10'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <div>
                {/* Header with Client Number & Zone */}
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-xs bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/80 px-2 py-0.5 rounded-lg">
                      {client.clientNumber || 'S/N'}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                      {client.zone || 'Sin zona'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => triggerQuickSendStatement(client)}
                      className="px-2 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer"
                      title="Enviar Estado de Cuenta instantáneo por WhatsApp (Escrito, PNG o PDF)"
                    >
                      <MessageCircle className="w-3 h-3" />
                      <span>Estado WA</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetailClient(client)}
                      className="px-2 py-1 rounded-lg bg-[#0B1933] hover:bg-[#162E59] dark:bg-[#E2E8F0] dark:hover:bg-white text-white dark:text-[#091428] text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer"
                      title="Ver ficha completa, deudas, últimas compras y hábitos"
                    >
                      <Eye className="w-3 h-3" />
                      <span>Ficha</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatementClient(client)}
                      className="px-2 py-1 rounded-lg bg-[#E9EEF5] hover:bg-[#DCE4F0] dark:bg-[#13264A] dark:hover:bg-[#1B3566] text-[#0B1933] dark:text-[#E2E8F0] text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer"
                      title="Abrir Cuenta Corriente y Estado Unificado"
                    >
                      <FileText className="w-3 h-3" />
                      <span>Cta. Cte.</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(client)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      title="Editar cliente"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    {confirmDeleteId === client.id ? (
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteClient(client.id);
                            setConfirmDeleteId(null);
                          }}
                          className="px-1.5 py-1 rounded bg-rose-600 text-white text-[10px] font-bold cursor-pointer"
                        >
                          Sí
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-1 py-1 text-[10px] text-slate-500 cursor-pointer"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(client.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                        title="Eliminar cliente"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Client Name & Contact Person (Clickable to open Client 360° Insights) */}
                <button
                  type="button"
                  onClick={() => setDetailClient(client)}
                  className="mt-2.5 w-full text-left group cursor-pointer"
                  title="Clic para abrir ficha completa, últimas compras y hábitos de compra"
                >
                  <h3 className="font-black text-base text-slate-900 dark:text-white leading-tight group-hover:underline flex items-center justify-between gap-2">
                    <span>{client.name}</span>
                    <span className="text-[10px] font-semibold text-[#162E59] dark:text-[#CBD5E1] shrink-0">
                      Ver compras →
                    </span>
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 font-semibold mt-0.5">
                    Titular / Persona a cargo: <strong>{client.contactPerson || 'No especificado'}</strong>
                  </p>
                </button>

                {/* Quick Commercial Habit Strip */}
                <div
                  onClick={() => setDetailClient(client)}
                  className="mt-2 p-2 rounded-xl bg-[#F8FAFC] dark:bg-[#071021] border border-[#CBD5E1]/70 dark:border-[#B6C2D2]/15 text-[11px] space-y-1 cursor-pointer hover:border-[#0B1933]/40 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 text-slate-600 dark:text-[#CBD5E1]">
                    <span className="inline-flex items-center gap-1 truncate">
                      <ShoppingBag className="w-3 h-3 text-[#162E59] dark:text-[#94A3B8] shrink-0" />
                      <span>
                        {insights.topItems[0]
                          ? `Frecuente: ${insights.topItems[0].label} (${insights.topItems[0].purchaseCount}x)`
                          : `${insights.totalPurchasesCount} compra(s) registrada(s)`}
                      </span>
                    </span>
                    <span className="font-mono text-[10px] text-slate-500 shrink-0">
                      {insights.lastPurchaseDate ? formatDateEs(insights.lastPurchaseDate) : 'Sin compras'}
                    </span>
                  </div>
                  {insights.topWeekdays[0] && (
                    <div className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-[#94A3B8]">
                      <Sparkles className="w-3 h-3 text-amber-500 shrink-0" />
                      <span className="truncate">
                        Suele comprar los <strong>{formatWeekdayPlural(insights.topWeekdays[0].label)}</strong>
                        {insights.topMonthPeriods[0] ? ` · ${insights.topMonthPeriods[0].label}` : ''}
                      </span>
                    </div>
                  )}
                </div>

                {/* Vendedor a cargo ("Cliente de quién es") */}
                <div className="mt-3 p-2.5 rounded-xl bg-slate-50 dark:bg-[#091428] border border-slate-200 dark:border-[#B6C2D2]/20 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Bike className="w-4 h-4 text-[#162E59] dark:text-[#CBD5E1]" />
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">
                        Cliente de quién es:
                      </span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {assignedSeller ? assignedSeller.name : 'Sin asignar'}
                      </span>
                    </div>
                  </div>

                  <select
                    value={client.assignedSalespersonId || ''}
                    onChange={(e) => handleQuickAssignSeller(client.id, e.target.value)}
                    className="text-[11px] p-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1933] text-slate-700 dark:text-slate-300 font-medium"
                    title="Cambiar vendedor a cargo"
                  >
                    <option value="">Cambiar...</option>
                    {salespeople.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Tope de Fiado configurable por cliente */}
                <div className="mt-2 p-2.5 rounded-xl bg-[#F4F6F9] dark:bg-[#0F2142] border border-[#CBD5E1] dark:border-[#B6C2D2]/20 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-[#94A3B8] block">
                      Tope Máximo de Fiado
                    </span>
                    <span className="font-mono tabular-nums font-bold text-[#0B1933] dark:text-white">
                      {client.creditLimit && client.creditLimit > 0
                        ? formatCurrency(client.creditLimit, config.currencySymbol)
                        : 'Sin tope fijo'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(client)}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white dark:bg-[#0B1933] text-[#0B1933] dark:text-[#E2E8F0] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 hover:bg-[#E9EEF5] cursor-pointer"
                  >
                    Modificar tope
                  </button>
                </div>

                {/* Contact and Address */}
                <div className="space-y-1.5 mt-3 text-xs text-slate-600 dark:text-slate-400">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{client.address || 'Sin dirección cargada'}</span>
                  </div>

                  {hasUsablePhone(client.phone) ? (
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 font-mono">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{client.phone}</span>
                      </span>
                      <a
                        href={createWhatsAppUrl(
                          client.phone,
                          `Hola ${client.name}, te escribimos de ${config.distributorName}.`
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-600 hover:text-emerald-500 text-xs font-bold flex items-center gap-1"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>WhatsApp</span>
                      </a>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-slate-400 italic">
                      <Phone className="w-3.5 h-3.5 shrink-0" />
                      <span>Sin teléfono (se puede agregar al cobrar)</span>
                    </div>
                  )}

                  {client.notes && (
                    <p className="text-[11px] italic bg-slate-50 dark:bg-slate-800/60 p-2 rounded-lg text-slate-500 mt-2">
                      "{client.notes}"
                    </p>
                  )}
                </div>

                {/* Credit History & Problematic Reputation Indicator */}
                <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800">
                  {client.creditHistory?.reputationStatus === 'problematico' || (client.creditHistory?.totalPurgedUnpaid || 0) > 0 ? (
                    <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                        <div className="truncate">
                          <span className="text-[10px] font-black uppercase text-rose-700 dark:text-rose-300 block">
                            🚨 Cliente Problemático / Riesgo
                          </span>
                          <span className="text-[10px] text-rose-600 dark:text-rose-400 truncate block">
                            {(client.creditHistory?.totalPurgedUnpaid || 0) > 0
                              ? `${client.creditHistory?.totalPurgedUnpaid} boleta(s) purgada(s) sin pagar ($ ${(client.creditHistory?.totalPurgedDebtAmount || 0).toLocaleString('es-AR')})`
                              : 'Mora y demoras críticas frecuentes'}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setViewingCreditHistoryClient(client)}
                        className="px-2 py-1 text-[10px] font-bold text-rose-700 hover:text-white hover:bg-rose-600 border border-rose-300 dark:border-rose-800 rounded-lg transition-colors shrink-0"
                      >
                        Historial
                      </button>
                    </div>
                  ) : client.creditHistory?.reputationStatus === 'regular' ? (
                    <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span className="text-[10px] font-bold text-amber-800 dark:text-amber-200">
                          🟡 Pagos con Demoras Ocasionales
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setViewingCreditHistoryClient(client)}
                        className="px-2 py-1 text-[10px] font-bold text-amber-700 hover:text-white hover:bg-amber-600 border border-amber-300 dark:border-amber-800 rounded-lg transition-colors shrink-0"
                      >
                        Historial
                      </button>
                    </div>
                  ) : (
                    <div className="p-1.5 px-2 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                          🟢 Cliente Confiable (Cumplidor)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setViewingCreditHistoryClient(client)}
                        className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
                      >
                        Ver datos
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Status Banner: Active Boleta vs Clear */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                {activeBoleta ? (
                  <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold text-rose-700 dark:text-rose-300 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-rose-600" />
                        <span>
                          {pendingCount > 1
                            ? `${pendingCount} Comprobantes Abiertos:`
                            : `${labels.saleSingular} Activa:`}
                        </span>
                      </span>
                      <span className="font-black text-rose-600 dark:text-rose-400 text-xs font-mono">
                        #{activeBoleta.boletaNumber}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-700 dark:text-slate-300 font-mono tabular-nums">
                      <span>Deuda actual: <strong>{formatCurrency(pendingDebt, config.currencySymbol)}</strong></span>
                      <span>Vto: <strong>{formatDateEs(activeBoleta.dueDate)}</strong></span>
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-0.5">
                      <span className="text-[10px] text-rose-600 dark:text-rose-400 font-bold">
                        {labels.enforceSingleBoleta
                          ? '⛔ Bloqueado hasta cobrar'
                          : `${pendingCount} comprobante(s) en cuenta`}
                      </span>
                      <button
                        type="button"
                        onClick={() => setStatementClient(client)}
                        className="text-[10px] font-bold text-[#0B1933] dark:text-[#E2E8F0] hover:underline cursor-pointer"
                      >
                        Ver Cuenta / Cobrar →
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-between">
                    <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Cuenta al Día</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setStatementClient(client)}
                      className="text-[10px] text-emerald-700 dark:text-emerald-300 font-semibold hover:underline cursor-pointer"
                    >
                      Ver Estado
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
        </>
      )}

      {/* Edit / New Client Modal Form */}
      {isEditing && editingClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050C18]/75 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#0B1933] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 rounded-2xl max-w-xl w-full p-6 shadow-2xl relative my-8">
            <div className="flex items-center justify-between border-b pb-3 mb-4 border-slate-100 dark:border-[#B6C2D2]/15">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#0B1933] dark:bg-[#162E59] text-white flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-[#0B1933] dark:text-white text-base">
                    {editingClient.name ? 'Editar Datos y Tope de Fiado' : 'Cargar Nuevo Cliente en Central'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Completá nombre, dirección, teléfono (si lo tenés) y el tope de fiado para este cliente
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3.5">
              {/* Row 1: Client Number & Commercial Name */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-[#CBD5E1] block mb-1">
                    Número de Cliente:
                  </label>
                  <input
                    type="text"
                    placeholder="CLI-001"
                    value={editingClient.clientNumber || ''}
                    onChange={(e) =>
                      setEditingClient({ ...editingClient, clientNumber: e.target.value })
                    }
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-[#B6C2D2]/25 bg-white dark:bg-[#071021] font-mono font-bold"
                    required
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-[#CBD5E1] block mb-1">
                    Nombre del Comercio / Cliente:
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Almacén y Fiambrería Los Amigos"
                    value={editingClient.name || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, name: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-[#B6C2D2]/25 bg-white dark:bg-[#071021] font-semibold"
                    required
                  />
                </div>
              </div>

              {/* Row 2: Contact Person & Phone (Optional) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-[#CBD5E1] block mb-1">
                    Persona Titular / Contacto (opcional):
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Juan Carlos Gómez"
                    value={editingClient.contactPerson || ''}
                    onChange={(e) =>
                      setEditingClient({ ...editingClient, contactPerson: e.target.value })
                    }
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-[#B6C2D2]/25 bg-white dark:bg-[#071021]"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-[#CBD5E1] block mb-1">
                    Teléfono / WhatsApp (opcional):
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. +54 9 11 2345-6789"
                    value={editingClient.phone || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, phone: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-[#B6C2D2]/25 bg-white dark:bg-[#071021] font-mono"
                  />
                </div>
              </div>

              {/* Row 3: Address & Zone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-[#CBD5E1] block mb-1">
                    Dirección del Local / Entrega:
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Av. San Martín 1540"
                    value={editingClient.address || ''}
                    onChange={(e) =>
                      setEditingClient({ ...editingClient, address: e.target.value })
                    }
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-[#B6C2D2]/25 bg-white dark:bg-[#071021]"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-[#CBD5E1] block mb-1">
                    Zona / Ruta de Cobranza:
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Zona Centro, Morón, San Isidro"
                    value={editingClient.zone || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, zone: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-[#B6C2D2]/25 bg-white dark:bg-[#071021]"
                  />
                </div>
              </div>

              {/* Row 4: Salesperson & CUIT */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-[#CBD5E1] flex items-center gap-1 mb-1">
                    <Bike className="w-3.5 h-3.5 text-[#162E59] dark:text-[#CBD5E1]" />
                    <span>Vendedor Asignado ("De quién es"):</span>
                  </label>
                  <select
                    value={editingClient.assignedSalespersonId || ''}
                    onChange={(e) =>
                      setEditingClient({ ...editingClient, assignedSalespersonId: e.target.value })
                    }
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-[#B6C2D2]/25 bg-white dark:bg-[#071021] font-medium"
                    required={labels.requireSalesperson && salespeople.length > 0}
                  >
                    <option value="">
                      {labels.requireSalesperson ? 'Seleccione un vendedor...' : 'Mostrador / Sin vendedor fijo'}
                    </option>
                    {salespeople.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.zone})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-[#CBD5E1] block mb-1">
                    CUIT o DNI (Opcional):
                  </label>
                  <input
                    type="text"
                    placeholder="20-33445566-7"
                    value={editingClient.cuitOrDni || ''}
                    onChange={(e) =>
                      setEditingClient({ ...editingClient, cuitOrDni: e.target.value })
                    }
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-[#B6C2D2]/25 bg-white dark:bg-[#071021] font-mono"
                  />
                </div>
              </div>

              {/* Row 5: Tope de Fiado configurable */}
              <div className="p-3.5 rounded-xl bg-[#F4F6F9] dark:bg-[#091428] border border-[#CBD5E1] dark:border-[#B6C2D2]/20 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-bold text-[#0B1933] dark:text-white flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-[#162E59] dark:text-[#CBD5E1]" />
                    <span>Tope de Fiado para este Cliente ({config.currencySymbol}):</span>
                  </label>
                  <span className="text-[11px] font-mono font-semibold text-slate-500 dark:text-[#94A3B8]">
                    {editingClient.creditLimit && Number(editingClient.creditLimit) > 0
                      ? formatCurrency(Number(editingClient.creditLimit), config.currencySymbol)
                      : 'Sin tope fijo'}
                  </span>
                </div>

                <input
                  type="number" inputMode="decimal"
                  min="0"
                  step="1000"
                  placeholder="Ej. 300000 (Dejá vacío o en 0 si es sin límite fijo)"
                  value={editingClient.creditLimit || ''}
                  onChange={(e) =>
                    setEditingClient({
                      ...editingClient,
                      creditLimit: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  className="w-full text-xs font-mono font-bold p-2.5 rounded-lg border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-white dark:bg-[#0B1933] text-[#0B1933] dark:text-white"
                />

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEditingClient({ ...editingClient, creditLimit: undefined })}
                    className={`px-2 py-1 rounded text-[11px] font-semibold border cursor-pointer ${
                      !editingClient.creditLimit
                        ? 'bg-[#0B1933] text-white border-[#0B1933] dark:bg-[#E2E8F0] dark:text-[#091428]'
                        : 'bg-white dark:bg-[#0B1933] text-slate-600 dark:text-[#CBD5E1] border-slate-200 dark:border-[#B6C2D2]/25'
                    }`}
                  >
                    Sin tope
                  </button>
                  {[100000, 150000, 300000, 500000, 1000000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setEditingClient({ ...editingClient, creditLimit: preset })}
                      className={`px-2 py-1 rounded text-[11px] font-mono font-semibold border cursor-pointer ${
                        Number(editingClient.creditLimit) === preset
                          ? 'bg-[#0B1933] text-white border-[#0B1933] dark:bg-[#E2E8F0] dark:text-[#091428]'
                          : 'bg-white dark:bg-[#0B1933] text-slate-600 dark:text-[#CBD5E1] border-slate-200 dark:border-[#B6C2D2]/25 hover:bg-slate-100'
                      }`}
                    >
                      ${preset.toLocaleString('es-AR')}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-[#94A3B8]">
                  Tu distribuidora fija y modifica este tope libremente. Si una boleta nueva supera este monto, el sistema te avisará antes de cargarla.
                </p>
              </div>

              {/* Row 6: Notes */}
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-[#CBD5E1] block mb-1">
                  Notas sobre el cobro / horario habitual:
                </label>
                <input
                  type="text"
                  placeholder="Ej. Paga los viernes a contraboleta; ir de mañana de 9 a 13hs"
                  value={editingClient.notes || ''}
                  onChange={(e) => setEditingClient({ ...editingClient, notes: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-[#B6C2D2]/25 bg-white dark:bg-[#071021]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-[#B6C2D2]/15">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-[#CBD5E1] hover:bg-slate-100 dark:hover:bg-[#13264A] rounded-lg transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-[#0B1933] hover:bg-[#162E59] dark:bg-[#E2E8F0] dark:hover:bg-white text-white dark:text-[#091428] text-xs font-bold rounded-lg transition-colors cursor-pointer"
                >
                  Guardar Cliente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DETALLE DE HISTORIAL CREDITICIO & DEUDAS PURGADAS (>30 DÍAS) */}
      {viewingCreditHistoryClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative my-8 space-y-4">
            <div className="flex items-start justify-between border-b pb-3 border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded">
                      {viewingCreditHistoryClient.clientNumber || 'S/N'}
                    </span>
                    <h3 className="font-bold text-slate-900 dark:text-white text-base">
                      {viewingCreditHistoryClient.name}
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500">
                    Titular: {viewingCreditHistoryClient.contactPerson} • {viewingCreditHistoryClient.zone} • Tel: {viewingCreditHistoryClient.phone || 'S/T'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingCreditHistoryClient(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Score & Reputation Status Card */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className={`p-3 rounded-xl border ${
                viewingCreditHistoryClient.creditHistory?.reputationStatus === 'problematico' || (viewingCreditHistoryClient.creditHistory?.totalPurgedUnpaid || 0) > 0
                  ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200'
                  : viewingCreditHistoryClient.creditHistory?.reputationStatus === 'regular'
                  ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                  : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
              }`}>
                <span className="text-[10px] uppercase font-bold tracking-wider block opacity-75">
                  Calificación Crediticia
                </span>
                <span className="text-sm font-black uppercase mt-1 block">
                  {viewingCreditHistoryClient.creditHistory?.reputationStatus === 'problematico' || (viewingCreditHistoryClient.creditHistory?.totalPurgedUnpaid || 0) > 0
                    ? '🚨 Problemático'
                    : viewingCreditHistoryClient.creditHistory?.reputationStatus === 'regular'
                    ? '🟡 Regular / Demoras'
                    : '🟢 Confiable'}
                </span>
                <span className="text-[10px] mt-0.5 block opacity-80">
                  {viewingCreditHistoryClient.creditHistory?.totalPurgedUnpaid
                    ? `Deuda impaga purgada: $ ${(viewingCreditHistoryClient.creditHistory?.totalPurgedDebtAmount || 0).toLocaleString('es-AR')}`
                    : 'Puntualidad en cancelaciones'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-slate-800 dark:text-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                  Boletas Purgadas (&gt;30d Impagas)
                </span>
                <span className="text-lg font-black text-rose-600 dark:text-rose-400 mt-0.5 block">
                  {viewingCreditHistoryClient.creditHistory?.totalPurgedUnpaid || 0}
                </span>
                <span className="text-[10px] text-slate-500 block">
                  Borradas para no saturar memoria
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-slate-800 dark:text-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                  Cumplimiento en Término
                </span>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-lg font-black text-emerald-600">
                    {viewingCreditHistoryClient.creditHistory?.totalPaidOnTime || 0}
                  </span>
                  <span className="text-xs text-slate-400">a tiempo /</span>
                  <span className="text-xs font-bold text-amber-600">
                    {viewingCreditHistoryClient.creditHistory?.totalLatePayments || 0} mora
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 block">
                  {viewingCreditHistoryClient.creditHistory?.totalHistoricalBoletas || 0} boletas históricas totales
                </span>
              </div>
            </div>

            {/* Manual Reputation Override for Owner */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/80 flex items-center justify-between text-xs">
              <div>
                <span className="font-bold text-slate-800 dark:text-slate-200 block">
                  Ajustar calificación manualmente:
                </span>
                <span className="text-[11px] text-slate-500">
                  Permite perdonar a un cliente o marcarlo como problemático por decisión del dueño.
                </span>
              </div>
              <select
                value={viewingCreditHistoryClient.creditHistory?.reputationStatus || 'confiable'}
                onChange={(e) => {
                  const newRep = e.target.value as 'confiable' | 'regular' | 'problematico';
                  const updated: Client = {
                    ...viewingCreditHistoryClient,
                    creditHistory: {
                      ...(viewingCreditHistoryClient.creditHistory || {
                        totalHistoricalBoletas: 0,
                        totalPaidOnTime: 0,
                        totalLatePayments: 0,
                        totalPurgedUnpaid: 0,
                        totalPurgedDebtAmount: 0,
                        purgedBoletas: [],
                        lastEvaluatedAt: new Date().toISOString(),
                      }),
                      reputationStatus: newRep,
                    },
                  };
                  onSaveClient(updated);
                  setViewingCreditHistoryClient(updated);
                }}
                className="text-xs p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold"
              >
                <option value="confiable">🟢 Confiable / Sin reparos</option>
                <option value="regular">🟡 Regular / Demoras</option>
                <option value="problematico">🚨 Problemático / Riesgo</option>
              </select>
            </div>

            {/* List of Purged Boletas (>30 days) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Registro de Boletas Eliminadas a los 30 Días:</span>
                </h4>
                <span className="text-[10px] text-slate-400">
                  Conservado automáticamente tras purga física
                </span>
              </div>

              {(!viewingCreditHistoryClient.creditHistory?.purgedBoletas ||
                viewingCreditHistoryClient.creditHistory.purgedBoletas.length === 0) ? (
                <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
                  ✨ No registra ninguna boleta purgada sin pagar. Su historial está limpio.
                </div>
              ) : (
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden text-xs">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-100 dark:bg-slate-800/80 text-[10px] font-bold text-slate-500 uppercase">
                      <tr>
                        <th className="py-2 px-3">Boleta Nº</th>
                        <th className="py-2 px-3">Fecha Venta</th>
                        <th className="py-2 px-3">Vto. Pactado</th>
                        <th className="py-2 px-3">Monto Original</th>
                        <th className="py-2 px-3">Saldo Dejado Sin Pagar</th>
                        <th className="py-2 px-3">Vendedor que Fió</th>
                        <th className="py-2 px-3">Fecha Purga</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {viewingCreditHistoryClient.creditHistory.purgedBoletas.map((p, idx) => (
                        <tr key={idx} className="hover:bg-rose-50/40 dark:hover:bg-rose-950/20">
                          <td className="py-2 px-3 font-mono font-bold text-rose-600">
                            #{p.boletaNumber}
                          </td>
                          <td className="py-2 px-3 text-slate-600 dark:text-slate-300">
                            {p.saleDate}
                          </td>
                          <td className="py-2 px-3 text-slate-600 dark:text-slate-300">
                            {p.dueDate} ({p.termDays}d)
                          </td>
                          <td className="py-2 px-3 font-medium">
                            {formatCurrency(p.originalAmount, config.currencySymbol)}
                          </td>
                          <td className="py-2 px-3 font-bold text-rose-600">
                            {formatCurrency(p.balanceDue, config.currencySymbol)}
                          </td>
                          <td className="py-2 px-3 text-slate-600 dark:text-slate-400">
                            {p.salespersonName}
                          </td>
                          <td className="py-2 px-3 text-slate-400 text-[11px]">
                            {p.purgedAt}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setViewingCreditHistoryClient(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 text-xs font-bold rounded-xl"
              >
                Cerrar Historial
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CUENTA CORRIENTE UNIFICADA & ENTREGA FIFO */}
      {statementClient && (
        <ClientAccountStatementModal
          isOpen={Boolean(statementClient)}
          onClose={() => setStatementClient(null)}
          client={clients.find((c) => c.id === statementClient.id) || statementClient}
          pendingBoletas={boletas.filter((b) => b.clientId === statementClient.id && b.status === 'pending')}
          paidBoletas={paidBoletas.filter((b) => b.clientId === statementClient.id)}
          config={config}
          activeUserName={activeUserName}
          onSaveClientPhone={onSaveClientPhone}
          onApplyFifoPayment={
            onApplyFifoClientPayment
              ? (payload) => {
                  const currentClient =
                    clients.find((c) => c.id === payload.clientId) || statementClient;
                  onApplyFifoClientPayment(payload.allocation, {
                    date: payload.date,
                    paymentMethod: payload.paymentMethod,
                    notes: payload.notes,
                    receivedBy: payload.receivedBy || activeUserName || 'Administración',
                    receiptNumber: `REC-${Date.now().toString().slice(-5)}`,
                    whatsappPhone: currentClient?.phone || '',
                    openReceiptAfterSave: true,
                  });
                  setStatementClient(null);
                }
              : undefined
          }
        />
      )}

      {/* MODAL FICHA 360° DEL CLIENTE: DEUDA, ÚLTIMAS COMPRAS, PRODUCTOS Y FECHAS FRECUENTES */}
      <ClientDetailModal
        isOpen={Boolean(detailClient)}
        onClose={() => setDetailClient(null)}
        client={
          detailClient ? clients.find((c) => c.id === detailClient.id) || detailClient : null
        }
        boletas={boletas}
        paidBoletas={paidBoletas}
        config={config}
        currentDateRef={currentDateRef}
        onEditClient={(c) => handleOpenEdit(c)}
        onOpenStatement={(c) => setStatementClient(c)}
        onQuickSendStatement={(c) => triggerQuickSendStatement(c)}
        onCreateSaleForClient={onCreateSaleForClient}
      />

      {localQuickShareClient && (
        <ClientStatementQuickShareModal
          isOpen={Boolean(localQuickShareClient)}
          onClose={() => setLocalQuickShareClient(null)}
          client={
            clients.find((c) => c.id === localQuickShareClient.id) || localQuickShareClient
          }
          pendingBoletas={boletas}
          paidBoletas={paidBoletas}
          config={config}
          currentDateRef={currentDateRef}
          onSaveClientPhone={onSaveClientPhone}
        />
      )}
    </div>
  );
};
