// src/routes/webhook.routes.js
import express from "express";
import crypto from "crypto";
import { verifyWebhook, handleZaloWebhook } from "../controllers/zalo.controller.js";
import { normalizePhone } from "../utils/hashUtil.js";

const router = express.Router();

// GET xác thực webhook (nếu cần)
router.get("/webhook", verifyWebhook);

// POST xử lý webhook từ Zalo
router.post("/webhook", handleZaloWebhook);

// Route thêm ví dụ: hash người dùng
router.post("/hash-users-daily", async (req, res) => {
  // Bạn có thể chuyển logic này vào controller riêng nếu cần
  const { phone } = req.body;
  const formattedPhone = normalizePhone(phone);
  if (!formattedPhone) {
    return res.status(400).json({ error: "Invalid phone number format" });
  }
  const hash = crypto.createHash("sha256").update(formattedPhone).digest("hex");
  res.json({ hashed_phone: hash, formatted_phone: formattedPhone });
});

export default router;
