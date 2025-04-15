// src/services/instagramService.js
import axios from "axios";

export async function handleIGMessage(sender_psid, message) {
  let response;

  if (message.text) {
    response = { text: `💬 Bạn vừa nhắn: "${message.text}". LUXX IG xin chào bạn! 🌟` };
  } else {
    response = { text: "LUXX hiện chỉ phản hồi tin nhắn dạng văn bản trên IG." };
  }

  await sendIGReply(sender_psid, response);
}

export async function handleIGPostback(sender_psid, postback) {
  let response;

  switch (postback.payload) {
    case "GET_STARTED":
      response = { text: "🎉 Chào mừng bạn đến với LUXX IG! Gõ 'menu' để xem dịch vụ." };
      break;
    default:
      response = { text: `📌 Bạn vừa chọn: ${postback.payload}` };
  }

  await sendIGReply(sender_psid, response);
}

async function sendIGReply(sender_psid, response) {
  const body = {
    recipient: { id: sender_psid },
    messaging_type: "RESPONSE",
    message: response
  };

  try {
    const res = await axios.post(
      `https://graph.facebook.com/v18.0/me/messages?access_token=${process.env.PAGE_ACCESS_TOKEN}`,
      body
    );
    console.log("✅ IG reply sent:", res.data);
  } catch (error) {
    console.error("❌ IG reply failed:", error.response?.data || error.message);
  }
}
