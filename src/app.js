// src/app.js
import express from "express";
import morgan from "morgan";
import bodyParser from "body-parser";
import webhookRoutes from "./routes/webhook.routes.js";
import { logRequest } from "./middlewares/logger.js";
import { errorHandler } from "./middlewares/errorHandler.js";

const app = express();

// Định nghĩa các endpoint không cần kiểm tra API key
// const allowedPaths = ["/webhook", "/fb-webhook", "/ig-webhook", "/messaging-webhook", "/public", "/health"];

// Parse JSON và lưu raw body nếu cần xác thực chữ ký
app.use(bodyParser.json({
  verify: (req, res, buf) => { req.rawBody = buf.toString("utf8"); }
}));

// Static files (nếu có)
app.use(express.static("public"));

// app.use((req, res, next) => {
//   // Nếu đường dẫn nằm trong danh sách allowedPaths thì bỏ qua kiểm tra token
//   if (allowedPaths.includes(req.path)) return next();

//   // Lấy giá trị API key từ header và biến môi trường (mặc định "your-secret-token" nếu chưa cài đặt)
//   const apiKeyHeader = req.headers["x-api-key"];
//   const expectedApiKey = process.env.API_KEY || "your-secret-token";

//   // Nếu không gửi API key
//   if (!apiKeyHeader) {
//     console.warn(`⚠️ Missing API key for ${req.method} ${req.path}`);
//     return res.status(401).json({ error: "No API key provided" });
//   }

//   // Kiểm tra API key có khớp không
//   if (apiKeyHeader !== expectedApiKey) {
//     console.warn(`⚠️ Unauthorized access on ${req.method} ${req.path} with API key: ${apiKeyHeader}`);
//     return res.status(401).json({ error: "Unauthorized" });
//   }

//   next();
// });


function requireAuth(req, res, next) {
  if (NO_AUTH) return next();

  const auth = req.headers["authorization"] || "";
  const bearer = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : null;

  const apiKey = req.headers["x-api-key"] ? String(req.headers["x-api-key"]) : null;
  const token = bearer || apiKey;

  if (!token || token !== process.env.MCP_ACCESS_TOKEN) {
    return res.status(401).json({ error: { message: "Unauthorized" } });
  }
  next();
}

const NO_AUTH = String(process.env.MCP_NO_AUTH || "").toLowerCase() === "true";

app.use("/mcp", (req, res, next) => {
  if (true) return next();     // ✅ bypass auth
  return requireAuth(req, res, next);
});

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || "apptmh0D4kfxxCTn1";
const MEMBERS_TABLE = process.env.MEMBERS_TABLE || "Customers";

const FIELD_MEMBER_NAME = process.env.FIELD_MEMBER_NAME || "Name";
const FIELD_MEMBER_PHONE = process.env.FIELD_MEMBER_PHONE || "phone";
const FIELD_DELETED = process.env.FIELD_DELETED || "deleted_flag";
const FIELD_CREATED = process.env.FIELD_CREATED || "Created";

if (!AIRTABLE_API_KEY) throw new Error("Missing AIRTABLE_API_KEY");


// ====== Airtable helpers ======
const AIRTABLE_API = "https://api.airtable.com/v0";

function airtableHeaders() {
  return {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    "Content-Type": "application/json",
  };
}


// Normalize phone: keep digits, convert +84... -> 0...
function normalizePhone(raw = "") {
  const digits = String(raw).replace(/\D/g, "");
  if (digits.startsWith("84") && digits.length >= 11) return "0" + digits.slice(2);
  return digits;
}

function normalizeName(raw = "") {
  return String(raw).trim().replace(/\s+/g, " ");
}

function toTime(v) {
  const t = new Date(v || 0).getTime();
  return Number.isFinite(t) ? t : 0;
}

async function airtableList({ tableName, filterByFormula, fields = [], pageSize = 100 }) {
  const params = new URLSearchParams();
  if (filterByFormula) params.set("filterByFormula", filterByFormula);
  for (const f of fields) params.append("fields[]", f);
  params.set("pageSize", String(pageSize));

  const url = `${AIRTABLE_API}/${AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}?${params.toString()}`;
  const r = await fetch(url, { headers: airtableHeaders() });
  const data = await r.json();
  if (!r.ok) throw new Error(`Airtable error (${r.status}): ${JSON.stringify(data)}`);
  return data.records || [];
}


// ===== Helpers =====
function ok(id, result, headers = {}) {
  return { status: 200, body: { jsonrpc: "2.0", id, result }, headers };
}
function err(id, code, message, headers = {}) {
  return { status: 200, body: { jsonrpc: "2.0", id, error: { code, message } }, headers };
}

// ===== MCP TOOLS =====
const TOOLS = [
  {
    name: "member.lookup_by_phone",
    description:
      "Lookup a member by phone number. Normalizes phone, filters deleted=true, returns newest record.",
    inputSchema: {
      type: "object",
      properties: { phone: { type: "string" } },
      required: ["phone"],
      additionalProperties: false,
    },
  },
  {
    name: "member.lookup_by_name",
    description:
      "Lookup members by name (partial match). Filters deleted=true, returns up to 5 newest matches with phone_last4.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
      additionalProperties: false,
    },
  },
];

// ===== TOOL IMPLEMENTATION =====
async function lookupByPhone({ phone }) {
  const p = normalizePhone(phone);
  if (!p) {
    return { content: [{ type: "text", text: JSON.stringify({ found: false, count: 0, members: [] }) }] };
  }

  // Airtable formula: AND({Phone}="0987...", NOT({deleted}))
  // Checkbox deleted: TRUE/blank
  const formula = `AND({${FIELD_MEMBER_PHONE}}="${p}", NOT({${FIELD_DELETED}}))`;

  const records = await airtableList({
    tableName: MEMBERS_TABLE,
    filterByFormula: formula,
    fields: [
      FIELD_MEMBER_NAME,
      FIELD_MEMBER_PHONE,
      // "Chapter",
      // "Department",
      "member_status",
      "Bài viết giới thiệu về thành viên",
      FIELD_DELETED,
      FIELD_CREATED,
    ],
  });

  // newest first
  records.sort((a, b) => toTime(b.fields?.[FIELD_CREATED]) - toTime(a.fields?.[FIELD_CREATED]));

  const top = records[0];
  const members = top
    ? [
        {
          member_id: top.id,
          Name: top.fields?.[FIELD_MEMBER_NAME] || "",
          // chapter: top.fields?.["Chapter"] || "",
          "Bài viết giới thiệu về thành viên": top.fields?.["Bài viết giới thiệu về thành viên"] || "",
          member_status: top.fields?.["member_status"] || "",
        },
      ]
    : [];

  const payload = { found: members.length > 0, count: records.length, members };

  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
  };
}

async function lookupByName({ name }) {
  const n = normalizeName(name);
  if (!n) {
    return { content: [{ type: "text", text: JSON.stringify({ found: false, count: 0, members: [] }) }] };
  }

  // SEARCH("Nguyễn Văn A",{FullName}) is case-insensitive
  // Escape quotes for formula safety
  const safe = n.replace(/"/g, '\\"');

  const formula = `AND(SEARCH("${safe}", {${FIELD_MEMBER_NAME}}), NOT({${FIELD_DELETED}}))`;

  const records = await airtableList({
    tableName: MEMBERS_TABLE,
    filterByFormula: formula,
    fields: [
      FIELD_MEMBER_NAME,
      FIELD_MEMBER_PHONE,
      // "Chapter",
      // "Department",
      "member_status",
      "Bài viết giới thiệu về thành viên",
      FIELD_DELETED,
      FIELD_CREATED,
    ],
  });

  // newest first
  records.sort((a, b) => toTime(b.fields?.[FIELD_CREATED]) - toTime(a.fields?.[FIELD_CREATED]));

  const members = records.slice(0, 5).map((r) => {
    const last4 = normalizePhone(r.fields?.[FIELD_MEMBER_PHONE] || "").slice(-4);
    return {
      member_id: r.id,
      Name: r.fields?.[FIELD_MEMBER_NAME] || "",
      phone_last4: last4,
      // chapter: r.fields?.["Chapter"] || "",
      "Bài viết giới thiệu về thành viên": r.fields?.["Bài viết giới thiệu về thành viên"] || "",
      member_status: r.fields?.["member_status"] || "",
    };
  });

  const payload = { found: members.length > 0, count: records.length, members };

  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
  };
}

// ====== POST /mcp (JSON-RPC) ======
async function handler(req, res) {
  try {
    const { id, method, params } = req.body || {};

    if (!method) {
      const out = err(id ?? null, 32600, "Invalid Request");
      return res.status(out.status).json(out.body);
    }

    if (method === "initialize") {
      const out = ok(id, {
        protocolVersion: "2025-06-18",
        serverInfo: { name: "jci-mcp", version: "1.0.0" },
        capabilities: { tools: {} },
      });
      return res.status(out.status).json(out.body);
    }

    if (method === "tools/list") {
      const out = ok(id, { tools: TOOLS });
      return res.status(out.status).json(out.body);
    }

    if (method === "tools/call") {
      const toolName = params?.name;
      const args = params?.arguments || {};

      if (!toolName) {
        const out = err(id, 32602, "Missing tool name");
        return res.status(out.status).json(out.body);
      }

      if (toolName === "member.lookup_by_phone") {
        const result = await lookupByPhone(args);
        const out = ok(id, result);
        return res.status(out.status).json(out.body);
      }

      if (toolName === "member.lookup_by_name") {
        const result = await lookupByName(args);
        const out = ok(id, result);
        return res.status(out.status).json(out.body);
      }

      const out = err(id, 32601, `Unknown tool: ${toolName}`);
      return res.status(out.status).json(out.body);
    }

    const out = err(id, 32601, `Method not found: ${method}`);
    return res.status(out.status).json(out.body);

  } catch (e) {
    console.error("MCP error:", e);
    return res.status(200).json({
      jsonrpc: "2.0",
      id: req.body?.id ?? null,
      error: { code: 32000, message: String(e?.message || e) },
    });
  }
}

// ===== GET /mcp  (SSE keep-alive) =====
function handlerOrSSE(req, res) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // ping mỗi 15s để giữ kết nối
  const timer = setInterval(() => {
    res.write(`event: ping\ndata: {}\n\n`);
  }, 15000);

  req.on("close", () => {
    clearInterval(timer);
  });
}

// ===== ROUTES =====
app.post("/mcp", handler);
app.get("/mcp", handlerOrSSE);

// Ghi log bằng morgan & middleware custom
app.use(morgan("dev"));
app.use(logRequest);

// Đăng ký route – các endpoint liên quan đến webhook và hash
app.use("/", webhookRoutes);

// Định nghĩa các endpoint khác
app.get('/health', (req, res) => {
  res.json({ status: "ok" });
});

// Các route khác (vd: homepage)
app.get("/", (req, res) => {
  res.send("This is homepage.");
});

// Centralized error handler
app.use(errorHandler);

export default app;
