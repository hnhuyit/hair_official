// src/controllers/zalo.controller.js
import { handleIGMessage, handleIGPostback } from "../services/instagramService.js";
import { handleAIReply, runAgent } from "../services/aiResponder.js";

import { callAgentWithTools } from "../services/aiService.js";
import { createBooking } from "../services/bookingService.js";

import { replyMessenger  } from "../services/zaloService.js";
import { replyToComment  } from "../services/facebookService.js";
import { fetchConfigFromAirtable, updateLastInteractionOnlyIfNewDay } from "../config/index.js"; // Nếu bạn có gói logic refresh token vào config hoặc service riêng
import { saveMessage, getRecentMessages } from "../services/airtableService.js";
// Các hàm lưu lịch sử, cập nhật Airtable, … có thể được chuyển vào một module riêng (ví dụ airtableService)

export async function verifyWebhookIG(req, res) {
  // // Đơn giản trả về echostr nếu có logic xác thực cho GET webhook
  // const { hub: { challenge } } = req.query;
  // return res.status(200).send(challenge || "IG Webhook verified");

  // Parse the query params
  let mode = req.query["hub.mode"];
  let token = req.query["hub.verify_token"];
  let challenge = req.query["hub.challenge"];

  // Check if a token and mode is in the query string of the request
  if (mode && token) {
    // Check the mode and token sent is correct
    if (mode === "subscribe" && token === "1234567890") {
      // Respond with the challenge token from the request
      console.log("WEBHOOK_VERIFIED");
      res.status(200).send(challenge);
    } else {
      // Respond with '403 Forbidden' if verify tokens do not match
      res.status(403).send("Forbidden – Token mismatch");
    }
  }

}

export async function verifyWebhookFB(req, res) {
  // // Đơn giản trả về echostr nếu có logic xác thực cho GET webhook
  // const { hub: { challenge } } = req.query;
  // return res.status(200).send(challenge || "FB Webhook verified");

  // Parse the query params
  let mode = req.query["hub.mode"];
  let token = req.query["hub.verify_token"];
  let challenge = req.query["hub.challenge"];

  // Check if a token and mode is in the query string of the request
  if (mode && token) {
    // Check the mode and token sent is correct
    if (mode === "subscribe" && token === "1234567890") {
      // Respond with the challenge token from the request
      console.log("WEBHOOK_VERIFIED");
      res.status(200).send(challenge);
    } else {
      // Respond with '403 Forbidden' if verify tokens do not match
      res.status(403).send("Forbidden – Token mismatch");
    }
  }
}

export async function verifyWebhookWA(req, res) {
  // // Đơn giản trả về echostr nếu có logic xác thực cho GET webhook
  // const { hub: { challenge } } = req.query;
  // return res.status(200).send(challenge || "FB Webhook verified");

  // Parse the query params
  let mode = req.query["hub.mode"];
  let token = req.query["hub.verify_token"];
  let challenge = req.query["hub.challenge"];

  // Check if a token and mode is in the query string of the request
  if (mode && token) {
    // Check the mode and token sent is correct
    if (mode === "subscribe" && token === "1234567890") {
      // Respond with the challenge token from the request
      console.log("WEBHOOK_VERIFIED");
      res.status(200).send(challenge);
    } else {
      // Respond with '403 Forbidden' if verify tokens do not match
      res.status(403).send("Forbidden – Token mismatch");
    }
  }
}

export async function verifyWebhookMessager(req, res) {
  
  // Parse the query params
  let mode = req.query["hub.mode"];
  let token = req.query["hub.verify_token"];
  let challenge = req.query["hub.challenge"];

  // Check if a token and mode is in the query string of the request
  if (mode && token) {
    // Check the mode and token sent is correct
    if (mode === "subscribe" && token === "1234567890") {
      // Respond with the challenge token from the request
      console.log("WEBHOOK_VERIFIED");
      res.status(200).send(challenge);
    } else {
      // Respond with '403 Forbidden' if verify tokens do not match
      res.status(403).send("Forbidden – Token mismatch");
    }
  }
}

export async function handleFacebookWebhook(req, res, next) {
  try {
    const body = req.body;

    if (body.object !== "page") {
      return res.sendStatus(404);
    }

    const token = process.env.PAGE_ACCESS_TOKEN; // Facebook Page Token (hoặc dùng process.env.PAGE_ACCESS_TOKEN)
    const config = await fetchConfigFromAirtable();
    
    // Kiểm tra trạng thái bot
    if (config.bot_status !== "active") {
      console.log("🚫 Bot đang tắt, không xử lý phản hồi.");
      return res.sendStatus(200);
    }

    const SYSTEM_PROMPT = config.SYSTEM_PROMPT;
    const platform = "facebook";

    for (const entry of body.entry) {
      const webhook_event = entry.messaging?.[0];
      const changes = entry.changes || [];


      
      // ✅ Xử lý tin nhắn Messenger như trước
      if (webhook_event) {
        const sender_psid = webhook_event?.sender?.id;
        // const recipient_id = webhook_event?.recipient?.id;
        const message = webhook_event?.message;

        // ❌ Bỏ qua nếu không có sender hoặc sender là chính page bot
        if (!sender_psid || sender_psid === "543096242213723") {
          console.log("⏭️ Bỏ qua event từ chính page bot hoặc thiếu sender.");
          continue;
        }

        // if (!sender_psid) continue;

        // ✅ Chỉ xử lý nếu là tin nhắn dạng text
        if (message?.text) {
          const userMessage = message.text;
          console.log(`📥 Messenger > User gửi: "${userMessage}"`);

          // Lưu tin nhắn người dùng
          await saveMessage({
            userId: sender_psid,
            role: "user",
            message: userMessage,
            platform
          });

          // ✅ Lưu lần tương tác gần nhất
          await updateLastInteractionOnlyIfNewDay(sender_psid, "message_received", platform);

          // Lấy lịch sử
          const history = await getRecentMessages(sender_psid, platform);

          // Gọi AI và gửi phản hồi
          const aiReply = await handleAIReply(
            sender_psid,
            userMessage,
            SYSTEM_PROMPT,
            history,
            token,
            platform
          );

          // Lưu phản hồi AI
          await saveMessage({
            userId: sender_psid,
            role: "assistant",
            message: aiReply,
            platform
          });
        } else {
          // 🛑 Bỏ qua các loại tin nhắn không phải text
          console.log("📎 Bỏ qua message không phải text:", message);
          // await replyMessenger(
          //   sender_psid,
          //   "❗ Hiện tại Hair Consulting chỉ hỗ trợ tin nhắn văn bản.",
          //   token
          // );
        }
      }

      // ✅ Xử lý comment từ bài viết (feed webhook)
      for (const change of changes) {
        const value = change.value;

        if (change.field === "feed" && value.item === "comment" && value.verb === "add") {
          const commentId = value.comment_id;
          const postId = value.post_id;
          const parentId = value.parent_id;

          const senderId = value.from?.id;
          // const senderName = value.from?.name;
          const message = value.message;

          
          // ❌ Nếu là comment trả lời (reply) → bỏ qua
          if (parentId !== postId) {
            console.log("⏭️ Bỏ qua comment reply (comment cấp 2):", commentId);
            continue;
          }

          if (!senderId) {
            console.warn("❌ Không xác định được senderId từ comment:", value);
            continue;
          }
          
          // 🚫 Nếu senderId là ID của chính page → bỏ qua
          const PAGE_ID = entry.id; // từ entry.id chính là ID page
          if (senderId === PAGE_ID) {
            console.log("⏭️ Bỏ qua comment do chính Page đăng.");
            continue;
          }

          // ✅ Còn lại là comment từ người dùng
          // console.log("💬 Comment người dùng:", message, PAGE_ID, senderId, value);

          console.log("💬 Comment mới:", {
            senderId,
            commentId,
            postId,
            message
          });

          await saveMessage({
            userId: senderId,
            role: "user",
            message,
            platform
          });

          await updateLastInteractionOnlyIfNewDay(senderId, "comment_received", platform);

          // Lấy lịch sử
          const history = await getRecentMessages(senderId, platform);

          // 👉 Nếu bạn muốn phản hồi comment bằng AI hoặc gửi comment lại:
          const aiCommentReply = await handleAIReply(senderId, message, SYSTEM_PROMPT, history, token, platform);

          // Lưu phản hồi AI
          await saveMessage({
            userId: senderId,
            role: "assistant",
            message: aiCommentReply,
            platform
          });

          await replyToComment(commentId, aiCommentReply, token); // cần viết thêm hàm này nếu cần
        }
      }

    }
    res.status(200).send("EVENT_RECEIVED");
  } catch (err) {
    console.error("🔥 Lỗi webhook Messenger:", err);
    next(err);
  }
}

export async function handleWithAIAgent(req, res) {
  try {
    const body = req.body;
    
    if (body.object !== 'page') {
      return res.sendStatus(404);
    }

    console.log("handleWithAIAgent", handleWithAIAgent)

    body.entry.forEach(entry => {
        const webhook_event = entry.messaging[0]; // console.log("New Event:", webhook_event, process.env.PAGE_ACCESS_TOKEN);
        const sender_psid = webhook_event.sender.id;

        if (webhook_event.message) {
          handleMessage(sender_psid, webhook_event.message);
        } else if (webhook_event.postback) {
          handlePostback(sender_psid, webhook_event.postback);
        }
    });

    for (const entry of body.entry) {
      const webhook_event = entry.messaging[0];
      const sender_psid = webhook_event.sender.id;

      if (webhook_event.message && webhook_event.message.text) {
        const userMessage = webhook_event.message.text;

        const mid = webhook_event.message?.mid || webhook_event.postback?.mid;
        if (mid && (await isDuplicated(mid))) continue;
        if (mid) await markProcessed(mid);

        // 1. Lấy cấu hình hệ thống (ví dụ như SYSTEM_PROMPT)
        const config = await fetchConfigFromAirtable();
        const SYSTEM_PROMPT = config.SYSTEM_PROMPT;

        // 2. Lưu lịch sử người dùng
        await saveMessage({ userId: sender_psid, role: "user", message: userMessage, platform: "facebook"});

        // 3. Lấy lịch sử gần đây
        const history = await getRecentMessages(sender_psid, "facebook");

        // 4. Gửi lên OpenAI
        // const aiReply = await handleAIReply(sender_psid, userMessage, SYSTEM_PROMPT, history, process.env.PAGE_ACCESS_TOKEN);

        // 핵심: agent + function calling
        const { replyText, toolTrace } = await runAgent({
          platform: "facebook",
          userId: psid,
          userMessage: text,
          systemPrompt: SYSTEM_PROMPT,
          history
        });

        // 5. Lưu phản hồi
        await saveMessage({ userId: sender_psid, role: "assistant", message: aiReply, platform: "facebook" });

        // 6. Gửi lại cho người dùng qua Messenger
        await replyMessenger(sender_psid, aiReply, process.env.PAGE_ACCESS_TOKEN);

        // (optional) log toolTrace để debug booking tool calls
        if (toolTrace?.length) console.log("toolTrace:", toolTrace);
      } else {
        await replyMessenger(sender_psid, `❗ Hiện tại, AI chỉ hỗ trợ tin nhắn dạng văn bản.`, process.env.PAGE_ACCESS_TOKEN);
      }
    }

    res.status(200).send('EVENT_RECEIVED');
  } catch (err) {
    console.error("🔥 Lỗi webhook Messenger:", err);
    next(err);
  }
}

export async function handleMessagerWebhook(req, res) {
  try {
    const body = req.body;
    
    if (body.object !== 'page') {
      return res.sendStatus(404);
    }

    // body.entry.forEach(entry => {
    //     const webhook_event = entry.messaging[0]; // console.log("New Event:", webhook_event, process.env.PAGE_ACCESS_TOKEN);
    //     const sender_psid = webhook_event.sender.id;

    //     if (webhook_event.message) {
    //       handleMessage(sender_psid, webhook_event.message);
    //     } else if (webhook_event.postback) {
    //       handlePostback(sender_psid, webhook_event.postback);
    //     }
    // });

    for (const entry of body.entry) {
      const webhook_event = entry.messaging[0];
      const sender_psid = webhook_event.sender.id;

      if (webhook_event.message && webhook_event.message.text) {
        const userMessage = webhook_event.message.text;

        // 1. Lấy cấu hình hệ thống (ví dụ như SYSTEM_PROMPT)
        const config = await fetchConfigFromAirtable();
        const SYSTEM_PROMPT = config.SYSTEM_PROMPT;

        // 2. Lưu lịch sử người dùng
        await saveMessage({ userId: sender_psid, role: "user", message: userMessage, platform: "facebook"});

        // 3. Lấy lịch sử gần đây
        const history = await getRecentMessages(sender_psid, "facebook");

        // 4. Gửi lên OpenAI
        const aiReply = await handleAIReply(sender_psid, userMessage, SYSTEM_PROMPT, history, process.env.PAGE_ACCESS_TOKEN);

        // 5. Lưu phản hồi
        await saveMessage({ userId: sender_psid, role: "assistant", message: aiReply, platform: "facebook" });

        // 6. Gửi lại cho người dùng qua Messenger
        await replyMessenger(sender_psid, aiReply, process.env.PAGE_ACCESS_TOKEN);
      } else {
        await replyMessenger(sender_psid, `❗ Hiện tại, AI chỉ hỗ trợ tin nhắn dạng văn bản.`, process.env.PAGE_ACCESS_TOKEN);
      }
    }

    res.status(200).send('EVENT_RECEIVED');
  } catch (err) {
    console.error("🔥 Lỗi webhook Messenger:", err);
    next(err);
  }
}

export async function handleIGWebhook(req, res) {
  const body = req.body;
  console.log("📥 [IG Webhook] Payload nhận được:", JSON.stringify(body, null, 2));

  if (body.object === 'instagram') {
    for (const entry of body.entry) {
      console.log("📌 Entry IG:", JSON.stringify(entry, null, 2));
      const changes = entry.messaging || [];

      for (const event of changes) {
        console.log("🔄 IG Event:", JSON.stringify(event, null, 2));
        const sender_psid = event.sender.id;
        console.log("👤 IG Sender PSID:", sender_psid);

        if (event.message) {
          console.log("📩 IG Message content:", event.message);
          await handleIGMessage(sender_psid, event.message);
        } else if (event.postback) {
          console.log("🔘 IG Postback content:", event.postback);
          await handleIGPostback(sender_psid, event.postback);
        } else {
          console.log("❓ Không phải message hoặc postback:", event);
        }
      }
    }

    res.status(200).send("IG_EVENT_RECEIVED");
  } else {
    console.warn("⚠️ Webhook không phải từ IG:", body.object);
    res.sendStatus(404);
  }
}

export async function handleWAWebhook(req, res) {
  try {
    const body = req.body;

    // Chỉ nhận từ WhatsApp Business
    if (body?.object !== "whatsapp_business_account") {
      return res.sendStatus(404);
    }

    // Trích message đầu tiên (đủ dùng cho case đơn giản)
    const change = body.entry?.[0]?.changes?.[0]?.value || {};
    const msg = change.messages?.[0];
    const contact = change.contacts?.[0];
    const phone_number_id = change.metadata?.phone_number_id;

    if (!msg) return res.sendStatus(200); // không có message thì bỏ qua

    // Rút gọn thông tin cần gửi sang Airtable
    const payload = {
      source: "whatsapp",
      wa_id: msg.from,                           // số người gửi (E.164, ví dụ 8490...)
      name: contact?.profile?.name || null,
      type: msg.type,                            // text | interactive | image | ...
      text: msg.type === "text" ? (msg.text?.body || "") : null,
      interactive_id: msg.interactive?.button_reply?.id || msg.interactive?.list_reply?.id || null,
      interactive_title: msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || null,
      media_id: msg.image?.id || msg.document?.id || null,
      timestamp: msg.timestamp ? new Date(Number(msg.timestamp) * 1000).toISOString() : new Date().toISOString(),
      phone_number_id,                           // id số WA Business của bạn
      raw: msg                                   // nếu muốn, Airtable có thể lưu vào Long text
    };

    // Forward sang Airtable Automation Webhook
    await fetch("https://hooks.airtable.com/workflows/v1/genericWebhook/app8QrLwvbj6L6Mw2/wfl8C3pwhXh2uCUv0/wtrc1gvrVlqlOwfBT", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    // Trả 200 sớm để Meta không retry
    return res.sendStatus(200);
  } catch (e) {
    console.error("WA → Airtable forward error:", e);
    return res.sendStatus(500);
  }
}


// function handlePostback(sender_psid, postback) {
//   const payload = postback.payload;
//   console.log("🧠 Postback từ người dùng:", payload);

//   let response;

//   if (payload === 'GET_STARTED') {
//     response = { text: "Chào mừng bạn đến với LUXX! 💅 Hãy nhắn 'menu' để xem dịch vụ." };
//   } else if (payload === 'VIEW_SERVICES') {
//     response = { text: "Dưới đây là các dịch vụ của LUXX Spa...\n🦶 Pedicure, ✋ Manicure, 💅 Nail Art, v.v..." };
//   } else {
//     response = { text: `Bạn vừa bấm nút có payload: "${payload}"` };
//   }

//   callSendAPI(sender_psid, response);
// }

// function handleMessage(sender_psid, received_message) {
//   console.log("Message from", sender_psid, ":", received_message.text);
//   // Ở đây bạn có thể gọi API gửi tin nhắn phản hồi
//   let response;

//   if (received_message.text) {
//     // Xử lý text bình thường
//     response = {
//       "text": `Bạn vừa nói: "${received_message.text}". LUXX cảm ơn bạn đã nhắn tin! 🌸`
//     };
//   } else {
//     // Trường hợp không phải tin nhắn text (ảnh, audio,...)
//     response = {
//       "text": "LUXX hiện tại chỉ tiếp nhận tin nhắn dạng văn bản. Hẹn gặp bạn sau nhé! 💅"
//     };
//   }

//   // Gửi phản hồi
//   callSendAPI(sender_psid, response);
// }

// async function callSendAPI(sender_psid, response) {
//   const request_body = {
//     recipient: {
//       id: sender_psid
//     },
//     messaging_type: "RESPONSE",
//     message: response
//   };

//   try {
//     const res = await axios.post(
//       `https://graph.facebook.com/v22.0/me/messages?access_token=${process.env.PAGE_ACCESS_TOKEN}`,
//       request_body
//     );
//     console.log("✅ Tin nhắn đã gửi thành công!", res.data);
//   } catch (err) {
//     console.error(`❌ Gửi tin nhắn cho ${sender_psid} thất bại:`, err.response ? err.response.data : err.message);
//   }
// }