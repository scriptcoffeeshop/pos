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
const productSelect = "id, sku, name, category, price, tags, accent, is_available, sort_order";

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
  const { data, error } = await supabase
    .from("products")
    .select(productSelect)
    .eq("is_available", true)
    .order("sort_order", { ascending: true });

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ products: data });
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

  return { payload, error: null };
};

const app = new Hono();
app.route("/", api);
app.route("/pos-api", api);

Deno.serve(app.fetch);
