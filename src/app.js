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

// const NO_AUTH = String(process.env.MCP_NO_AUTH || "").toLowerCase() === "true";

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
    description: "Lookup member by phone number",
    inputSchema: {
      type: "object",
      properties: {
        phone: { type: "string" }
      },
      required: ["phone"],
      additionalProperties: false
    }
  }
];

// ===== TOOL IMPLEMENTATION =====
async function lookupByPhone({ phone }) {
  // TODO: thay bằng Airtable thật
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          found: true,
          members: [
            {
              full_name: "Nguyễn Văn A",
              phone_last4: phone.slice(-4),
              chapter: "JCI KH",
              status: "active"
            }
          ]
        })
      }
    ]
  };
}

// ===== POST /mcp  (JSON-RPC) =====
async function handler(req, res) {
  try {
    const { id, method, params } = req.body || {};

    // initialize
    if (method === "initialize") {
      const out = ok(id, {
        protocolVersion: "2025-06-18",
        serverInfo: { name: "jci-mcp", version: "1.0.0" },
        capabilities: { tools: {} }
      });
      return res.status(out.status).json(out.body);
    }

    // tools/list
    if (method === "tools/list") {
      const out = ok(id, { tools: TOOLS });
      return res.status(out.status).json(out.body);
    }

    // tools/call
    if (method === "tools/call") {
      const { name, arguments: args } = params || {};
      if (name === "member.lookup_by_phone") {
        const result = await lookupByPhone(args || {});
        const out = ok(id, result);
        return res.status(out.status).json(out.body);
      }
      const out = err(id, 32601, `Unknown tool: ${name}`);
      return res.status(out.status).json(out.body);
    }

    // unknown method
    const out = err(id, 32601, `Method not found: ${method}`);
    return res.status(out.status).json(out.body);

  } catch (e) {
    console.error("MCP error:", e);
    return res.status(200).json({
      jsonrpc: "2.0",
      id: req.body?.id ?? null,
      error: { code: 32000, message: String(e?.message || e) }
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
