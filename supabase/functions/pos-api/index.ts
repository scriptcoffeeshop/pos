import { Hono } from "@hono/hono";
import { cors } from "@hono/hono/cors";
import { createClient } from "@supabase/supabase-js";

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

const supabaseUrl = Deno.env.get("SUPABASE_URL") ??
  Deno.env.get("VITE_SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

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

api.use(
  "*",
  cors({
    origin: "*",
    allowHeaders: ["authorization", "x-client-info", "apikey", "content-type"],
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
    .select(
      "id, sku, name, category, price, tags, accent, is_available, sort_order",
    )
    .eq("is_available", true)
    .order("sort_order", { ascending: true });

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ products: data });
});

api.get("/orders", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 100);
  const { data, error } = await supabase
    .from("orders")
    .select("*, order_items(*)")
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

  return c.json({ order }, 201);
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

  return c.json({ order: data });
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

const app = new Hono();
app.route("/", api);
app.route("/pos-api", api);

Deno.serve(app.fetch);
