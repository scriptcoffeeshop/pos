import { Hono } from "@hono/hono";
import { cors } from "@hono/hono/cors";
import type { Context } from "@hono/hono";
import { createClient } from "@supabase/supabase-js";

type MenuCategory = "coffee" | "tea" | "food" | "retail";
type PaymentMethod = "cash" | "card" | "line-pay" | "jkopay" | "transfer";
type ServiceMode = "dine-in" | "takeout" | "delivery";
type OrderSource = "counter" | "qr" | "online";
type OrderStatus = "new" | "preparing" | "ready" | "served" | "failed" | "voided";
type PaymentStatus = "pending" | "authorized" | "paid" | "expired" | "failed" | "refunded";
type PrintStatus = "queued" | "printed" | "skipped" | "failed";
type RegisterSessionStatus = "open" | "closed";
type PrintLabelMode = "receipt" | "label" | "both";
type AdminSettingKey = "printer_settings" | "access_control";
type ProductChannel = "pos" | "online" | "qr";

interface OrderLineInput {
  productId?: string;
  productSku: string;
  name: string;
  unitPrice: number;
  quantity: number;
  options?: unknown[];
}

interface CreateOrderInput {
  orderNumber: string;
  source?: OrderSource;
  serviceMode?: ServiceMode;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  requestedFulfillmentAt?: string | null;
  note?: string;
  subtotal: number;
  paymentMethod?: PaymentMethod;
  paymentStatus?: PaymentStatus;
  stationId?: string;
  lines: OrderLineInput[];
}

interface UpdateStatusInput {
  status: OrderStatus;
  stationId?: string;
}

interface UpdatePaymentInput {
  paymentStatus: PaymentStatus;
  stationId?: string;
}

interface VoidOrderInput {
  stationId?: string;
  note?: string;
}

interface RefundOrderInput {
  stationId?: string;
  note?: string;
}

interface CreateMemberInput {
  lineUserId?: string;
  displayName?: string;
  openingBalance?: number;
  note?: string;
  stationId?: string;
}

interface WalletAdjustmentInput {
  amount?: number;
  entryType?: "top_up" | "adjustment";
  note?: string;
  stationId?: string;
}

interface PaymentWebhookInput {
  eventId?: string;
  orderId?: string | null;
  orderNumber?: string;
  paymentStatus?: PaymentStatus;
  amount?: number | null;
  eventType?: string;
  occurredAt?: string;
  payload?: Record<string, unknown>;
}

interface ReportBreakdownRow {
  key: string;
  count: number;
  total: number;
}

interface HourlyReportRow {
  hour: number;
  count: number;
  total: number;
}

interface TopProductReportRow {
  sku: string;
  name: string;
  quantity: number;
  total: number;
}

interface StationHeartbeatInput {
  stationId?: string;
  stationLabel?: string;
  platform?: string;
  appVersion?: string;
  userAgent?: string;
}

interface AuditEventInput {
  action: string;
  orderId?: string | null;
  registerSessionId?: string | null;
  stationId?: string | null;
  metadata?: Record<string, unknown>;
}

interface ClaimOrderInput {
  stationId?: string;
  force?: boolean;
}

interface UpdatePrintJobStatusInput {
  status: PrintStatus;
  error?: string;
}

interface PrintJobInput {
  orderId: string;
  stationId?: string;
  payload: string;
  stationName?: string;
  printerHost?: string;
  printerPort?: number;
  protocol?: string;
}

interface OpenRegisterInput {
  openingCash?: number;
  note?: string;
  stationId?: string;
}

interface CloseRegisterInput {
  closingCash?: number;
  note?: string;
  stationId?: string;
  force?: boolean;
}

interface ProductUpdateInput {
  name?: string;
  category?: MenuCategory;
  price?: number;
  tags?: unknown;
  accent?: string;
  isAvailable?: boolean;
  sortOrder?: number;
  posVisible?: boolean;
  onlineVisible?: boolean;
  qrVisible?: boolean;
  prepStation?: string;
  printLabel?: boolean;
  inventoryCount?: number | null;
  lowStockThreshold?: number | null;
  soldOutUntil?: string | null;
}

interface PrintStationSetting {
  id: string;
  name: string;
  host: string;
  port: number;
  protocol: string;
  enabled: boolean;
  autoPrint: boolean;
}

interface PrintRuleSetting {
  id: string;
  name: string;
  serviceMode: ServiceMode;
  stationId: string;
  categories: MenuCategory[];
  copies: number;
  labelMode: PrintLabelMode;
  enabled: boolean;
}

interface PrinterSettings {
  stations: PrintStationSetting[];
  rules: PrintRuleSetting[];
}

interface RoleSetting {
  id: string;
  name: string;
  pinRequired: boolean;
  permissions: string[];
}

interface AccessControlSettings {
  roles: RoleSetting[];
}

const supabaseUrl = Deno.env.get("SUPABASE_URL") ??
  Deno.env.get("VITE_SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const adminPin = Deno.env.get("POS_ADMIN_PIN");
const paymentWebhookSecret = Deno.env.get("POS_PAYMENT_WEBHOOK_SECRET");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const api = new Hono();

const orderSelect =
  "*, order_items(*), print_jobs(id, status, printed_at, created_at, attempts, last_error)";
const printJobSelect = "id, status, printed_at, created_at, attempts, last_error";
const productSelect =
  "id, sku, name, category, price, tags, accent, is_available, sort_order, pos_visible, online_visible, qr_visible, prep_station, print_label, inventory_count, low_stock_threshold, sold_out_until";
const memberSelect =
  "id, line_user_id, line_display_name, wallet_balance, created_at, updated_at";
const transactionLedgerSelect =
  "id, member_id, order_id, entry_type, amount, balance_after, note, created_at";
const registerSessionSelect =
  "id, status, opened_at, closed_at, opening_cash, closing_cash, expected_cash, cash_sales, non_cash_sales, pending_total, order_count, open_order_count, failed_payment_count, failed_print_count, voided_order_count, note";
const auditEventSelect =
  "id, action, order_id, register_session_id, station_id, actor, metadata, created_at";
const paymentEventSelect =
  "id, provider, event_id, order_id, order_number, event_type, payment_status, amount, applied, duplicate, processed_at, created_at";
const stationHeartbeatSelect =
  "station_id, station_label, platform, app_version, user_agent, last_seen_at, created_at";
const defaultOrderLeaseSeconds = 180;
const maxOrderLeaseSeconds = 900;
const defaultPaymentExpiryMinutes = 20;
const reportTimezoneOffsetMinutes = 8 * 60;
const paymentExpiryMinutes = (() => {
  const value = Number(Deno.env.get("POS_PAYMENT_EXPIRY_MINUTES") ?? defaultPaymentExpiryMinutes);
  if (!Number.isFinite(value) || value <= 0) {
    return defaultPaymentExpiryMinutes;
  }

  return Math.min(Math.floor(value), 24 * 60);
})();

const areAuditValuesEqual = (left: unknown, right: unknown): boolean => {
  if (Array.isArray(left) || Array.isArray(right)) {
    return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
  }

  return left === right;
};

const defaultPrinterSettings: PrinterSettings = {
  stations: [
    {
      id: "counter",
      name: "櫃台出單機",
      host: "192.168.1.100",
      port: 9100,
      protocol: "EZPL over TCP",
      enabled: true,
      autoPrint: true,
    },
    {
      id: "kitchen",
      name: "吧台貼紙機",
      host: "192.168.1.101",
      port: 9100,
      protocol: "EZPL over TCP",
      enabled: false,
      autoPrint: false,
    },
  ],
  rules: [
    {
      id: "takeout-label",
      name: "外帶貼紙",
      serviceMode: "takeout",
      stationId: "counter",
      categories: ["coffee", "tea", "food", "retail"],
      copies: 1,
      labelMode: "label",
      enabled: true,
    },
    {
      id: "dine-in-receipt",
      name: "內用收據",
      serviceMode: "dine-in",
      stationId: "counter",
      categories: ["coffee", "tea", "food", "retail"],
      copies: 1,
      labelMode: "receipt",
      enabled: true,
    },
    {
      id: "delivery-receipt",
      name: "外送收據",
      serviceMode: "delivery",
      stationId: "counter",
      categories: ["coffee", "tea", "food", "retail"],
      copies: 1,
      labelMode: "both",
      enabled: true,
    },
  ],
};

const defaultAccessControl: AccessControlSettings = {
  roles: [
    {
      id: "owner",
      name: "店主",
      pinRequired: true,
      permissions: [
        "manageProducts",
        "managePrinting",
        "managePayments",
        "manageReports",
        "manageCustomers",
        "manageAccess",
        "voidOrders",
        "closeRegister",
      ],
    },
  ],
};

const loadOrder = (orderId: string) =>
  supabase
    .from("orders")
    .select(orderSelect)
    .eq("id", orderId)
    .single();

const loadMemberWithLedger = async (memberId: string) => {
  const { data: member, error: memberError } = await supabase
    .from("members")
    .select(memberSelect)
    .eq("id", memberId)
    .single();

  if (memberError || !member) {
    return { data: null, error: memberError };
  }

  const { data: ledger, error: ledgerError } = await supabase
    .from("transaction_ledger")
    .select(transactionLedgerSelect)
    .eq("member_id", memberId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (ledgerError) {
    return { data: null, error: ledgerError };
  }

  return { data: { ...member, ledger: ledger ?? [] }, error: null };
};

const expireStalePendingOnlineOrders = async (): Promise<void> => {
  const now = new Date();
  const cutoffIso = new Date(now.getTime() - paymentExpiryMinutes * 60_000).toISOString();
  const { data, error } = await supabase
    .from("orders")
    .update({
      status: "failed",
      payment_status: "expired",
      claimed_by: null,
      claimed_at: null,
      claim_expires_at: null,
    })
    .in("source", ["qr", "online"])
    .eq("status", "new")
    .eq("payment_status", "pending")
    .lt("created_at", cutoffIso)
    .or(`claimed_by.is.null,claim_expires_at.lt.${now.toISOString()}`)
    .select("id, order_number, source, created_at");

  if (error) {
    console.error(JSON.stringify({
      scope: "payment-expiry",
      error: error.message,
    }));
    return;
  }

  await Promise.all((data ?? []).map((order) =>
    writeAuditEvent({
      action: "order.payment.expired",
      orderId: order.id,
      metadata: {
        orderNumber: order.order_number,
        source: order.source,
        status: "failed",
        paymentStatus: "expired",
        previousStatus: "new",
        previousPaymentStatus: "pending",
        expiredAfterMinutes: paymentExpiryMinutes,
        createdAt: order.created_at,
      },
    })
  ));
};

api.use(
  "*",
  cors({
    origin: "*",
    allowHeaders: [
      "authorization",
      "x-client-info",
      "apikey",
      "content-type",
      "x-pos-admin-pin",
      "x-pos-station-id",
      "x-pos-payment-webhook-secret",
    ],
    allowMethods: ["GET", "POST", "PATCH", "OPTIONS"],
  }),
);

api.get("/health", (c) =>
  c.json({
    ok: true,
    scope: "pos-api",
    timestamp: new Date().toISOString(),
  }));

api.post("/payments/webhook/:provider", async (c) => {
  const authError = requirePaymentWebhookSecret(c);
  if (authError) {
    return authError;
  }

  const provider = sanitizePaymentProvider(c.req.param("provider"));
  const input = await c.req.json<PaymentWebhookInput>();
  const validationError = validatePaymentWebhookInput(input);
  if (validationError) {
    return c.json({ error: validationError }, 400);
  }

  const { data, error } = await supabase.rpc("record_pos_payment_event", {
    p_provider: provider,
    p_event_id: input.eventId?.trim(),
    p_order_id: normalizeUuid(input.orderId),
    p_order_number: input.orderNumber?.trim() ?? "",
    p_payment_status: input.paymentStatus,
    p_amount: input.amount ?? null,
    p_event_type: input.eventType?.trim() ?? "payment.webhook",
    p_raw_payload: input.payload ?? input,
  });

  if (error) {
    const status = /Order not found/i.test(error.message) ? 404 : 500;
    return c.json({ error: error.message }, status);
  }

  const result = data as Record<string, unknown>;
  const orderId = typeof result.orderId === "string" ? result.orderId : "";
  const { data: savedOrder, error: savedOrderError } = orderId
    ? await loadOrder(orderId)
    : { data: null, error: null };

  if (savedOrderError) {
    return c.json({ error: savedOrderError.message }, 500);
  }

  if (savedOrder) {
    await writeAuditEvent({
      action: "payment.webhook.record",
      orderId: savedOrder.id,
      stationId: provider,
      metadata: {
        provider,
        eventId: input.eventId,
        eventType: input.eventType ?? "payment.webhook",
        paymentStatus: input.paymentStatus,
        amount: input.amount ?? null,
        result,
      },
    });
  }

  return c.json({ result, order: savedOrder });
});

api.get("/products", async (c) => {
  const channel = readProductChannel(c.req.query("channel"));
  const channelColumn = {
    pos: "pos_visible",
    online: "online_visible",
    qr: "qr_visible",
  }[channel];

  const { data, error } = await supabase
    .from("products")
    .select(productSelect)
    .eq("is_available", true)
    .eq(channelColumn, true)
    .order("sort_order", { ascending: true });

  if (error) {
    const existingSession = await loadOpenRegisterSession();
    if (existingSession.session) {
      try {
        return c.json({ session: await withCurrentRegisterSummary(existingSession.session) });
      } catch (summaryError) {
        return c.json({ error: toPosApiError(summaryError).message }, 500);
      }
    }

    return c.json({ error: error.message }, 500);
  }

  return c.json({ products: data });
});

api.get("/settings/runtime", async (c) => {
  const printerSettings = await loadSetting<PrinterSettings>(
    "printer_settings",
    defaultPrinterSettings,
  );

  return c.json({ printerSettings });
});

api.post("/station/heartbeat", async (c) => {
  const input: StationHeartbeatInput = await c.req.json<StationHeartbeatInput>().catch(() => ({}));
  const stationId = sanitizeStationId(input.stationId);
  if (!stationId) {
    return c.json({ error: "stationId is required" }, 400);
  }

  const { data, error } = await supabase
    .from("pos_station_heartbeats")
    .upsert({
      station_id: stationId,
      station_label: sanitizeText(input.stationLabel, stationId).slice(0, 80),
      platform: sanitizeText(input.platform, "").slice(0, 40),
      app_version: sanitizeText(input.appVersion, "").slice(0, 40),
      user_agent: sanitizeText(input.userAgent, "").slice(0, 160),
      last_seen_at: new Date().toISOString(),
    }, { onConflict: "station_id" })
    .select(stationHeartbeatSelect)
    .single();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ station: data });
});

api.get("/register/current", async (c) => {
  const { session, error } = await loadCurrentRegisterSession();
  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ session });
});

api.post("/register/open", async (c) => {
  const authError = requireAdmin(c);
  if (authError) {
    return authError;
  }

  const input: OpenRegisterInput = await c.req.json<OpenRegisterInput>().catch(() => ({}));
  const stationId = sanitizeStationId(input.stationId);
  const openingCash = readMoneyAmount(input.openingCash, "openingCash", 0);
  if (openingCash.error) {
    return c.json({ error: openingCash.error }, 400);
  }

  const openSession = await loadOpenRegisterSession();
  if (openSession.error) {
    return c.json({ error: openSession.error.message }, 500);
  }

  if (openSession.session) {
    try {
      return c.json({ session: await withCurrentRegisterSummary(openSession.session) });
    } catch (error) {
      return c.json({ error: toPosApiError(error).message }, 500);
    }
  }

  const note = sanitizeText(input.note, "").slice(0, 500);
  const { data, error } = await supabase
    .from("register_sessions")
    .insert({
      opening_cash: openingCash.value,
      expected_cash: openingCash.value,
      note,
    })
    .select(registerSessionSelect)
    .single();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  await writeAuditEvent({
    action: "register.open",
    registerSessionId: data.id,
    stationId,
    metadata: {
      openingCash: openingCash.value,
    },
  });

  return c.json({ session: data }, 201);
});

api.post("/register/close", async (c) => {
  const authError = requireAdmin(c);
  if (authError) {
    return authError;
  }

  const input: CloseRegisterInput = await c.req.json<CloseRegisterInput>().catch(() => ({}));
  const stationId = sanitizeStationId(input.stationId);
  const closingCash = readMoneyAmount(input.closingCash, "closingCash");
  if (closingCash.error) {
    return c.json({ error: closingCash.error }, 400);
  }

  const openSession = await loadOpenRegisterSession();
  if (openSession.error) {
    return c.json({ error: openSession.error.message }, 500);
  }

  if (!openSession.session) {
    return c.json({ error: "No open register session" }, 409);
  }

  const closedAt = new Date();
  let summary: Awaited<ReturnType<typeof summarizeRegisterOrders>>;
  try {
    summary = await summarizeRegisterOrders(
      openSession.session.opened_at,
      closedAt,
      openSession.session.opening_cash,
    );
  } catch (error) {
    return c.json({ error: toPosApiError(error).message }, 500);
  }

  const hasCloseoutExceptions =
    summary.open_order_count > 0 ||
    summary.failed_payment_count > 0 ||
    summary.failed_print_count > 0;
  if (hasCloseoutExceptions && input.force !== true) {
    return c.json({
      error: "Closeout has unresolved exceptions",
      summary: {
        openOrderCount: summary.open_order_count,
        failedPaymentCount: summary.failed_payment_count,
        failedPrintCount: summary.failed_print_count,
        voidedOrderCount: summary.voided_order_count,
      },
    }, 409);
  }

  const note = sanitizeText(input.note, openSession.session.note).slice(0, 500);
  const { data, error } = await supabase
    .from("register_sessions")
    .update({
      status: "closed",
      closed_at: closedAt.toISOString(),
      closing_cash: closingCash.value,
      expected_cash: summary.expected_cash,
      cash_sales: summary.cash_sales,
      non_cash_sales: summary.non_cash_sales,
      pending_total: summary.pending_total,
      order_count: summary.order_count,
      open_order_count: summary.open_order_count,
      failed_payment_count: summary.failed_payment_count,
      failed_print_count: summary.failed_print_count,
      voided_order_count: summary.voided_order_count,
      note,
    })
    .eq("id", openSession.session.id)
    .eq("status", "open")
    .select(registerSessionSelect)
    .single();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  await writeAuditEvent({
    action: "register.close",
    registerSessionId: data.id,
    stationId,
    metadata: {
      closingCash: closingCash.value,
      expectedCash: summary.expected_cash,
      cashSales: summary.cash_sales,
      nonCashSales: summary.non_cash_sales,
      pendingTotal: summary.pending_total,
      openOrderCount: summary.open_order_count,
      failedPaymentCount: summary.failed_payment_count,
      failedPrintCount: summary.failed_print_count,
      voidedOrderCount: summary.voided_order_count,
      forced: input.force === true,
    },
  });

  return c.json({ session: data });
});

api.get("/admin/products", async (c) => {
  const authError = requireAdmin(c);
  if (authError) {
    return authError;
  }

  const { data, error } = await supabase
    .from("products")
    .select(productSelect)
    .order("sort_order", { ascending: true });

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ products: data });
});

api.patch("/admin/products/:id", async (c) => {
  const authError = requireAdmin(c);
  if (authError) {
    return authError;
  }

  const productId = c.req.param("id");
  const input = await c.req.json<ProductUpdateInput>();
  const { payload, error: validationError } = validateProductUpdateInput(input);
  if (validationError) {
    return c.json({ error: validationError }, 400);
  }

  const { data: previousProduct, error: previousProductError } = await supabase
    .from("products")
    .select(productSelect)
    .eq("id", productId)
    .maybeSingle();

  if (previousProductError) {
    return c.json({ error: previousProductError.message }, 500);
  }

  if (!previousProduct) {
    return c.json({ error: "Product not found" }, 404);
  }

  const { data, error } = await supabase
    .from("products")
    .update(payload)
    .eq("id", productId)
    .select(productSelect)
    .single();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  const previousProductRecord = previousProduct as Record<string, unknown>;
  const changedFields = Object.entries(payload)
    .filter(([field, value]) => !areAuditValuesEqual(previousProductRecord[field], value))
    .map(([field]) => field);
  const auditMetadata: Record<string, unknown> = {
    productId,
    sku: data.sku,
    name: data.name,
    changedFields,
  };

  if (changedFields.includes("inventory_count")) {
    auditMetadata.inventoryBefore = previousProduct.inventory_count;
    auditMetadata.inventoryAfter = data.inventory_count;
    if (typeof previousProduct.inventory_count === "number" && typeof data.inventory_count === "number") {
      auditMetadata.inventoryDelta = data.inventory_count - previousProduct.inventory_count;
    }
  }

  if (changedFields.includes("low_stock_threshold")) {
    auditMetadata.lowStockThresholdBefore = previousProduct.low_stock_threshold;
    auditMetadata.lowStockThresholdAfter = data.low_stock_threshold;
  }

  if (changedFields.includes("price")) {
    auditMetadata.priceBefore = previousProduct.price;
    auditMetadata.priceAfter = data.price;
    auditMetadata.priceDelta = data.price - previousProduct.price;
  }

  if (changedFields.includes("is_available")) {
    auditMetadata.availableBefore = previousProduct.is_available;
    auditMetadata.availableAfter = data.is_available;
  }

  if (changedFields.includes("sold_out_until")) {
    auditMetadata.soldOutUntilBefore = previousProduct.sold_out_until;
    auditMetadata.soldOutUntilAfter = data.sold_out_until;
  }

  if (changedFields.length > 0) {
    await writeAuditEvent({
      action: "product.update",
      stationId: sanitizeStationId(c.req.header("x-pos-station-id")),
      metadata: auditMetadata,
    });
  }

  return c.json({ product: data });
});

api.get("/admin/members", async (c) => {
  const authError = requireAdmin(c);
  if (authError) {
    return authError;
  }

  const rawLimit = Number(c.req.query("limit") ?? 50);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100)
    : 50;
  const keyword = sanitizeText(c.req.query("q"), "").slice(0, 80);

  let query = supabase
    .from("members")
    .select(memberSelect)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (keyword) {
    const pattern = `%${keyword.replace(/[%_]/g, "\\$&")}%`;
    query = query.or(`line_display_name.ilike.${pattern},line_user_id.ilike.${pattern}`);
  }

  const { data: members, error } = await query;

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  const memberIds = (members ?? []).map((member) => member.id);
  let ledgerByMember = new Map<string, unknown[]>();
  if (memberIds.length > 0) {
    const { data: ledger, error: ledgerError } = await supabase
      .from("transaction_ledger")
      .select(transactionLedgerSelect)
      .in("member_id", memberIds)
      .order("created_at", { ascending: false })
      .limit(Math.min(memberIds.length * 5, 500));

    if (ledgerError) {
      return c.json({ error: ledgerError.message }, 500);
    }

    ledgerByMember = (ledger ?? []).reduce((map, entry) => {
      const memberId = entry.member_id as string;
      const current = map.get(memberId) ?? [];
      if (current.length < 5) {
        current.push(entry);
        map.set(memberId, current);
      }
      return map;
    }, new Map<string, unknown[]>());
  }

  return c.json({
    members: (members ?? []).map((member) => ({
      ...member,
      ledger: ledgerByMember.get(member.id) ?? [],
    })),
  });
});

api.get("/admin/reports/daily", async (c) => {
  const authError = requireAdmin(c);
  if (authError) {
    return authError;
  }

  const range = parseReportDate(c.req.query("date"));
  if (!range) {
    return c.json({ error: "date must use YYYY-MM-DD" }, 400);
  }

  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, source, service_mode, subtotal, payment_method, payment_status, status, created_at, order_items(product_sku, name, quantity, line_total), print_jobs(status)",
    )
    .gte("created_at", range.start.toISOString())
    .lt("created_at", range.end.toISOString())
    .order("created_at", { ascending: true });

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ report: buildDailyReport(range, (data ?? []) as DailyReportOrderRow[]) });
});

api.post("/admin/members", async (c) => {
  const authError = requireAdmin(c);
  if (authError) {
    return authError;
  }

  const input = await c.req.json<CreateMemberInput>();
  const { payload, error: validationError } = validateCreateMemberInput(input);
  if (validationError) {
    return c.json({ error: validationError }, 400);
  }

  const { data: memberId, error } = await supabase.rpc("create_pos_member", {
    p_line_user_id: payload.lineUserId,
    p_line_display_name: payload.displayName,
    p_opening_balance: payload.openingBalance,
    p_note: payload.note,
  });

  if (error || typeof memberId !== "string") {
    const status = /duplicate|unique/i.test(error?.message ?? "") ? 409 : 500;
    return c.json({ error: error?.message ?? "Member could not be created" }, status);
  }

  const { data: member, error: memberError } = await loadMemberWithLedger(memberId);
  if (memberError || !member) {
    return c.json({ error: memberError?.message ?? "Member not found after create" }, 500);
  }

  await writeAuditEvent({
    action: "member.create",
    stationId: sanitizeStationId(c.req.header("x-pos-station-id") ?? input.stationId),
    metadata: {
      memberId,
      displayName: payload.displayName,
      lineUserId: payload.lineUserId,
      openingBalance: payload.openingBalance,
    },
  });

  return c.json({ member }, 201);
});

api.post("/admin/members/:id/wallet-adjustments", async (c) => {
  const authError = requireAdmin(c);
  if (authError) {
    return authError;
  }

  const memberId = c.req.param("id");
  const input = await c.req.json<WalletAdjustmentInput>();
  const { payload, error: validationError } = validateWalletAdjustmentInput(input);
  if (validationError) {
    return c.json({ error: validationError }, 400);
  }

  const { data: balanceAfter, error } = await supabase.rpc("adjust_pos_member_wallet", {
    p_member_id: memberId,
    p_amount: payload.amount,
    p_entry_type: payload.entryType,
    p_note: payload.note,
  });

  if (error || typeof balanceAfter !== "number") {
    const status = /not found/i.test(error?.message ?? "")
      ? 404
      : /insufficient/i.test(error?.message ?? "")
        ? 409
        : 500;
    return c.json({ error: error?.message ?? "Wallet could not be adjusted" }, status);
  }

  const { data: member, error: memberError } = await loadMemberWithLedger(memberId);
  if (memberError || !member) {
    return c.json({ error: memberError?.message ?? "Member not found after wallet adjustment" }, 500);
  }

  await writeAuditEvent({
    action: "member.wallet.adjust",
    stationId: sanitizeStationId(c.req.header("x-pos-station-id") ?? input.stationId),
    metadata: {
      memberId,
      displayName: member.line_display_name,
      amount: payload.amount,
      entryType: payload.entryType,
      balanceAfter,
      note: payload.note,
    },
  });

  return c.json({ member });
});

api.get("/admin/settings", async (c) => {
  const authError = requireAdmin(c);
  if (authError) {
    return authError;
  }

  const { data, error } = await supabase
    .from("pos_settings")
    .select("key, value")
    .in("key", ["printer_settings", "access_control"]);

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ settings: data });
});

api.get("/admin/audit-events", async (c) => {
  const authError = requireAdmin(c);
  if (authError) {
    return authError;
  }

  const rawLimit = Number(c.req.query("limit") ?? 50);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100)
    : 50;
  const action = sanitizeText(c.req.query("action"), "").slice(0, 80);

  let query = supabase
    .from("pos_audit_events")
    .select(auditEventSelect)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (action) {
    query = query.eq("action", action);
  }

  const { data, error } = await query;

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ events: data });
});

api.get("/admin/payment-events", async (c) => {
  const authError = requireAdmin(c);
  if (authError) {
    return authError;
  }

  const rawLimit = Number(c.req.query("limit") ?? 50);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100)
    : 50;
  const provider = sanitizePaymentProvider(c.req.query("provider"));

  let query = supabase
    .from("payment_events")
    .select(paymentEventSelect)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (provider !== "unknown") {
    query = query.eq("provider", provider);
  }

  const { data, error } = await query;

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ events: data });
});

api.get("/admin/stations", async (c) => {
  const authError = requireAdmin(c);
  if (authError) {
    return authError;
  }

  const { data, error } = await supabase
    .from("pos_station_heartbeats")
    .select(stationHeartbeatSelect)
    .order("last_seen_at", { ascending: false })
    .limit(50);

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ stations: data });
});

api.patch("/admin/settings/:key", async (c) => {
  const authError = requireAdmin(c);
  if (authError) {
    return authError;
  }

  const key = c.req.param("key") as AdminSettingKey;
  if (!["printer_settings", "access_control"].includes(key)) {
    return c.json({ error: "Invalid setting key" }, 400);
  }

  const input = await c.req.json<unknown>();
  const { value, error: validationError } = validateAdminSetting(key, input);
  if (validationError) {
    return c.json({ error: validationError }, 400);
  }

  const { data, error } = await supabase
    .from("pos_settings")
    .upsert({ key, value }, { onConflict: "key" })
    .select("key, value")
    .single();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  await writeAuditEvent({
    action: "setting.update",
    stationId: sanitizeStationId(c.req.header("x-pos-station-id")),
    metadata: {
      key,
    },
  });

  return c.json({ setting: data });
});

api.get("/orders", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 100);
  await expireStalePendingOnlineOrders();

  const { data, error } = await supabase
    .from("orders")
    .select(orderSelect)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ orders: data });
});

api.post("/orders", async (c) => {
  const input = await c.req.json<CreateOrderInput>();
  const validationError = validateOrderInput(input);
  if (validationError) {
    return c.json({ error: validationError }, 400);
  }

  const stationId = sanitizeStationId(input.stationId);
  const deliveryAddress = sanitizeText(input.deliveryAddress, "").slice(0, 240);
  const requestedFulfillmentAt = normalizeRequestedFulfillmentAt(input.requestedFulfillmentAt);
  const { data: orderId, error: orderError } = await supabase.rpc("create_pos_order", {
    p_order_number: input.orderNumber,
    p_source: input.source ?? "counter",
    p_service_mode: input.serviceMode ?? "takeout",
    p_customer_name: input.customerName?.trim() || "現場客",
    p_customer_phone: input.customerPhone?.trim() ?? "",
    p_delivery_address: deliveryAddress,
    p_requested_fulfillment_at: requestedFulfillmentAt,
    p_note: input.note?.trim() ?? "",
    p_subtotal: input.subtotal,
    p_payment_method: input.paymentMethod ?? "cash",
    p_payment_status: input.paymentStatus ?? "pending",
    p_lines: input.lines.map((line) => ({
      productId: line.productId ?? null,
      productSku: line.productSku,
      name: line.name,
      unitPrice: line.unitPrice,
      quantity: line.quantity,
      options: line.options ?? [],
    })),
  });

  if (orderError) {
    const status = /inventory|Product not found|quantity/i.test(orderError.message) ? 409 : 500;
    return c.json({ error: orderError.message }, status);
  }

  const { data: savedOrder, error: savedOrderError } = await loadOrder(String(orderId));
  if (savedOrderError) {
    return c.json({ error: savedOrderError.message }, 500);
  }

  await writeAuditEvent({
    action: "order.create",
    orderId: savedOrder.id,
    stationId,
    metadata: {
      orderNumber: savedOrder.order_number,
      subtotal: savedOrder.subtotal,
      lineCount: input.lines.length,
      paymentStatus: savedOrder.payment_status,
      deliveryAddress: savedOrder.delivery_address,
      requestedFulfillmentAt: savedOrder.requested_fulfillment_at,
    },
  });

  return c.json({ order: savedOrder }, 201);
});

api.post("/orders/:id/claim", async (c) => {
  const orderId = c.req.param("id");
  const input = await c.req.json<ClaimOrderInput>();
  const stationId = sanitizeStationId(input.stationId);
  if (!stationId) {
    return c.json({ error: "stationId is required" }, 400);
  }

  const now = new Date();
  const claimPayload = buildClaimPayload(stationId, now);
  let query = supabase
    .from("orders")
    .update(claimPayload)
    .eq("id", orderId)
    .neq("status", "served");

  if (!input.force) {
    query = query.or(buildLeaseAvailableFilter(stationId, now));
  }

  const { data, error } = await query.select("*").maybeSingle();
  if (error) {
    return c.json({ error: error.message }, 500);
  }

  if (!data) {
    return claimConflictResponse(c, orderId, stationId);
  }

  const { data: savedOrder, error: savedOrderError } = await loadOrder(data.id);
  if (savedOrderError) {
    return c.json({ error: savedOrderError.message }, 500);
  }

  await writeAuditEvent({
    action: "order.claim",
    orderId: savedOrder.id,
    stationId,
    metadata: {
      orderNumber: savedOrder.order_number,
      force: Boolean(input.force),
    },
  });

  return c.json({ order: savedOrder });
});

api.post("/orders/:id/release-claim", async (c) => {
  const orderId = c.req.param("id");
  const input = await c.req.json<ClaimOrderInput>();
  const stationId = sanitizeStationId(input.stationId);
  if (!stationId) {
    return c.json({ error: "stationId is required" }, 400);
  }

  const { data, error } = await supabase
    .from("orders")
    .update({
      claimed_by: null,
      claimed_at: null,
      claim_expires_at: null,
    })
    .eq("id", orderId)
    .eq("claimed_by", stationId)
    .select("*")
    .maybeSingle();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  if (!data) {
    return claimConflictResponse(c, orderId, stationId);
  }

  const { data: savedOrder, error: savedOrderError } = await loadOrder(data.id);
  if (savedOrderError) {
    return c.json({ error: savedOrderError.message }, 500);
  }

  await writeAuditEvent({
    action: "order.release_claim",
    orderId: savedOrder.id,
    stationId,
    metadata: {
      orderNumber: savedOrder.order_number,
    },
  });

  return c.json({ order: savedOrder });
});

api.patch("/orders/:id/status", async (c) => {
  const orderId = c.req.param("id");
  const input = await c.req.json<UpdateStatusInput>();
  const stationId = sanitizeStationId(input.stationId);

  if (
    !["new", "preparing", "ready", "served", "failed"].includes(input.status)
  ) {
    return c.json({ error: "Invalid order status" }, 400);
  }

  if (!stationId) {
    return c.json({ error: "stationId is required" }, 400);
  }

  const now = new Date();
  const shouldReleaseClaim = input.status === "served" || input.status === "failed";
  const payload = shouldReleaseClaim
    ? {
      status: input.status,
      claimed_by: null,
      claimed_at: null,
      claim_expires_at: null,
    }
    : {
      status: input.status,
      ...buildClaimPayload(stationId, now),
    };

  const { data, error } = await supabase
    .from("orders")
    .update(payload)
    .eq("id", orderId)
    .neq("status", "served")
    .or(buildLeaseAvailableFilter(stationId, now))
    .select("*")
    .maybeSingle();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  if (!data) {
    return claimConflictResponse(c, orderId, stationId);
  }

  const { data: savedOrder, error: savedOrderError } = await loadOrder(data.id);
  if (savedOrderError) {
    return c.json({ error: savedOrderError.message }, 500);
  }

  await writeAuditEvent({
    action: "order.status.update",
    orderId: savedOrder.id,
    stationId,
    metadata: {
      orderNumber: savedOrder.order_number,
      status: input.status,
    },
  });

  return c.json({ order: savedOrder });
});

api.patch("/orders/:id/payment", async (c) => {
  const orderId = c.req.param("id");
  const input = await c.req.json<UpdatePaymentInput>();
  const stationId = sanitizeStationId(input.stationId);

  if (!isPosPaymentStatus(input.paymentStatus)) {
    return c.json({ error: "paymentStatus must be pending, authorized, or paid" }, 400);
  }

  if (!stationId) {
    return c.json({ error: "stationId is required" }, 400);
  }

  const now = new Date();
  const payload = {
    payment_status: input.paymentStatus,
    ...buildClaimPayload(stationId, now),
  };

  const { data, error } = await supabase
    .from("orders")
    .update(payload)
    .eq("id", orderId)
    .neq("status", "served")
    .or(buildLeaseAvailableFilter(stationId, now))
    .select("*")
    .maybeSingle();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  if (!data) {
    return claimConflictResponse(c, orderId, stationId);
  }

  const { data: savedOrder, error: savedOrderError } = await loadOrder(data.id);
  if (savedOrderError) {
    return c.json({ error: savedOrderError.message }, 500);
  }

  await writeAuditEvent({
    action: "order.payment.update",
    orderId: savedOrder.id,
    stationId,
    metadata: {
      orderNumber: savedOrder.order_number,
      paymentStatus: input.paymentStatus,
    },
  });

  return c.json({ order: savedOrder });
});

api.post("/orders/:id/void", async (c) => {
  const authError = requireAdmin(c);
  if (authError) {
    return authError;
  }

  const orderId = c.req.param("id");
  const input: VoidOrderInput = await c.req.json<VoidOrderInput>().catch(() => ({}));
  const stationId = sanitizeStationId(input.stationId);

  if (!stationId) {
    return c.json({ error: "stationId is required" }, 400);
  }

  const { data: currentOrder, error: currentOrderError } = await loadOrder(orderId);
  if (currentOrderError) {
    return c.json({ error: currentOrderError.message }, 404);
  }

  if (currentOrder.status === "served" || currentOrder.status === "voided") {
    return c.json({ error: "Served or voided orders cannot be voided again" }, 409);
  }

  if (currentOrder.payment_status !== "pending") {
    return c.json({ error: "Collected orders require a refund workflow before voiding" }, 409);
  }

  const now = new Date();
  if (isLeaseActiveForOtherStation(currentOrder as Record<string, unknown>, stationId, now)) {
    return claimConflictResponse(c, orderId, stationId);
  }

  const { data, error } = await supabase
    .from("orders")
    .update({
      status: "voided",
      payment_status: "failed",
      note: appendVoidNote(currentOrder.note, input.note),
      claimed_by: null,
      claimed_at: null,
      claim_expires_at: null,
    })
    .eq("id", orderId)
    .eq("payment_status", "pending")
    .neq("status", "served")
    .neq("status", "voided")
    .or(buildLeaseAvailableFilter(stationId, now))
    .select("*")
    .maybeSingle();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  if (!data) {
    return claimConflictResponse(c, orderId, stationId);
  }

  const { data: savedOrder, error: savedOrderError } = await loadOrder(data.id);
  if (savedOrderError) {
    return c.json({ error: savedOrderError.message }, 500);
  }

  await writeAuditEvent({
    action: "order.void",
    orderId: savedOrder.id,
    stationId,
    metadata: {
      orderNumber: savedOrder.order_number,
      previousStatus: currentOrder.status,
      previousPaymentStatus: currentOrder.payment_status,
    },
  });

  return c.json({ order: savedOrder });
});

api.post("/orders/:id/refund", async (c) => {
  const authError = requireAdmin(c);
  if (authError) {
    return authError;
  }

  const orderId = c.req.param("id");
  const input: RefundOrderInput = await c.req.json<RefundOrderInput>().catch(() => ({}));
  const stationId = sanitizeStationId(input.stationId);

  if (!stationId) {
    return c.json({ error: "stationId is required" }, 400);
  }

  const { data: currentOrder, error: currentOrderError } = await loadOrder(orderId);
  if (currentOrderError) {
    return c.json({ error: currentOrderError.message }, 404);
  }

  const { error } = await supabase.rpc("refund_pos_order", {
    p_order_id: orderId,
    p_station_id: stationId,
    p_note: sanitizeText(input.note, "").slice(0, 240),
  });

  if (error) {
    return c.json({ error: error.message }, 409);
  }

  const { data: savedOrder, error: savedOrderError } = await loadOrder(orderId);
  if (savedOrderError) {
    return c.json({ error: savedOrderError.message }, 500);
  }

  await writeAuditEvent({
    action: "order.refund",
    orderId: savedOrder.id,
    stationId,
    metadata: {
      orderNumber: savedOrder.order_number,
      refundAmount: savedOrder.subtotal,
      previousStatus: currentOrder.status,
      previousPaymentStatus: currentOrder.payment_status,
    },
  });

  return c.json({ order: savedOrder });
});

api.post("/print-jobs", async (c) => {
  const input = await c.req.json<PrintJobInput>();
  const stationId = sanitizeStationId(input.stationId);

  if (!input.orderId || !input.payload) {
    return c.json({ error: "orderId and payload are required" }, 400);
  }

  if (!stationId) {
    return c.json({ error: "stationId is required before creating print jobs" }, 400);
  }

  const claimError = await requireOrderClaim(c, input.orderId, stationId);
  if (claimError) {
    return claimError;
  }

  const { data, error } = await supabase
    .from("print_jobs")
    .insert({
      order_id: input.orderId,
      payload: input.payload,
      station_name: input.stationName ?? "GODEX DT2X",
      printer_host: input.printerHost ?? "192.168.1.100",
      printer_port: input.printerPort ?? 9100,
      protocol: input.protocol ?? "EZPL over TCP",
    })
    .select(printJobSelect)
    .single();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ printJob: data }, 201);
});

api.patch("/print-jobs/:id/status", async (c) => {
  const printJobId = c.req.param("id");
  const input = await c.req.json<UpdatePrintJobStatusInput>();

  if (!isPrintStatus(input.status) || !["printed", "failed"].includes(input.status)) {
    return c.json({ error: "status must be printed or failed" }, 400);
  }

  const payload = {
    status: input.status,
    printed_at: input.status === "printed" ? new Date().toISOString() : null,
    last_error: input.status === "failed"
      ? sanitizeText(input.error, "Unknown LAN print failure").slice(0, 500)
      : null,
  };

  const { data: currentJob, error: currentJobError } = await supabase
    .from("print_jobs")
    .select("attempts")
    .eq("id", printJobId)
    .single();

  if (currentJobError) {
    return c.json({ error: currentJobError.message }, 404);
  }

  const { data, error } = await supabase
    .from("print_jobs")
    .update({
      ...payload,
      attempts: Math.max(Number(currentJob.attempts ?? 0) + 1, 1),
    })
    .eq("id", printJobId)
    .select(printJobSelect)
    .single();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ printJob: data });
});

interface PosApiError {
  message: string;
}

interface RegisterSessionRow {
  id: string;
  status: RegisterSessionStatus;
  opened_at: string;
  closed_at: string | null;
  opening_cash: number;
  closing_cash: number | null;
  expected_cash: number;
  cash_sales: number;
  non_cash_sales: number;
  pending_total: number;
  order_count: number;
  open_order_count: number;
  failed_payment_count: number;
  failed_print_count: number;
  voided_order_count: number;
  note: string;
}

interface RegisterOrderSummaryRow {
  subtotal: number;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  status: OrderStatus;
  print_jobs?: Array<{ status: PrintStatus }>;
}

interface DailyReportOrderItemRow {
  product_sku: string;
  name: string;
  quantity: number;
  line_total: number;
}

interface DailyReportOrderRow extends RegisterOrderSummaryRow {
  id: string;
  order_number: string;
  source: OrderSource;
  service_mode: ServiceMode;
  created_at: string;
  order_items?: DailyReportOrderItemRow[];
}

const collectedPaymentStatuses = new Set<PaymentStatus>(["authorized", "paid"]);

const loadOpenRegisterSession = async (): Promise<{
  session: RegisterSessionRow | null;
  error: PosApiError | null;
}> => {
  const { data, error } = await supabase
    .from("register_sessions")
    .select(registerSessionSelect)
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    session: data ? data as RegisterSessionRow : null,
    error,
  };
};

const loadCurrentRegisterSession = async (): Promise<{
  session: RegisterSessionRow | null;
  error: PosApiError | null;
}> => {
  const openSession = await loadOpenRegisterSession();
  if (openSession.error || openSession.session) {
    try {
      return {
        session: openSession.session ? await withCurrentRegisterSummary(openSession.session) : null,
        error: openSession.error,
      };
    } catch (error) {
      return { session: null, error: toPosApiError(error) };
    }
  }

  const { data, error } = await supabase
    .from("register_sessions")
    .select(registerSessionSelect)
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    session: data ? data as RegisterSessionRow : null,
    error,
  };
};

const withCurrentRegisterSummary = async (session: RegisterSessionRow): Promise<RegisterSessionRow> => {
  if (session.status !== "open") {
    return session;
  }

  const summary = await summarizeRegisterOrders(session.opened_at, new Date(), session.opening_cash);
  return { ...session, ...summary };
};

const summarizeRegisterOrders = async (
  openedAt: string,
  closedAt: Date,
  openingCash: number,
): Promise<Pick<
  RegisterSessionRow,
  | "expected_cash"
  | "cash_sales"
  | "non_cash_sales"
  | "pending_total"
  | "order_count"
  | "open_order_count"
  | "failed_payment_count"
  | "failed_print_count"
  | "voided_order_count"
>> => {
  const { data, error } = await supabase
    .from("orders")
    .select("subtotal, payment_method, payment_status, status, print_jobs(status)")
    .gte("created_at", openedAt)
    .lte("created_at", closedAt.toISOString());

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as RegisterOrderSummaryRow[];
  const summary = rows.reduce(
    (current, order) => {
      const subtotal = Math.max(Number(order.subtotal) || 0, 0);

      if (order.status === "voided") {
        current.voided_order_count += 1;
        return current;
      }

      if (order.status !== "served" && order.status !== "failed") {
        current.open_order_count += 1;
      }

      if (order.payment_status === "failed" || order.payment_status === "expired") {
        current.failed_payment_count += 1;
      }

      if (order.print_jobs?.some((printJob) => printJob.status === "failed")) {
        current.failed_print_count += 1;
      }

      if (order.status === "failed") {
        return current;
      }

      current.order_count += 1;

      if (order.payment_status === "pending") {
        current.pending_total += subtotal;
        return current;
      }

      if (!collectedPaymentStatuses.has(order.payment_status)) {
        return current;
      }

      if (order.payment_method === "cash") {
        current.cash_sales += subtotal;
      } else {
        current.non_cash_sales += subtotal;
      }

      return current;
    },
    {
      cash_sales: 0,
      non_cash_sales: 0,
      pending_total: 0,
      order_count: 0,
      open_order_count: 0,
      failed_payment_count: 0,
      failed_print_count: 0,
      voided_order_count: 0,
    },
  );

  return {
    ...summary,
    expected_cash: openingCash + summary.cash_sales,
  };
};

const parseReportDate = (dateInput: string | undefined): {
  date: string;
  start: Date;
  end: Date;
} | null => {
  const now = new Date(Date.now() + reportTimezoneOffsetMinutes * 60_000);
  const defaultDate = now.toISOString().slice(0, 10);
  const date = dateInput?.trim() || defaultDate;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    return null;
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const validationDate = new Date(Date.UTC(year, month - 1, day));
  const startTime = Date.UTC(year, month - 1, day) - reportTimezoneOffsetMinutes * 60_000;
  const start = new Date(startTime);
  const end = new Date(startTime + 24 * 60 * 60_000);

  if (
    validationDate.getUTCFullYear() !== year ||
    validationDate.getUTCMonth() !== month - 1 ||
    validationDate.getUTCDate() !== day
  ) {
    return null;
  }

  return { date, start, end };
};

const emptyBreakdown = (key: string): ReportBreakdownRow => ({
  key,
  count: 0,
  total: 0,
});

const addBreakdown = (
  map: Map<string, ReportBreakdownRow>,
  key: string,
  amount: number,
): void => {
  const row = map.get(key) ?? emptyBreakdown(key);
  row.count += 1;
  row.total += amount;
  map.set(key, row);
};

const buildDailyReport = (
  range: { date: string; start: Date; end: Date },
  rows: DailyReportOrderRow[],
) => {
  const paymentMap = new Map<string, ReportBreakdownRow>();
  const sourceMap = new Map<string, ReportBreakdownRow>();
  const serviceModeMap = new Map<string, ReportBreakdownRow>();
  const statusMap = new Map<string, ReportBreakdownRow>();
  const productMap = new Map<string, TopProductReportRow>();
  const hourly: HourlyReportRow[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: 0,
    total: 0,
  }));

  let collectedOrders = 0;
  let collectedTotal = 0;
  let pendingTotal = 0;
  let refundTotal = 0;
  let openOrderCount = 0;
  let failedPaymentCount = 0;
  let failedPrintCount = 0;
  let voidedOrderCount = 0;

  for (const order of rows) {
    const subtotal = Math.max(Number(order.subtotal) || 0, 0);
    const isVoided = order.status === "voided";
    const isFailed = order.status === "failed";
    const isCollected = !isVoided && !isFailed && collectedPaymentStatuses.has(order.payment_status);
    const saleAmount = isCollected ? subtotal : 0;
    const reportHour = new Date(
      new Date(order.created_at).getTime() + reportTimezoneOffsetMinutes * 60_000,
    ).getUTCHours();

    addBreakdown(paymentMap, order.payment_method, saleAmount);
    addBreakdown(sourceMap, order.source, saleAmount);
    addBreakdown(serviceModeMap, order.service_mode, saleAmount);
    addBreakdown(statusMap, order.status, saleAmount);

    hourly[reportHour].count += 1;
    hourly[reportHour].total += saleAmount;

    if (isCollected) {
      collectedOrders += 1;
      collectedTotal += subtotal;

      for (const item of order.order_items ?? []) {
        const key = item.product_sku || item.name;
        const row = productMap.get(key) ?? {
          sku: item.product_sku,
          name: item.name,
          quantity: 0,
          total: 0,
        };
        row.quantity += Math.max(Number(item.quantity) || 0, 0);
        row.total += Math.max(Number(item.line_total) || 0, 0);
        productMap.set(key, row);
      }
    }

    if (!isVoided && !isFailed && order.payment_status === "pending") {
      pendingTotal += subtotal;
    }

    if (!isVoided && order.status !== "served" && !isFailed) {
      openOrderCount += 1;
    }

    if (!isVoided && (order.payment_status === "failed" || order.payment_status === "expired")) {
      failedPaymentCount += 1;
    }

    if (order.payment_status === "refunded") {
      refundTotal += subtotal;
    }

    if (order.print_jobs?.some((printJob) => printJob.status === "failed")) {
      failedPrintCount += 1;
    }

    if (isVoided) {
      voidedOrderCount += 1;
    }
  }

  return {
    date: range.date,
    rangeStart: range.start.toISOString(),
    rangeEnd: range.end.toISOString(),
    totalOrders: rows.length,
    collectedOrders,
    collectedTotal,
    pendingTotal,
    refundTotal,
    averageTicket: collectedOrders > 0 ? Math.round(collectedTotal / collectedOrders) : 0,
    openOrderCount,
    failedPaymentCount,
    failedPrintCount,
    voidedOrderCount,
    byPaymentMethod: Array.from(paymentMap.values()).sort((a, b) => b.total - a.total || b.count - a.count),
    bySource: Array.from(sourceMap.values()).sort((a, b) => b.total - a.total || b.count - a.count),
    byServiceMode: Array.from(serviceModeMap.values()).sort((a, b) => b.total - a.total || b.count - a.count),
    byStatus: Array.from(statusMap.values()).sort((a, b) => b.count - a.count || b.total - a.total),
    hourly,
    topProducts: Array.from(productMap.values())
      .sort((a, b) => b.total - a.total || b.quantity - a.quantity)
      .slice(0, 8),
  };
};

const readMoneyAmount = (
  value: unknown,
  field: string,
  fallback?: number,
): { value: number; error: string | null } => {
  const rawValue = value ?? fallback;
  if (rawValue === undefined || rawValue === "") {
    return { value: 0, error: `${field} is required` };
  }

  const amount = typeof rawValue === "number" ? rawValue : Number(rawValue);
  if (!Number.isInteger(amount) || amount < 0) {
    return { value: 0, error: `${field} must be a non-negative integer` };
  }

  return { value: amount, error: null };
};

const toPosApiError = (error: unknown): PosApiError => ({
  message: error instanceof Error ? error.message : "Unknown POS API error",
});

const sanitizeStationId = (value: unknown): string => {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .trim()
    .replace(/[^a-zA-Z0-9:._-]/g, "-")
    .slice(0, 80);
};

const buildClaimPayload = (stationId: string, now: Date) => ({
  claimed_by: stationId,
  claimed_at: now.toISOString(),
  claim_expires_at: new Date(
    now.getTime() + Math.min(defaultOrderLeaseSeconds, maxOrderLeaseSeconds) * 1000,
  ).toISOString(),
});

const buildLeaseAvailableFilter = (stationId: string, now: Date): string =>
  [
    "claimed_by.is.null",
    `claimed_by.eq.${stationId}`,
    "claim_expires_at.is.null",
    `claim_expires_at.lt.${now.toISOString()}`,
  ].join(",");

const isLeaseActiveForOtherStation = (
  order: Record<string, unknown>,
  stationId: string,
  now = new Date(),
): boolean => {
  const claimedBy = typeof order.claimed_by === "string" ? order.claimed_by : "";
  if (!claimedBy || claimedBy === stationId) {
    return false;
  }

  const expiresAt = typeof order.claim_expires_at === "string"
    ? new Date(order.claim_expires_at)
    : null;
  return Boolean(expiresAt && Number.isFinite(expiresAt.getTime()) && expiresAt > now);
};

const claimConflictResponse = async (c: Context, orderId: string, stationId: string): Promise<Response> => {
  const { data, error } = await loadOrder(orderId);
  if (error) {
    return c.json({ error: error.message }, 404);
  }

  const claimedBy = typeof data?.claimed_by === "string" ? data.claimed_by : "其他平板";
  const message = isLeaseActiveForOtherStation(data as Record<string, unknown>, stationId)
    ? `Order is already claimed by ${claimedBy}`
    : "Order could not be claimed";

  return c.json({ error: message, order: data }, 409);
};

const writeAuditEvent = async (event: AuditEventInput): Promise<void> => {
  const { error } = await supabase
    .from("pos_audit_events")
    .insert({
      action: event.action,
      order_id: event.orderId ?? null,
      register_session_id: event.registerSessionId ?? null,
      station_id: event.stationId ?? "",
      actor: "pos-api",
      metadata: event.metadata ?? {},
    });

  if (error) {
    console.error(JSON.stringify({
      scope: "pos-audit",
      action: event.action,
      error: error.message,
    }));
  }
};

const requireOrderClaim = async (c: Context, orderId: string, stationId: string): Promise<Response | null> => {
  const { data, error } = await loadOrder(orderId);
  if (error) {
    return c.json({ error: error.message }, 404);
  }

  if (!data?.claimed_by || data.claimed_by !== stationId) {
    return claimConflictResponse(c, orderId, stationId);
  }

  const expiresAt = typeof data.claim_expires_at === "string" ? new Date(data.claim_expires_at) : null;
  if (!expiresAt || !Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date()) {
    return c.json({ error: "Order claim has expired", order: data }, 409);
  }

  return null;
};

const appendVoidNote = (currentNote: unknown, voidNote: unknown): string => {
  const baseNote = typeof currentNote === "string" ? currentNote.trim() : "";
  const reason = sanitizeText(voidNote, "").slice(0, 240);
  const suffix = reason ? `作廢：${reason}` : "作廢";
  return [baseNote, suffix].filter(Boolean).join(" / ").slice(0, 500);
};

const validateOrderInput = (input: CreateOrderInput): string | null => {
  if (!input.orderNumber?.trim()) {
    return "orderNumber is required";
  }

  if (input.serviceMode === "delivery" && !input.deliveryAddress?.trim()) {
    return "deliveryAddress is required for delivery orders";
  }

  if (input.requestedFulfillmentAt && !normalizeRequestedFulfillmentAt(input.requestedFulfillmentAt)) {
    return "requestedFulfillmentAt must be a valid ISO datetime";
  }

  if (!Number.isInteger(input.subtotal) || input.subtotal < 0) {
    return "subtotal must be a non-negative integer";
  }

  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    return "at least one order line is required";
  }

  for (const line of input.lines) {
    if (!line.productSku || !line.name) {
      return "each order line requires productSku and name";
    }
    if (!Number.isInteger(line.unitPrice) || line.unitPrice < 0) {
      return "unitPrice must be a non-negative integer";
    }
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      return "quantity must be a positive integer";
    }
  }

  return null;
};

const normalizeRequestedFulfillmentAt = (value: unknown): string | null => {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const productCategories: MenuCategory[] = ["coffee", "tea", "food", "retail"];
const serviceModes: ServiceMode[] = ["dine-in", "takeout", "delivery"];
const labelModes: PrintLabelMode[] = ["receipt", "label", "both"];
const knownPermissions = [
  "manageProducts",
  "managePrinting",
  "managePayments",
  "manageReports",
  "manageCustomers",
  "manageAccess",
  "voidOrders",
  "closeRegister",
];

const loadSetting = async <SettingValue>(
  key: AdminSettingKey,
  fallback: SettingValue,
): Promise<SettingValue> => {
  const { data, error } = await supabase
    .from("pos_settings")
    .select("value")
    .eq("key", key)
    .single();

  if (error || !data?.value) {
    return fallback;
  }

  return data.value as SettingValue;
};

const readProductChannel = (channel: string | undefined): ProductChannel => {
  if (channel === "online" || channel === "qr" || channel === "pos") {
    return channel;
  }

  return "pos";
};

const isPrintStatus = (status: unknown): status is PrintStatus =>
  status === "queued" || status === "printed" || status === "skipped" ||
  status === "failed";

const isPosPaymentStatus = (status: unknown): status is Extract<PaymentStatus, "pending" | "authorized" | "paid"> =>
  status === "pending" || status === "authorized" || status === "paid";

const isWebhookPaymentStatus = (
  status: unknown,
): status is Extract<PaymentStatus, "authorized" | "paid" | "failed" | "expired" | "refunded"> =>
  status === "authorized" || status === "paid" || status === "failed" ||
  status === "expired" || status === "refunded";

const requireAdmin = (c: Context): Response | null => {
  if (!adminPin) {
    return c.json({ error: "POS_ADMIN_PIN is not configured" }, 503);
  }

  if (c.req.header("x-pos-admin-pin") !== adminPin) {
    return c.json({ error: "Invalid admin PIN" }, 401);
  }

  return null;
};

const requirePaymentWebhookSecret = (c: Context): Response | null => {
  if (!paymentWebhookSecret) {
    return c.json({ error: "POS_PAYMENT_WEBHOOK_SECRET is not configured" }, 503);
  }

  if (c.req.header("x-pos-payment-webhook-secret") !== paymentWebhookSecret) {
    return c.json({ error: "Invalid payment webhook secret" }, 401);
  }

  return null;
};

const sanitizePaymentProvider = (value: unknown): string =>
  sanitizeText(value, "unknown").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40) || "unknown";

const normalizeUuid = (value: unknown): string | null => {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const normalized = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : null;
};

const validatePaymentWebhookInput = (input: PaymentWebhookInput): string | null => {
  if (!input.eventId?.trim()) {
    return "eventId is required";
  }

  if (!input.orderId?.trim() && !input.orderNumber?.trim()) {
    return "orderId or orderNumber is required";
  }

  if (input.orderId && !normalizeUuid(input.orderId)) {
    return "orderId must be a UUID";
  }

  if (!isWebhookPaymentStatus(input.paymentStatus)) {
    return "paymentStatus must be authorized, paid, failed, expired, or refunded";
  }

  if (input.amount !== undefined && input.amount !== null && (!Number.isInteger(input.amount) || input.amount < 0)) {
    return "amount must be a non-negative integer";
  }

  return null;
};

const validateProductUpdateInput = (
  input: ProductUpdateInput,
): {
  payload: Record<string, unknown>;
  error: string | null;
} => {
  const payload: Record<string, unknown> = {};

  if (typeof input.name !== "string" || input.name.trim().length === 0) {
    return { payload, error: "name is required" };
  }
  payload.name = input.name.trim();

  if (!input.category || !productCategories.includes(input.category)) {
    return { payload, error: "category is invalid" };
  }
  payload.category = input.category;

  const price = input.price;
  if (!Number.isInteger(price) || typeof price !== "number" || price < 0) {
    return { payload, error: "price must be a non-negative integer" };
  }
  payload.price = price;

  if (!Array.isArray(input.tags) || !input.tags.every((tag) => typeof tag === "string")) {
    return { payload, error: "tags must be an array of strings" };
  }
  payload.tags = input.tags.map((tag) => tag.trim()).filter(Boolean);

  if (typeof input.accent !== "string" || !/^#[0-9a-fA-F]{6}$/.test(input.accent)) {
    return { payload, error: "accent must be a hex color" };
  }
  payload.accent = input.accent;

  if (typeof input.isAvailable !== "boolean") {
    return { payload, error: "isAvailable must be a boolean" };
  }
  payload.is_available = input.isAvailable;

  const sortOrder = input.sortOrder;
  if (!Number.isInteger(sortOrder) || typeof sortOrder !== "number") {
    return { payload, error: "sortOrder must be an integer" };
  }
  payload.sort_order = sortOrder;

  if (typeof input.posVisible !== "boolean") {
    return { payload, error: "posVisible must be a boolean" };
  }
  payload.pos_visible = input.posVisible;

  if (typeof input.onlineVisible !== "boolean") {
    return { payload, error: "onlineVisible must be a boolean" };
  }
  payload.online_visible = input.onlineVisible;

  if (typeof input.qrVisible !== "boolean") {
    return { payload, error: "qrVisible must be a boolean" };
  }
  payload.qr_visible = input.qrVisible;

  if (typeof input.prepStation !== "string" || input.prepStation.trim().length === 0) {
    return { payload, error: "prepStation is required" };
  }
  payload.prep_station = input.prepStation.trim();

  if (typeof input.printLabel !== "boolean") {
    return { payload, error: "printLabel must be a boolean" };
  }
  payload.print_label = input.printLabel;

  if (input.inventoryCount === null || input.inventoryCount === undefined) {
    payload.inventory_count = null;
  } else if (
    typeof input.inventoryCount !== "number" ||
    !Number.isInteger(input.inventoryCount) ||
    input.inventoryCount < 0
  ) {
    return { payload, error: "inventoryCount must be null or a non-negative integer" };
  } else {
    payload.inventory_count = input.inventoryCount;
  }

  if (input.lowStockThreshold === null || input.lowStockThreshold === undefined) {
    payload.low_stock_threshold = null;
  } else if (
    typeof input.lowStockThreshold !== "number" ||
    !Number.isInteger(input.lowStockThreshold) ||
    input.lowStockThreshold < 0
  ) {
    return { payload, error: "lowStockThreshold must be null or a non-negative integer" };
  } else {
    payload.low_stock_threshold = input.lowStockThreshold;
  }

  if (input.soldOutUntil === null || input.soldOutUntil === undefined || input.soldOutUntil === "") {
    payload.sold_out_until = null;
  } else {
    const soldOutUntil = new Date(input.soldOutUntil);
    if (Number.isNaN(soldOutUntil.getTime())) {
      return { payload, error: "soldOutUntil must be null or an ISO datetime" };
    }
    payload.sold_out_until = soldOutUntil.toISOString();
  }

  return { payload, error: null };
};

const validateCreateMemberInput = (
  input: CreateMemberInput,
): {
  payload: {
    lineUserId: string | null;
    displayName: string;
    openingBalance: number;
    note: string;
  };
  error: string | null;
} => {
  const payload = {
    lineUserId: null as string | null,
    displayName: "",
    openingBalance: 0,
    note: "",
  };

  if (input.lineUserId !== undefined && input.lineUserId !== null && typeof input.lineUserId !== "string") {
    return { payload, error: "lineUserId must be a string" };
  }
  payload.lineUserId = input.lineUserId?.trim() ? input.lineUserId.trim().slice(0, 160) : null;

  if (typeof input.displayName !== "string" || input.displayName.trim().length === 0) {
    return { payload, error: "displayName is required" };
  }
  payload.displayName = input.displayName.trim().slice(0, 120);

  const openingBalance = input.openingBalance ?? 0;
  if (!Number.isInteger(openingBalance) || openingBalance < 0) {
    return { payload, error: "openingBalance must be a non-negative integer" };
  }
  payload.openingBalance = openingBalance;

  if (input.note !== undefined && input.note !== null && typeof input.note !== "string") {
    return { payload, error: "note must be a string" };
  }
  payload.note = input.note?.trim().slice(0, 500) ?? "";

  return { payload, error: null };
};

const validateWalletAdjustmentInput = (
  input: WalletAdjustmentInput,
): {
  payload: {
    amount: number;
    entryType: "top_up" | "adjustment";
    note: string;
  };
  error: string | null;
} => {
  const payload = {
    amount: 0,
    entryType: "adjustment" as "top_up" | "adjustment",
    note: "",
  };

  const amount = input.amount;
  if (!Number.isInteger(amount) || amount === undefined || amount === 0) {
    return { payload, error: "amount must be a non-zero integer" };
  }
  payload.amount = amount;

  if (input.entryType !== undefined && input.entryType !== "top_up" && input.entryType !== "adjustment") {
    return { payload, error: "entryType must be top_up or adjustment" };
  }
  payload.entryType = input.entryType ?? (amount > 0 ? "top_up" : "adjustment");

  if (input.note !== undefined && input.note !== null && typeof input.note !== "string") {
    return { payload, error: "note must be a string" };
  }
  payload.note = input.note?.trim().slice(0, 500) ?? "";

  return { payload, error: null };
};

const sanitizeIdentifier = (value: unknown, fallback: string): string =>
  typeof value === "string" && value.trim() ? value.trim() : fallback;

const sanitizeText = (value: unknown, fallback: string): string =>
  typeof value === "string" && value.trim() ? value.trim() : fallback;

const validatePrinterSettings = (input: unknown): {
  value: PrinterSettings | null;
  error: string | null;
} => {
  if (!input || typeof input !== "object") {
    return { value: null, error: "printer_settings must be an object" };
  }

  const settings = input as Partial<PrinterSettings>;
  if (!Array.isArray(settings.stations) || !Array.isArray(settings.rules)) {
    return { value: null, error: "printer_settings requires stations and rules" };
  }

  const stations: PrintStationSetting[] = [];
  for (const [index, station] of settings.stations.entries()) {
    if (!station || typeof station !== "object") {
      return { value: null, error: "each station must be an object" };
    }
    const entry = station as Partial<PrintStationSetting>;
    const id = sanitizeIdentifier(entry.id, `station-${index + 1}`);
    const port = Number(entry.port);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      return { value: null, error: "station port must be between 1 and 65535" };
    }
    stations.push({
      id,
      name: sanitizeText(entry.name, id),
      host: sanitizeText(entry.host, "192.168.1.100"),
      port,
      protocol: sanitizeText(entry.protocol, "EZPL over TCP"),
      enabled: Boolean(entry.enabled),
      autoPrint: Boolean(entry.autoPrint),
    });
  }

  if (stations.length === 0) {
    return { value: null, error: "at least one print station is required" };
  }

  const stationIds = new Set(stations.map((station) => station.id));
  const rules: PrintRuleSetting[] = [];
  for (const [index, rule] of settings.rules.entries()) {
    if (!rule || typeof rule !== "object") {
      return { value: null, error: "each print rule must be an object" };
    }
    const entry = rule as Partial<PrintRuleSetting>;
    const stationId = sanitizeIdentifier(entry.stationId, stations[0].id);
    const serviceMode = entry.serviceMode;
    const labelMode = entry.labelMode;
    const copies = Number(entry.copies);
    if (!stationIds.has(stationId)) {
      return { value: null, error: "print rule stationId is invalid" };
    }
    if (!serviceMode || !serviceModes.includes(serviceMode)) {
      return { value: null, error: "print rule serviceMode is invalid" };
    }
    if (!labelMode || !labelModes.includes(labelMode)) {
      return { value: null, error: "print rule labelMode is invalid" };
    }
    if (!Number.isInteger(copies) || copies < 1 || copies > 5) {
      return { value: null, error: "print rule copies must be 1 to 5" };
    }
    const categories = Array.isArray(entry.categories)
      ? entry.categories.filter((category): category is MenuCategory =>
        productCategories.includes(category as MenuCategory)
      )
      : [];
    rules.push({
      id: sanitizeIdentifier(entry.id, `rule-${index + 1}`),
      name: sanitizeText(entry.name, `規則 ${index + 1}`),
      serviceMode,
      stationId,
      categories,
      copies,
      labelMode,
      enabled: Boolean(entry.enabled),
    });
  }

  return { value: { stations, rules }, error: null };
};

const validateAccessControl = (input: unknown): {
  value: AccessControlSettings | null;
  error: string | null;
} => {
  if (!input || typeof input !== "object") {
    return { value: null, error: "access_control must be an object" };
  }

  const settings = input as Partial<AccessControlSettings>;
  if (!Array.isArray(settings.roles)) {
    return { value: null, error: "access_control requires roles" };
  }

  const roles: RoleSetting[] = settings.roles.map((role, index) => {
    const entry = role as Partial<RoleSetting>;
    const permissions = Array.isArray(entry.permissions)
      ? entry.permissions.filter((permission): permission is string =>
        knownPermissions.includes(permission)
      )
      : [];

    return {
      id: sanitizeIdentifier(entry.id, `role-${index + 1}`),
      name: sanitizeText(entry.name, `角色 ${index + 1}`),
      pinRequired: Boolean(entry.pinRequired),
      permissions,
    };
  });

  if (roles.length === 0) {
    return { value: null, error: "at least one role is required" };
  }

  return { value: { roles }, error: null };
};

const validateAdminSetting = (
  key: AdminSettingKey,
  input: unknown,
): {
  value: PrinterSettings | AccessControlSettings | null;
  error: string | null;
} => {
  if (key === "printer_settings") {
    return validatePrinterSettings(input);
  }

  return validateAccessControl(input);
};

const app = new Hono();
app.route("/", api);
app.route("/pos-api", api);

Deno.serve(app.fetch);
