// src/services/aiResponder.js

import { askAI } from "./aiService.js";
import { replyZalo, replyMessenger } from "./zaloService.js";

/**
 * Gửi phản hồi về user theo nền tảng
 * @param {string} platform - 'zalo' | 'messenger'
 * @param {string} userId - ID của người dùng
 * @param {string} message - Nội dung cần gửi
 * @param {string} token - Token tương ứng với platform
 * @returns {Promise<Object>} - Dữ liệu phản hồi từ API gốc
 */
export async function sendReplyToUser(platform, userId, message, token) {
  if (platform === "zalo") {
    return await replyZalo(userId, message, token);
  } else if (platform === "facebook") {
    return await replyMessenger(userId, message, token);
  } else {
    throw new Error(`❌ Nền tảng chưa hỗ trợ: ${platform}`);
  }
}

/**
 * Xử lý phản hồi từ AI và gửi lại cho người dùng
 * @param {string} userId - ID người dùng
 * @param {string} userMessage - Tin nhắn người dùng gửi
 * @param {string} prompt - System prompt cho AI
 * @param {Array} history - Lịch sử chat
 * @param {string} token - Token dùng để gửi tin nhắn
 * @param {string} platform - 'zalo' | 'messenger'
 * @returns {Promise<string>} - Phản hồi của AI
 */
export async function handleAIReply(userId, userMessage, prompt, history, token, platform = "zalo") {
  try {
    const aiReply = await askAI(userMessage, prompt, history, platform); // Gọi AI

    try {
      const res = await sendReplyToUser(platform, userId, aiReply, token);
      console.log("✅ AI Assistant phản hồi:", aiReply);
      return aiReply;
    } catch (sendErr) {
      console.error("❌ Lỗi khi gửi phản hồi:", sendErr.message);
    }

    return aiReply;
  } catch (err) {
    console.error("❌ Lỗi phản hồi AI:", err.message);

    const fallbackMsg = err.message.includes("429") || err.message.includes("quota")
      ? "⚠️ Hệ thống AI đang quá tải. Nhân viên sẽ hỗ trợ bạn trong ít phút."
      : "⚠️ Xin lỗi, hiện tại hệ thống đang gặp sự cố. Vui lòng thử lại sau.";

    // Gửi fallback cho user
    try {
      await sendReplyToUser(platform, userId, fallbackMsg, token);
    } catch (fallbackErr) {
      console.error("❌ Lỗi gửi fallback:", fallbackErr.message);
    }

    // Gửi cảnh báo cho admin Zalo
    try {
      const adminZaloId = "9187775818961242155";
      await replyZalo(adminZaloId, `⚠️ AI lỗi với user ${userId} (${platform}): ${userMessage}`, token);
    } catch (adminErr) {
      console.error("❌ Lỗi gửi cảnh báo admin:", adminErr.message);
    }
  }
}