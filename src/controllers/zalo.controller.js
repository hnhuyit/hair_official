// src/controllers/zalo.controller.js
import { handleAIReply } from "../services/aiResponder.js";
import { replyZalo } from "../services/zaloService.js";

import { refreshOAToken, getOAToken, fetchConfigFromAirtable, updateLastInteractionOnlyIfNewDay} from "../config/index.js"; // Nếu bạn có gói logic refresh token vào config hoặc service riêng
import { saveMessage, getRecentMessages } from "../services/airtableService.js";

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

const ZALO_GROUP_MAP = {
  // Thay bằng recipient.id thực tế của group OA 1
  "GROUP_ID_OA_1": {
    group_key: "group_oa_1",
    group_name: "Group OA 1"
  },

  // Thay bằng recipient.id thực tế của group OA 2
  "GROUP_ID_OA_2": {
    group_key: "group_oa_2",
    group_name: "Group OA 2"
  }
};

function getZaloChannel(payload) {
  const eventName = payload?.event_name || payload?.event;

  if (eventName === "user_send_group_text") {
    return "group";
  }

  if (eventName === "user_send_text") {
    return "direct";
  }

  return "unknown";
}

function getZaloText(payload) {
  return (
    payload?.message?.text ??
    payload?.message?.content?.text ??
    payload?.text ??
    null
  );
}


function getZaloSenderId(payload) {
  return (
    payload?.user_id_by_app ??
    payload?.sender?.id ??
    payload?.sender?.user_id ??
    null
  );
}

function getZaloGroupId(payload) {
  return payload?.recipient?.id ?? null;
}

// //bắt zalo oa và zalo oa group
// export async function handleMessZaloOA(req, res, next) {
//   // 1) Trả 200 sớm cho Zalo
//   res.status(200).send("OK");

//   try {
//     const payload = req.body;

//     // 2) Bỏ qua nếu OA tự gửi
//     if (isMessageFromOA(payload)) {
//       console.log("⛔ Ignore message from OA");
//       return;
//     }

//     const eventName = payload?.event_name ?? payload?.event ?? null;
//     const channel = getZaloChannel(payload);

//     const senderId = getZaloSenderId(payload);
//     const text = getZaloText(payload);
//     const groupId = getZaloGroupId(payload);

//     const groupConfig =
//       channel === "group"
//         ? ZALO_GROUP_MAP[groupId] || null
//         : null;

//     const msgId = payload?.message?.msg_id ?? null;

//     // 3) Chỉ xử lý text user/direct/group
//     const allowedEvents = [
//       "user_send_text",
//       "user_send_group_text"
//     ];

//     if (!allowedEvents.includes(eventName)) {
//       console.log("⚠️ Ignore unsupported Zalo event:", eventName);
//       return;
//     }

//     // 4) Nếu là group nhưng chưa map thì vẫn gửi Airtable để debug
//     if (channel === "group" && !groupConfig) {
//       console.log("⚠️ Group chưa được cấu hình:", groupId);
//     }

//     // 5) Chuẩn hoá payload gửi sang Airtable
//     const airtablePayload = {
//       source: "zalo_oa",
//       received_at: new Date().toISOString(),

//       app_id: payload?.app_id ?? null,
//       oa_id: payload?.oa_id ?? null,
//       event_name: eventName,

//       channel, // direct | group | unknown

//       // Direct user
//       user_id: senderId,

//       // Group
//       group_id: groupId,
//       group_key: groupConfig?.group_key ?? null,
//       group_name: groupConfig?.group_name ?? null,

//       // Message
//       msg_id: msgId,
//       text,

//       raw: payload
//     };

//     const url =
//       process.env.AIRTABLE_AUTOMATION_WEBHOOK_URL ||
//       "https://hooks.airtable.com/workflows/v1/genericWebhook/apptmh0D4kfxxCTn1/wfl3Cq8ckREYevPae/wtrtQUhGM3HS7Bsr8";

//     if (!url) {
//       console.error("Missing AIRTABLE_AUTOMATION_WEBHOOK_URL");
//       return;
//     }

//     const airtableRes = await fetch(url, {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/json"
//       },
//       body: JSON.stringify(airtablePayload)
//     });

//     const data = await airtableRes.json().catch(() => null);

//     if (!airtableRes.ok) {
//       console.error("Airtable webhook FAILED:", {
//         status: airtableRes.status,
//         data
//       });
//     } else {
//       console.log("✅ Airtable webhook OK:", {
//         channel,
//         group_key: airtablePayload.group_key,
//         text,
//         data
//       });
//     }

//   } catch (err) {
//     console.error("❌ handleMessZaloOA ERROR:", err.message);
//   }
// }

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
