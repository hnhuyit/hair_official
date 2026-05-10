// src/routes/webhook.routes.js
import express from "express";
import crypto from "crypto";
import { verifyWebhook, handleZaloWebhook, handleMessZaloOA, handleZaloOAGroupWebhook } from "../controllers/zalo.controller.js";
import { verifyWebhookIG, verifyWebhookFB, verifyWebhookWA, handleIGWebhook, handleFacebookWebhook, handleWAWebhook, handleWithAIAgent } from "../controllers/meta.controller.js";
import { verifyWebhookAnnaFB } from "../controllers/clients.controller.js";
import { imageToVideo } from '../controllers/stability.controller.js';
import { normalizePhone } from "../utils/hashUtil.js";
import verifyZaloSignature
  from "../middlewares/verifyZaloSignature.js";

const router = express.Router();

// GET xác thực webhook (nếu cần)
router.get("/webhook", verifyWebhook);
router.post("/webhook", handleMessZaloOA);
// POST xử lý webhook từ Zalo old
// router.post("/webhook", handleZaloWebhook);

router.get("/ig-webhook", verifyWebhookIG);
router.post("/ig-webhook", handleIGWebhook);

// router.get("/messaging-webhook", verifyWebhookMessager); //webhook cũ 
// router.post("/messaging-webhook", handleMessagerWebhook);
// router.get("/fb-webhook", verifyWebhookFB);
// router.post("/fb-webhook", handleFacebookWebhook);

router.get("/wa-webhook", verifyWebhookWA);
router.post("/wa-webhook", handleWAWebhook);


// POST xử lý webhook từ Zalo OA Group
// router.get("/webhook-group-zalooa", verifyWebhook);
// router.post("/webhook-group-zalooa",  verifyZaloSignature,  handleZaloOAGroupWebhook);

// router.post("/fb-webhook", handleWithAIAgent);


router.get("/webhook-anna-fb", verifyWebhookAnnaFB);
// router.get("/webhook-anna", verifyWebhookAnna);


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

router.post('/image-to-video', imageToVideo);

export default router;
