// src/controllers/zalo.controller.js
import { handleAIReply } from "../services/aiResponder.js";
import { replyZalo, processZaloMessage } from "../services/zaloService.js";

import { refreshOAToken, getOAToken, fetchConfigFromAirtable, updateLastInteractionOnlyIfNewDay} from "../config/index.js"; // Nếu bạn có gói logic refresh token vào config hoặc service riêng
import { saveMessage, getRecentMessages } from "../services/airtableService.js";
// Các hàm lưu lịch sử, cập nhật Airtable, … có thể được chuyển vào một module riêng (ví dụ airtableService)

export async function verifyWebhook(req, res) {
  // Đơn giản trả về echostr nếu có logic xác thực cho GET webhook
  const { hub: { challenge } } = req.query;
  return res.status(200).send(challenge || "Webhook verified");
}

function isMessageFromOA(payload) {
  const senderId = payload?.sender?.id;
  const oaId = process.env.ZALO_OA_ID || "894893212671527808" //"1721517817153925163";

  return senderId === oaId;
}

const APP_ID = process.env.ZALO_APP_ID;
const OA_SECRET_KEY = process.env.ZALO_OA_SECRET_KEY;
// const OA_ACCESS_TOKEN = process.env.ZALO_OA_ACCESS_TOKEN;

async function getZaloUserProfile(userId) {
  const url = `https://openapi.zalo.me/v2.0/oa/getprofile?user_id=${userId}`;

  const res = await fetch(url, {
    headers: {
      access_token: getOAToken(),
    },
  });

  const data = await res.json();

  if (data.error !== 0) {
    console.error("Zalo get profile error:", data);
    return null;
  }

  return data.data; 
}


function verifyZaloSignature(req) {
  const signature = req.headers["x-zevent-signature"];
  const timestamp = req.body.timestamp;

  const data = req.rawBody;

  const raw = APP_ID + data + timestamp + OA_SECRET_KEY;

  const expectedSignature =
    "mac=" + crypto.createHash("sha256").update(raw).digest("hex");

  return signature === expectedSignature;
}


export async function handleMessZaloOA(req, res, next) {
  // 1) OPTIONAL: verify signature
  // Nếu bạn chưa chắc header signature/timestamp có đúng theo docs payload bạn đang nhận,
  // có thể tạm bypass verify để chạy thông luồng trước.
  // const signatureOk = verifyZaloSignature(req);
  // if (!signatureOk) {
  //   // Nếu bạn muốn “mềm” hơn: log và vẫn OK để không bị Zalo retry spam.
  //   return res.status(401).send("Invalid signature");
  // }

  // 2) Trả 200 sớm cho Zalo (tránh retry)
  res.status(200).send("OK");

  // 3) Chuẩn hoá payload gửi sang Airtable
  const payload = req.body;
  
  // ❌ bỏ qua nếu OA tự gửi
  if (isMessageFromOA(payload)) {
    console.log("⛔ Ignore message from OA");
    return;
  }

  // const userId = payload.sender.id;

  // Lấy profile
  // const profile = await getZaloUserProfile(userId);
  // Bạn nên gửi sang Airtable một object gọn + raw để debug
  const airtablePayload = {
    source: "zalo_oa",
    received_at: new Date().toISOString(),
    // name: profile?.display_name ?? null,
    // avatar: profile?.avatar ?? null,
    // gender: profile?.gender ?? null,

    // tuỳ payload thực tế của bạn mà map
    app_id: payload?.app_id ?? null,
    event_name: payload?.event_name ?? payload?.event ?? null,
    sender_id: payload?.sender?.id ?? payload?.sender?.user_id ?? null,
    text:
      payload?.message?.text ??
      payload?.message?.content?.text ??
      payload?.text ??
      null,

    raw: payload, // giữ raw luôn cho chắc
  };

  // 4) Gọi webhook Airtable Automation (link trong ảnh)
  const url = process.env.AIRTABLE_AUTOMATION_WEBHOOK_URL || "https://hooks.airtable.com/workflows/v1/genericWebhook/apptmh0D4kfxxCTn1/wfl3Cq8ckREYevPae/wtrtQUhGM3HS7Bsr8";
  if (!url) {
    console.error("Missing AIRTABLE_AUTOMATION_WEBHOOK_URL");
    return;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(airtablePayload),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      console.error("Airtable webhook FAILED:", {
        status: res.status,
        data,
      });
    } else {
      console.log("Airtable webhook OK:", data);
    }
  } catch (err) {
    console.error("Airtable webhook ERROR:", err.message);
  }
}

export async function handleZaloWebhook(req, res, next) {
  try {
    const { event_name, sender, message } = req.body;
    const userId = sender.id;
    const userMessage = message.text;
    // Giả sử bạn có hàm fetchConfigFromAirtable để lấy SYSTEM_PROMPT và các cấu hình khác
    const config = await fetchConfigFromAirtable();

    // Kiểm tra trạng thái bot
    if (config.bot_status !== "active") {
      console.log("🚫 Bot đang tắt, không xử lý phản hồi.");
      return res.sendStatus(200);
    }

    const SYSTEM_PROMPT = config.SYSTEM_PROMPT;
    const token = getOAToken(); // Token đã được refresh theo cron
    const platform = "zalo";

    // Lưu lịch sử tin nhắn, cập nhật interaction nếu cần (bạn có thể tách riêng sang airtableService)
    await saveMessage({ userId, role: "user", message: userMessage, platform });
    await updateLastInteractionOnlyIfNewDay(userId, event_name, platform);
    
    const history = await getRecentMessages(userId, platform);
    if (event_name === "user_send_text") {
      console.log(`Bạn vừa gửi: "${userMessage}"`);
      const aiReply = await handleAIReply(userId, userMessage, SYSTEM_PROMPT, history, token, platform);
      await saveMessage({ userId, role: "assistant", message: aiReply, platform });
    } else {
      // Xử lý các loại nội dung khác:
      const unsupportedTypes = [
        "user_send_image",
        "user_send_video",
        "user_send_audio",
        "user_send_file",
        "user_send_sticker",
        "user_send_location",
        "user_send_business_card"
      ];
      if (unsupportedTypes.includes(event_name)) {
        await replyZalo(userId, `❗ Trợ lý AI hiện tại chưa hỗ trợ xử lý loại nội dung này.\n\n📌 Vui lòng gửi tin nhắn văn bản để được phản hồi chính xác nhé.`, token);
      } else {
        await replyZalo(userId, `Chào bạn, rất vui được kết nối! Mình có thể hỗ trợ gì cho kế hoạch áp dụng AI và Automation cho bạn không?`, token);
        console.log("❓ Loại event chưa xử lý:", event_name);
      }
    }

    console.log("✅ Webhook nhận được:", event_name, req.body);
    res.sendStatus(200);
  } catch (err) {
    console.error("🔥 Lỗi webhook:", err);
    next(err);
  }
}
export async function handleZaloOAGroupWebhook(req, res) {
  res.status(200).json({ success: true });

  try {
    const body = req.body;

    const eventName = body.event_name;
    const groupId = body.recipient?.id;
    const userId = body.user_id_by_app;
    const senderId = body.sender?.id;
    const oaId = body.oa_id;
    const message = body.message || {};
    const text = message.text || "";
    const msgId = message.msg_id;
    const timestamp = body.timestamp;

    console.log("📩 Zalo Group Webhook:", {
      eventName,
      groupId,
      userId,
      senderId,
      oaId,
      text,
      msgId,
      timestamp
    });

    // switch (eventName) {
    //   case "user_send_group_text": {
    //     await processZaloGroupTextMessage({
    //       platform: "zalo_oa_group",
    //       eventName,
    //       groupId,
    //       userId,
    //       senderId,
    //       oaId,
    //       text,
    //       msgId,
    //       timestamp,
    //       raw: body
    //     });

    //     break;
    //   }

    //   default: {
    //     console.log("Unknown Zalo group event:", eventName);
    //     break;
    //   }
    // }

  } catch (error) {
    console.error("❌ Zalo Group Webhook Error:", error);
  }
}