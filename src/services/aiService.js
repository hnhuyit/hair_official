// src/services/aiService.js
// import OpenAI from "openai";
import config from "../config/index.js";

// const openai = new OpenAI({
//   apiKey: config.openaiApiKey
// });

import { Configuration, OpenAIApi } from "openai";

const configuration = new Configuration({
  apiKey: config.openaiApiKey,
});
const openai = new OpenAIApi(configuration);

export async function askAI(message, prompt, history) {
  // Xử lý lịch sử cuộc đối thoại: lọc những message hợp lệ
  const cleanHistory = Array.isArray(history)
    ? history.filter(msg => msg?.role && typeof msg.content === "string")
    : [];

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini", // hoặc model khác như "gpt-4" tùy nhu cầu
    messages: [
      { role: "system", content: prompt },
      ...cleanHistory,
      { role: "user", content: [
          {
            type: "text",
            text: message,
          }
        ]
      }
    ],
  });
  // Giả sử trả về nội dung trả lời của AI:
  return res.choices[0].message.content.trim();
}
