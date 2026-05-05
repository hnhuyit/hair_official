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

  const tokens = safe.split(/\s+/).filter(Boolean);
  const andSearch = tokens.map(t => `SEARCH("${t}", {${FIELD_MEMBER_NAME}})`).join(", ");
  const formula = `AND(${andSearch}, NOT({${FIELD_DELETED}}))`;

  // const formula = `AND(SEARCH("${safe}", {${FIELD_MEMBER_NAME}}), NOT({${FIELD_DELETED}}))`;

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

// ===== JSON-RPC HELPERS =====
function ok(id, result) {
  return {
    status: 200,
    body: {
      jsonrpc: "2.0",
      id,
      result
    }
  };
}

function err(id, code, message) {
  return {
    status: 200,
    body: {
      jsonrpc: "2.0",
      id,
      error: {
        code,
        message
      }
    }
  };
}

// ===== MCP TOOLS =====
const TOOLS = [
  {
    name: "user.create",
    description: "Create new JCI user when UID does not exist",
    inputSchema: {
      type: "object",
      properties: {
        uid: { type: "string" },
        name: { type: "string" },
        member_status: { type: "string", enum: ["guest", "member"] }
      },
      required: ["uid"]
    }
  },
  {
    name: "member.lookup_by_phone",
    description: "Lookup JCI member by phone number",
    inputSchema: {
      type: "object",
      properties: {
        phone: { type: "string" }
      },
      required: ["phone"]
    }
  },
  {
    name: "member.lookup_by_name",
    description: "Lookup JCI member by name",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" }
      },
      required: ["name"]
    }
  },
  {
    name: "partner.search",
    description: "Search internal JCI partner profiles by industry. Member only.",
    inputSchema: {
      type: "object",
      properties: {
        uid: { type: "string" },
        member_status: { type: "string", enum: ["guest", "member"] },
        industry: { type: "string" },
        limit: { type: "number", default: 3 }
      },
      required: ["uid", "member_status", "industry"]
    }
  }
];



// ====== POST /mcp ======
async function handler(req, res) {
  try {
    const { id, method, params } = req.body || {};

    if (!method) {
      const out = err(id ?? null, -32600, "Invalid Request");
      return res.status(out.status).json(out.body);
    }

    // 1. MCP initialize
    if (method === "initialize") {
      const out = ok(id, {
        protocolVersion: "2025-06-18",
        serverInfo: {
          name: "jci-mcp",
          version: "1.0.0"
        },
        capabilities: {
          tools: {}
        }
      });

      return res.status(out.status).json(out.body);
    }

    // 2. MCP tools/list
    if (method === "tools/list") {
      const out = ok(id, {
        tools: TOOLS
      });

      return res.status(out.status).json(out.body);
    }

    // 3. MCP tools/call
    if (method === "tools/call") {
      const toolName = params?.name;
      const args = params?.arguments || {};

      if (!toolName) {
        const out = err(id, -32602, "Missing tool name");
        return res.status(out.status).json(out.body);
      }

      // ===== USER CREATE =====
      if (toolName === "user.create") {
        if (!args.uid) {
          const out = err(id, -32602, "Missing uid");
          return res.status(out.status).json(out.body);
        }

        const result = await createUser(args);

        const out = ok(id, {
          content: [
            {
              type: "text",
              text: JSON.stringify(result)
            }
          ]
        });

        return res.status(out.status).json(out.body);
      }

      // ===== MEMBER LOOKUP BY PHONE =====
      if (toolName === "member.lookup_by_phone") {
        if (!args.phone) {
          const out = err(id, -32602, "Missing phone");
          return res.status(out.status).json(out.body);
        }

        const result = await lookupByPhone(args);

        const out = ok(id, {
          content: [
            {
              type: "text",
              text: JSON.stringify(result)
            }
          ]
        });

        return res.status(out.status).json(out.body);
      }

      // ===== MEMBER LOOKUP BY NAME =====
      if (toolName === "member.lookup_by_name") {
        if (!args.name) {
          const out = err(id, -32602, "Missing name");
          return res.status(out.status).json(out.body);
        }

        const result = await lookupByName(args);

        const out = ok(id, {
          content: [
            {
              type: "text",
              text: JSON.stringify(result)
            }
          ]
        });

        return res.status(out.status).json(out.body);
      }

      // ===== PARTNER SEARCH - MEMBER ONLY =====
      if (toolName === "partner.search") {
        if (!args.uid) {
          const out = err(id, -32602, "Missing uid");
          return res.status(out.status).json(out.body);
        }

        if (args.member_status !== "member") {
          const out = ok(id, {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  allowed: false,
                  message:
                    "Tính năng tra cứu dữ liệu nội bộ chỉ dành cho thành viên JCI."
                })
              }
            ]
          });

          return res.status(out.status).json(out.body);
        }

        if (!args.industry) {
          const out = err(id, -32602, "Missing industry");
          return res.status(out.status).json(out.body);
        }

        const result = await searchPartner({
          uid: args.uid,
          industry: args.industry,
          limit: args.limit || 3
        });

        const out = ok(id, {
          content: [
            {
              type: "text",
              text: JSON.stringify(result)
            }
          ]
        });

        return res.status(out.status).json(out.body);
      }

      const out = err(id, -32601, `Unknown tool: ${toolName}`);
      return res.status(out.status).json(out.body);
    }

    const out = err(id, -32601, `Method not found: ${method}`);
    return res.status(out.status).json(out.body);
  } catch (e) {
    console.error("MCP error:", e);

    return res.status(200).json({
      jsonrpc: "2.0",
      id: req.body?.id ?? null,
      error: {
        code: 32000,
        message: String(e?.message || e)
      }
    });
  }
}

// ===== GET /mcp - SSE KEEP ALIVE =====
function handlerOrSSE(req, res) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  res.write(`event: ready\ndata: {"status":"connected"}\n\n`);

  const timer = setInterval(() => {
    res.write(`event: ping\ndata: {}\n\n`);
  }, 15000);

  req.on("close", () => {
    clearInterval(timer);
  });
}

const NO_AUTH = String(process.env.MCP_NO_AUTH || "").toLowerCase() === "true";

function requireAuth(req, res, next) {
  if (NO_AUTH) return next();

  const auth = req.headers["authorization"] || "";
  const bearer = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : null;

  const apiKey = req.headers["x-api-key"]
    ? String(req.headers["x-api-key"]).trim()
    : null;

  const token = bearer || apiKey;

  if (!token || token !== process.env.MCP_ACCESS_TOKEN) {
    return res.status(401).json({ error: { message: "Unauthorized" } });
  }

  next();
}

app.use("/mcp", (req, res, next) => {
  if (true) return next();     // ✅ bypass auth
  return requireAuth(req, res, next);
});

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
