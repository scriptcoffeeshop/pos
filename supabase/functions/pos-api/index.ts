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
}

interface PrintJobInput {
  orderId: string;
  payload: string;
  stationName?: string;
  printerHost?: string;
  printerPort?: number;
  protocol?: string;
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

const orderSelect = "*, order_items(*), print_jobs(status, printed_at, created_at)";
const productSelect =
  "id, sku, name, category, price, tags, accent, is_available, sort_order, pos_visible, online_visible, qr_visible, prep_station, print_label";

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

api.patch("/orders/:id/status", async (c) => {
  const orderId = c.req.param("id");
  const input = await c.req.json<UpdateStatusInput>();

  if (
    !["new", "preparing", "ready", "served", "failed"].includes(input.status)
  ) {
    return c.json({ error: "Invalid order status" }, 400);
  }

  const { data, error } = await supabase
    .from("orders")
    .update({ status: input.status })
    .eq("id", orderId)
    .select("*")
    .single();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  const { data: savedOrder, error: savedOrderError } = await loadOrder(data.id);
  if (savedOrderError) {
    return c.json({ error: savedOrderError.message }, 500);
  }

  return c.json({ order: savedOrder });
});

api.post("/print-jobs", async (c) => {
  const input = await c.req.json<PrintJobInput>();

  if (!input.orderId || !input.payload) {
    return c.json({ error: "orderId and payload are required" }, 400);
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
    .select("*")
    .single();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ printJob: data }, 201);
});

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
