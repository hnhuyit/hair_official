// src/services/zaloService.js
import axios from "axios";

export async function replyZalo(userId, message, token) {
  try {
    if (!token) {
      throw new Error("⚠️ OA_ACCESS_TOKEN chưa được thiết lập trong .env");
    }

    const res = await axios.post(
      "https://openapi.zalo.me/v3.0/oa/message/cs",
      {
        recipient: { user_id: userId },
        message: { text: message }
      },
      {
        headers: {
          "access_token": token,
          "Content-Type": "application/json"
        }
      }
    );
    console.log("📤 Đã gửi Zalo:", res.data);
    return res.data;
  } catch (err) {
    console.error("❌ Gửi Zalo thất bại:", err.response?.data || err.message);
    throw err;
  }
}
