// src/services/aiResponder.js
import { askAI } from "./aiService.js";       // Lấy hàm askAI từ aiService
import { replyZalo } from "./zaloService.js";   // Lấy hàm replyZalo từ zaloService
// import { saveMessage, getMessages } from './conversationService.js'; // đường dẫn tùy vị trí

// async function handleUserChat(userId, message) {
//   const history = await getMessages(userId);
//   const context = [...history, { role: 'user', content: message }];

//   const aiReply = await callOpenAI(context); // ví dụ hàm gửi context cho AI

//   await saveMessage(userId, { role: 'user', content: message });
//   await saveMessage(userId, { role: 'assistant', content: aiReply });

//   return aiReply;
// }

export async function handleAIReply(userId, userMessage, prompt, history, token) {
  try {
    const aiReply = await askAI(userMessage, prompt, history); // Gọi OpenAI
    try {
      await replyZalo(userId, aiReply, token); // Gửi phản hồi đến Zalo
      console.log("✅ AI Assistant phản hồi:", aiReply);
    } catch (sendErr) {
      console.error("❌ Lỗi khi gửi phản hồi cho user:", sendErr.message);
    }
    return aiReply; // Trả về để lưu lịch sử (Airtable, …)
  } catch (err) {
    console.error("❌ Lỗi phản hồi AI:", err.message);
    const fallbackMsg = err.message.includes("429") || err.message.includes("quota")
      ? "⚠️ Hiện tại hệ thống AI đang quá tải. Nhân viên thật sẽ hỗ trợ bạn ngay sau ít phút."
      : "⚠️ Xin lỗi, hiện tại hệ thống đang gặp lỗi. Vui lòng thử lại sau.";
    try {
      await replyZalo(userId, fallbackMsg, token);
    } catch (fallbackErr) {
      console.error("❌ Lỗi khi gửi fallback cho user:", fallbackErr.message);
    }
    try {
      await replyZalo("9187775818961242155", `⚠️ AI lỗi với user ${userId}: ${userMessage}`, token);
    } catch (adminErr) {
      console.error("❌ Lỗi khi gửi cảnh báo cho admin:", adminErr.message);
    }
  }
}
