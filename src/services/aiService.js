// src/services/aiService.js
import { config } from "../config/index.js";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: config.openaiApiKey
});

// export async function askAI(message, prompt, history, platform = "zalo") {
//   // Xử lý lịch sử cuộc đối thoại: lọc những message hợp lệ
//   const cleanHistory = Array.isArray(history)
//     ? history.filter(msg => msg?.role && typeof msg.content === "string")
//     : [];

//   const res = await openai.chat.completions.create({
//     model: "gpt-4o-mini", // hoặc model khác như "gpt-4" tùy nhu cầu
//     messages: [
//       { role: "system", content: prompt },
//       ...cleanHistory,
//       { role: "user", content: [
//           {
//             type: "text",
//             text: message,
//           }
//         ]
//       }
//     ],
//   });
//   // Giả sử trả về nội dung trả lời của AI:
//   return res.choices[0].message.content.trim();
// }


/**
 * Gửi prompt và message đến OpenAI để lấy phản hồi
 * @param {string} message - Tin nhắn mới từ người dùng
 * @param {string} prompt - System prompt
 * @param {Array} history - Danh sách hội thoại trước đó
 * @param {string} [platform] - 'zalo' | 'messenger' (tùy chọn)
 * @returns {Promise<string>}
 */
export async function askAI(message, prompt, history, platform = "zalo") {
  // Làm sạch lịch sử hội thoại
  const cleanHistory = Array.isArray(history)
    ? history.filter(msg => msg?.role && typeof msg.content === "string")
    : [];

  // Nếu cần thêm metadata nền tảng vào hệ thống
  const platformInfo = platform === "facebook"
    ? "Bạn đang trò chuyện qua Facebook Messenger."
    : "Bạn đang trò chuyện qua Zalo OA.";

  const messages = [
    { role: "system", content: `${prompt}\n\n[Thông tin nền tảng]: ${platformInfo}` },
    ...cleanHistory,
    { role: "user", content: message }
  ];

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages
  });

  return res.choices[0].message.content.trim();
}