import { Hono } from "@hono/hono";
import { cors } from "@hono/hono/cors";
import type { Context } from "@hono/hono";
import { createClient } from "@supabase/supabase-js";

type MenuCategory = "coffee" | "tea" | "food" | "retail";
type PaymentMethod = "cash" | "card" | "line-pay" | "jkopay" | "transfer";
type ServiceMode = "dine-in" | "takeout" | "delivery";
type OrderSource = "counter" | "qr" | "online";
type OrderStatus = "new" | "preparing" | "ready" | "served" | "failed";
type PaymentStatus = "pending" | "authorized" | "paid" | "expired" | "failed";
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
  note?: string;
  subtotal: number;
  paymentMethod?: PaymentMethod;
  paymentStatus?: PaymentStatus;
  lines: OrderLineInput[];
}

interface UpdateStatusInput {
  status: OrderStatus;
  stationId?: string;
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
}

interface CloseRegisterInput {
  closingCash?: number;
  note?: string;
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
const registerSessionSelect =
  "id, status, opened_at, closed_at, opening_cash, closing_cash, expected_cash, cash_sales, non_cash_sales, pending_total, order_count, note";
const defaultOrderLeaseSeconds = 180;
const maxOrderLeaseSeconds = 900;

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

  return c.json({ session: data }, 201);
});

api.post("/register/close", async (c) => {
  const authError = requireAdmin(c);
  if (authError) {
    return authError;
  }

  const input: CloseRegisterInput = await c.req.json<CloseRegisterInput>().catch(() => ({}));
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
      note,
    })
    .eq("id", openSession.session.id)
    .eq("status", "open")
    .select(registerSessionSelect)
    .single();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

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

  const { data, error } = await supabase
    .from("products")
    .update(payload)
    .eq("id", productId)
    .select(productSelect)
    .single();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ product: data });
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

  return c.json({ setting: data });
});

api.get("/orders", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 100);
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

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      order_number: input.orderNumber,
      source: input.source ?? "counter",
      service_mode: input.serviceMode ?? "takeout",
      customer_name: input.customerName?.trim() || "現場客",
      customer_phone: input.customerPhone?.trim() ?? "",
      note: input.note?.trim() ?? "",
      subtotal: input.subtotal,
      payment_method: input.paymentMethod ?? "cash",
      payment_status: input.paymentStatus ?? "pending",
      status: "new",
    })
    .select("*")
    .single();

  if (orderError) {
    return c.json({ error: orderError.message }, 500);
  }

  const orderItems = input.lines.map((line) => ({
    order_id: order.id,
    product_id: line.productId ?? null,
    product_sku: line.productSku,
    name: line.name,
    unit_price: line.unitPrice,
    quantity: line.quantity,
    options: line.options ?? [],
  }));

  const { error: itemError } = await supabase.from("order_items").insert(
    orderItems,
  );
  if (itemError) {
    return c.json({ error: itemError.message }, 500);
  }

  const { data: savedOrder, error: savedOrderError } = await loadOrder(order.id);
  if (savedOrderError) {
    return c.json({ error: savedOrderError.message }, 500);
  }

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
  note: string;
}

interface RegisterOrderSummaryRow {
  subtotal: number;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  status: OrderStatus;
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
  "expected_cash" | "cash_sales" | "non_cash_sales" | "pending_total" | "order_count"
>> => {
  const { data, error } = await supabase
    .from("orders")
    .select("subtotal, payment_method, payment_status, status")
    .gte("created_at", openedAt)
    .lte("created_at", closedAt.toISOString());

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as RegisterOrderSummaryRow[];
  const summary = rows.reduce(
    (current, order) => {
      if (order.status === "failed") {
        return current;
      }

      const subtotal = Math.max(Number(order.subtotal) || 0, 0);
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
    },
  );

  return {
    ...summary,
    expected_cash: openingCash + summary.cash_sales,
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

const validateOrderInput = (input: CreateOrderInput): string | null => {
  if (!input.orderNumber?.trim()) {
    return "orderNumber is required";
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

const requireAdmin = (c: Context): Response | null => {
  if (!adminPin) {
    return c.json({ error: "POS_ADMIN_PIN is not configured" }, 503);
  }

  if (c.req.header("x-pos-admin-pin") !== adminPin) {
    return c.json({ error: "Invalid admin PIN" }, 401);
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
