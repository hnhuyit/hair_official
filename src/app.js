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
const TABLE_CUSTOMERS = process.env.TABLE_CUSTOMERS || "Customers";

const FIELD_MEMBER_NAME = process.env.FIELD_MEMBER_NAME || "Name";
const FIELD_MEMBER_PHONE = process.env.FIELD_MEMBER_PHONE || "phone";
const FIELD_DELETED = process.env.FIELD_DELETED || "deleted_flag";
const FIELD_CREATED = process.env.FIELD_CREATED || "Created";

if (!AIRTABLE_API_KEY) throw new Error("Missing AIRTABLE_API_KEY");


// ====== Airtable helpers ======
const AIRTABLE_API = "https://api.airtable.com/v0";
// ✅ FIX Ở ĐÂY
const AIRTABLE_URL = `${AIRTABLE_API}/${AIRTABLE_BASE_ID}`;

function airtableHeaders() {
  return {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    "Content-Type": "application/json",
  };
}


function escapeFormulaValue(value = "") {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function maskPhone(phone = "") {
  const raw = String(phone).replace(/\D/g, "");
  if (raw.length < 4) return "****";
  return `****${raw.slice(-4)}`;
}

// async function airtableGet(table, query = "") {
//   const url = `${AIRTABLE_URL}/${encodeURIComponent(table)}${query}`;
//   const res = await fetch(url, { headers: airtableHeaders() });
//   const data = await res.json();

//   if (!res.ok) {
//     throw new Error(data?.error?.message || `Airtable GET error ${res.status}`);
//   }

//   return data;
// }

async function airtableGet(table, query = "") {
  if (!AIRTABLE_API_KEY) {
    throw new Error("Missing AIRTABLE_API_KEY");
  }

  if (!AIRTABLE_BASE_ID) {
    throw new Error("Missing AIRTABLE_BASE_ID");
  }

  const url = `${AIRTABLE_URL}/${encodeURIComponent(table)}${query}`;

  console.log("[Airtable GET]:", url);

  const controller = new AbortController();
  setTimeout(() => controller.abort(), 10000);

  const res = await fetch(url, {
    method: "GET",
    headers: airtableHeaders(),
    signal: controller.signal,
  });

  let data;

  try {
    data = await res.json();
  } catch (e) {
    console.error("[Airtable ERROR] Invalid JSON");
    throw new Error("Invalid Airtable response");
  }

  if (!res.ok) {
    console.error("[Airtable ERROR]:", data);
    throw new Error(data?.error?.message || `Airtable GET error ${res.status}`);
  }

  console.log("[Airtable SUCCESS]:", data.records?.length || 0);

  return data;
}

async function airtableCreate(table, fields) {
  const url = `${AIRTABLE_URL}/${encodeURIComponent(table)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: airtableHeaders(),
    body: JSON.stringify({ fields }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error?.message || `Airtable CREATE error ${res.status}`);
  }

  return data;
}

// // Normalize phone: keep digits, convert +84... -> 0...
// function normalizePhone(raw = "") {
//   const digits = String(raw).replace(/\D/g, "");
//   if (digits.startsWith("84") && digits.length >= 11) return "0" + digits.slice(2);
//   return digits;
// }

// function normalizeName(raw = "") {
//   return String(raw).trim().replace(/\s+/g, " ");
// }

// function toTime(v) {
//   const t = new Date(v || 0).getTime();
//   return Number.isFinite(t) ? t : 0;
// }

// async function airtableList({ tableName, filterByFormula, fields = [], pageSize = 100 }) {
//   const params = new URLSearchParams();
//   if (filterByFormula) params.set("filterByFormula", filterByFormula);
//   for (const f of fields) params.append("fields[]", f);
//   params.set("pageSize", String(pageSize));

//   const url = `${AIRTABLE_API}/${AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}?${params.toString()}`;
//   const r = await fetch(url, { headers: airtableHeaders() });
//   const data = await r.json();
//   if (!r.ok) throw new Error(`Airtable error (${r.status}): ${JSON.stringify(data)}`);
//   return data.records || [];
// }

// ===== TOOL IMPLEMENTATION =====

async function createUser(args) {
  log("createUser called with:", args);
  const uid = String(args.uid || args.zalo_uid || "").trim();
  const memberStatusRaw = String(args.member_status || "guest").trim().toLowerCase();

  const memberStatus = ["guest", "member"].includes(memberStatusRaw)
    ? memberStatusRaw
    : "guest";

  log("Parsed:", { uid, memberStatus });

  if (!uid) throw new Error("Missing uid");

  const formula = `{uid} = "${escapeFormulaValue(uid)}"`;

  const existing = await airtableGet(
    TABLE_CUSTOMERS,
    `?filterByFormula=${encodeURIComponent(formula)}&maxRecords=1`
  );

  log("Existing result:", existing.records?.length);
  if (existing.records?.length) {
    log("User exists");
    const record = existing.records[0];

    return {
      success: true,
      action: "exists",
      user: {
        uid,
        name: record.fields.Name || "",
        member_status: record.fields.member_status || memberStatus,
      },
    };
  }

  log("Creating new user...");
  const created = await airtableCreate(TABLE_CUSTOMERS, {
    uid: uid,
    Name: "Unknown User",
    member_status: memberStatus,
    // Source: "JCI Chatbot",
    // CreatedAt: new Date().toISOString(),
  });
  log("Created user:", created.id);

  return {
    success: true,
    action: "created",
    user: {
      uid,
      name: created.fields.Name || "Unknown User",
      member_status: created.fields.member_status,
    },
  };
}

// async function lookupByPhone({ phone }) {
//   const p = normalizePhone(phone);
//   if (!p) {
//     return { content: [{ type: "text", text: JSON.stringify({ found: false, count: 0, members: [] }) }] };
//   }

//   // Airtable formula: AND({Phone}="0987...", NOT({deleted}))
//   // Checkbox deleted: TRUE/blank
//   const formula = `AND({${FIELD_MEMBER_PHONE}}="${p}", NOT({${FIELD_DELETED}}))`;

//   const records = await airtableList({
//     tableName: MEMBERS_TABLE,
//     filterByFormula: formula,
//     fields: [
//       FIELD_MEMBER_NAME,
//       FIELD_MEMBER_PHONE,
//       // "Chapter",
//       // "Department",
//       "member_status",
//       "Bài viết giới thiệu về thành viên",
//       FIELD_DELETED,
//       FIELD_CREATED,
//     ],
//   });

//   // newest first
//   records.sort((a, b) => toTime(b.fields?.[FIELD_CREATED]) - toTime(a.fields?.[FIELD_CREATED]));

//   const top = records[0];
//   const members = top
//     ? [
//         {
//           member_id: top.id,
//           Name: top.fields?.[FIELD_MEMBER_NAME] || "",
//           // chapter: top.fields?.["Chapter"] || "",
//           "Bài viết giới thiệu về thành viên": top.fields?.["Bài viết giới thiệu về thành viên"] || "",
//           member_status: top.fields?.["member_status"] || "",
//         },
//       ]
//     : [];

//   const payload = { found: members.length > 0, count: records.length, members };

//   return {
//     content: [{ type: "text", text: JSON.stringify(payload) }],
//   };
// }

async function lookupByPhone(args) {
  log("lookupByPhone called with:", args);
  const phone = String(args.phone || "").trim();
  log("Raw phone:", phone);
  if (!phone) throw new Error("Missing phone");

  const cleanedPhone = phone.replace(/\D/g, "");
  log("Cleaned phone:", cleanedPhone);

  const formula = `
    FIND(
      "${escapeFormulaValue(cleanedPhone)}",
      SUBSTITUTE(SUBSTITUTE(SUBSTITUTE({phone}, " ", ""), "-", ""), "+", "")
    ) > 0
  `;

  const data = await airtableGet(
    TABLE_CUSTOMERS,
    `?filterByFormula=${encodeURIComponent(formula)}&maxRecords=5`
  );
  log("Records found:", data.records?.length);

  if (!data.records?.length) {
    return {
      found: false,
      message: "Chưa tìm thấy thành viên phù hợp.",
      members: [],
    };
  }

  return {
    found: true,
    count: data.records.length,
    members: data.records.map((r) => ({
      name: r.fields.Name || "",
      title: r.fields["CHỨC DANH"] || "",
      member_status: r.fields.member_status || "",
      membership_status: r.fields.MEMBER || "",
      chapter: r.fields.Chapter || "",
      company: r.fields["CÔNG TY"] || "",
      position: r.fields["CHỨC VỤ"] || "",
      industry: r.fields["NGÀNH NGHỀ"] || "",
      phone_masked: maskPhone(r.fields.phone),
      email_masked: r.fields.mail ? maskEmail(r.fields.mail) : "",
    })),
  };
}

// async function lookupByName({ name }) {
//   const n = normalizeName(name);
//   if (!n) {
//     return { content: [{ type: "text", text: JSON.stringify({ found: false, count: 0, members: [] }) }] };
//   }

//   // SEARCH("Nguyễn Văn A",{FullName}) is case-insensitive
//   // Escape quotes for formula safety
//   const safe = n.replace(/"/g, '\\"');

//   const tokens = safe.split(/\s+/).filter(Boolean);
//   const andSearch = tokens.map(t => `SEARCH("${t}", {${FIELD_MEMBER_NAME}})`).join(", ");
//   const formula = `AND(${andSearch}, NOT({${FIELD_DELETED}}))`;

//   // const formula = `AND(SEARCH("${safe}", {${FIELD_MEMBER_NAME}}), NOT({${FIELD_DELETED}}))`;

//   const records = await airtableList({
//     tableName: MEMBERS_TABLE,
//     filterByFormula: formula,
//     fields: [
//       FIELD_MEMBER_NAME,
//       FIELD_MEMBER_PHONE,
//       // "Chapter",
//       // "Department",
//       "member_status",
//       "Bài viết giới thiệu về thành viên",
//       FIELD_DELETED,
//       FIELD_CREATED,
//     ],
//   });

//   // newest first
//   records.sort((a, b) => toTime(b.fields?.[FIELD_CREATED]) - toTime(a.fields?.[FIELD_CREATED]));

//   const members = records.slice(0, 5).map((r) => {
//     const last4 = normalizePhone(r.fields?.[FIELD_MEMBER_PHONE] || "").slice(-4);
//     return {
//       member_id: r.id,
//       Name: r.fields?.[FIELD_MEMBER_NAME] || "",
//       phone_last4: last4,
//       // chapter: r.fields?.["Chapter"] || "",
//       "Bài viết giới thiệu về thành viên": r.fields?.["Bài viết giới thiệu về thành viên"] || "",
//       member_status: r.fields?.["member_status"] || "",
//     };
//   });

//   const payload = { found: members.length > 0, count: records.length, members };

//   return {
//     content: [{ type: "text", text: JSON.stringify(payload) }],
//   };
// }

async function lookupByName(args) {
  log("lookupByName called with:", args);
  const name = String(args.name || "").trim();
  if (!name) throw new Error("Missing name");

  const formula = `SEARCH(LOWER("${escapeFormulaValue(name)}"), LOWER({Name})) > 0`;

  const data = await airtableGet(
    TABLE_CUSTOMERS,
    `?filterByFormula=${encodeURIComponent(formula)}&maxRecords=10`
  );
  log("Records found:", data.records?.length);

  if (!data.records?.length) {
    return {
      found: false,
      message: "Chưa tìm thấy thành viên phù hợp.",
      members: [],
    };
  }

  return {
    found: true,
    count: data.records.length,
    need_disambiguation: data.records.length > 1,
    members: data.records.map((r) => ({
      name: r.fields.Name || "",
      title: r.fields["CHỨC DANH"] || "",
      member_status: r.fields.member_status || "",
      membership_status: r.fields.MEMBER || "",
      chapter: r.fields.Chapter || "",
      company: r.fields["CÔNG TY"] || "",
      position: r.fields["CHỨC VỤ"] || "",
      industry: r.fields["NGÀNH NGHỀ"] || "",
      phone_masked: maskPhone(r.fields.phone),
      email_masked: r.fields.mail ? maskEmail(r.fields.mail) : "",
    })),
  };
}

async function searchPartner(args) {
  log("searchPartner called with:", args);
  const uid = String(args.uid || "").trim();
  const memberStatus = String(args.member_status || "").trim();
  const industry = String(args.industry || "").trim();
  const limit = Number(args.limit || 3);
  log("Parsed:", { uid, memberStatus, industry });

  if (!uid) throw new Error("Missing uid");
  if (!industry) throw new Error("Missing industry");

  // Backend guardrail: guest không được query data nội bộ
  if (memberStatus !== "member") {
    log("BLOCKED: Non-member tried to access partner search");
    return {
      allowed: false,
      found: false,
      message: "Tính năng tra cứu đối tác nội bộ chỉ dành cho thành viên JCI.",
      results: [],
    };
  }

  const keyword = escapeFormulaValue(industry);

  const formula = `
    OR(
      SEARCH(LOWER("${keyword}"), LOWER({NGÀNH NGHỀ})) > 0,
      SEARCH(LOWER("${keyword}"), LOWER({CÔNG TY})) > 0,
      SEARCH(LOWER("${keyword}"), LOWER({CHỨC VỤ})) > 0,
      SEARCH(LOWER("${keyword}"), LOWER({CHỨC DANH})) > 0
    )
  `;

  const data = await airtableGet(
    TABLE_CUSTOMERS,
    `?filterByFormula=${encodeURIComponent(formula)}&maxRecords=${limit}`
  );
  log("Partner results:", data.records?.length);

  if (!data.records?.length) {
    return {
      allowed: true,
      found: false,
      query: industry,
      message: `Chưa tìm thấy đối tác phù hợp với ngành "${industry}".`,
      results: [],
    };
  }

  return {
    allowed: true,
    found: true,
    query: industry,
    count: data.records.length,
    results: data.records.map((r) => ({
      name: r.fields.Name || "",
      title: r.fields["CHỨC DANH"] || "",
      chapter: r.fields.Chapter || "",
      company: r.fields["CÔNG TY"] || "",
      position: r.fields["CHỨC VỤ"] || "",
      industry: r.fields["NGÀNH NGHỀ"] || "",
      business_description: `${r.fields["CÔNG TY"] || ""} - ${r.fields["NGÀNH NGHỀ"] || ""}`,
      phone_masked: maskPhone(r.fields.phone),
      contact_note: "Vui lòng liên hệ BTC để được hỗ trợ kết nối chính thức.",
    })),
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

function log(...args) {
  console.log("[MCP]", ...args);
}

// ====== POST /mcp ======
async function handler(req, res) {
  const requestId = Math.random().toString(36).slice(2, 8);
  // log("Incoming request:", JSON.stringify(req.body, null, 2));
  try {
    const { id, method, params } = req.body || {};

    if (!method) {
      log(`[${requestId}] ERROR: Missing method`);
      const out = err(id ?? null, -32600, "Invalid Request");
      return res.status(out.status).json(out.body);
    }
    log(`[${requestId}] Method:`, method);

    // 1. MCP initialize
    if (method === "initialize") {
      log(`[${requestId}] initialize called`);
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
      log(`[${requestId}] tools/list called`);
      log(`[${requestId}] Tools:`, TOOLS.map(t => t.name));
      const out = ok(id, {
        tools: TOOLS
      });

      return res.status(out.status).json(out.body);
    }

    // 3. MCP tools/call
    if (method === "tools/call") {
      const toolName = params?.name;
      const args = params?.arguments || {};

      log(`[${requestId}] Tool call:`, toolName);
      log(`[${requestId}] Args:`, JSON.stringify(args));

      if (!toolName) {
        log(`[${requestId}] ERROR: Missing tool name`);
        const out = err(id, -32602, "Missing tool name");
        return res.status(out.status).json(out.body);
      }

      // ===== USER CREATE =====
      if (toolName === "user.create") {
        log(`[${requestId}] → createUser()`);
        if (!args.uid) {
          const out = err(id, -32602, "Missing uid");
          return res.status(out.status).json(out.body);
        }

        const result = await createUser(args);
        log(`[${requestId}] createUser result:`, result);

        const out = ok(id, {
          content: [
            {
              type: "text",
              text: JSON.stringify(result)
            }
          ]
        });

        log(`[${requestId}] Response sent`);
        return res.status(out.status).json(out.body);
      }

      // ===== MEMBER LOOKUP BY PHONE =====
      if (toolName === "member.lookup_by_phone") {
        log(`[${requestId}] → lookupByPhone()`);
        if (!args.phone) {
          const out = err(id, -32602, "Missing phone");
          return res.status(out.status).json(out.body);
        }

        const result = await lookupByPhone(args);
        log(`[${requestId}] lookupByPhone result count:`, result?.count);

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
        log(`[${requestId}] → lookupByName()`);
        if (!args.name) {
          const out = err(id, -32602, "Missing name");
          return res.status(out.status).json(out.body);
        }

        const result = await lookupByName(args);
        log(`[${requestId}] lookupByName result count:`, result?.count);

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
        log(`[${requestId}] → searchPartner()`);
        if (!args.uid) {
          const out = err(id, -32602, "Missing uid");
          return res.status(out.status).json(out.body);
        }

        if (args.member_status !== "member") {
          log(`[${requestId}] BLOCKED: non-member access`);
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
        log(`[${requestId}] partner results:`, result?.count);

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
