// src/controllers/zalo.controller.js
import axios from "axios";
import { handleIGMessage, handleIGPostback } from "../services/instagramService.js";
// import { handleAIReply } from "../services/aiResponder.js";
// import { replyZalo } from "../services/zaloService.js";
// import { refreshOAToken, getOAToken, fetchConfigFromAirtable } from "../config/index.js"; // Nếu bạn có gói logic refresh token vào config hoặc service riêng

// import { saveMessage, getRecentMessages } from "../services/airtableService.js";
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

export async function handleMessagerWebhook(req, res) {
  const body = req.body;

  if (body.object === 'page') {
      body.entry.forEach(entry => {
          const webhook_event = entry.messaging[0];
          console.log("New Event:", webhook_event, process.env.PAGE_ACCESS_TOKEN);

          const sender_psid = webhook_event.sender.id;
          if (webhook_event.message) {
            handleMessage(sender_psid, webhook_event.message);
          } else if (webhook_event.postback) {
            handlePostback(sender_psid, webhook_event.postback);
          }
      });
      res.status(200).send('EVENT_RECEIVED');
  } else {
      res.sendStatus(404);
  }
}

export async function handleIGWebhook(req, res) {
  const body = req.body;

  if (body.object === 'instagram') {
    for (const entry of body.entry) {
      const changes = entry.messaging || [];

      for (const event of changes) {
        const sender_psid = event.sender.id;

        if (event.message) {
          await handleIGMessage(sender_psid, event.message);
        } else if (event.postback) {
          await handleIGPostback(sender_psid, event.postback);
        }
      }
    }

    res.status(200).send("IG_EVENT_RECEIVED");
  } else {
    res.sendStatus(404);
  }
}


function handlePostback(sender_psid, postback) {
  const payload = postback.payload;
  console.log("🧠 Postback từ người dùng:", payload);

  let response;

  if (payload === 'GET_STARTED') {
    response = { text: "Chào mừng bạn đến với LUXX! 💅 Hãy nhắn 'menu' để xem dịch vụ." };
  } else if (payload === 'VIEW_SERVICES') {
    response = { text: "Dưới đây là các dịch vụ của LUXX Spa...\n🦶 Pedicure, ✋ Manicure, 💅 Nail Art, v.v..." };
  } else {
    response = { text: `Bạn vừa bấm nút có payload: "${payload}"` };
  }

  callSendAPI(sender_psid, response);
}

function handleMessage(sender_psid, received_message) {
  console.log("Message from", sender_psid, ":", received_message.text);
  // Ở đây bạn có thể gọi API gửi tin nhắn phản hồi
  let response;

  if (received_message.text) {
    // Xử lý text bình thường
    response = {
      "text": `Bạn vừa nói: "${received_message.text}". LUXX cảm ơn bạn đã nhắn tin! 🌸`
    };
  } else {
    // Trường hợp không phải tin nhắn text (ảnh, audio,...)
    response = {
      "text": "LUXX hiện tại chỉ tiếp nhận tin nhắn dạng văn bản. Hẹn gặp bạn sau nhé! 💅"
    };
  }

  // Gửi phản hồi
  callSendAPI(sender_psid, response);
}

async function callSendAPI(sender_psid, response) {
  const request_body = {
    recipient: {
      id: sender_psid
    },
    messaging_type: "RESPONSE",
    message: response
  };

  try {
    const res = await axios.post(
      `https://graph.facebook.com/v22.0/me/messages?access_token=${process.env.PAGE_ACCESS_TOKEN}`,
      request_body
    );
    console.log("✅ Tin nhắn đã gửi thành công!", res.data);
  } catch (err) {
    console.error(`❌ Gửi tin nhắn cho ${sender_psid} thất bại:`, err.response ? err.response.data : err.message);
  }
}