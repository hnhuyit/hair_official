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

//v1
// export async function callAgentWithTools({ model, input, tools, toolHandlers }) {
//   const toolTrace = [];

//   let resp = await openai.responses.create({
//     model,
//     instructions: 'You are a helpful assistant.',
//     input,
//     tools
//   });

//   // loop tool calls
//   while (resp.output?.some(o => o.type === "tool_call")) {
//     const toolCalls = resp.output.filter(o => o.type === "tool_call");

//     const toolResults = [];
//     for (const call of toolCalls) {
//       const name = call.name;
//       const args = call.arguments ? JSON.parse(call.arguments) : {};
//       const handler = toolHandlers[name];

//       const result = handler
//         ? await handler(args)
//         : { ok: false, error: `No handler for tool: ${name}` };

//       toolTrace.push({ name, args, result });

//       toolResults.push({
//         type: "tool_result",
//         tool_call_id: call.id,
//         output: JSON.stringify(result)
//       });
//     }

//     resp = await openai.responses.create({
//       model,
//       input: [
//         ...input,
//         ...toolResults.map(t => ({ role: "tool", content: t.output, tool_call_id: t.tool_call_id }))
//       ],
//       tools
//     });
//   }

//   return { finalText: resp.output_text || "Mình chưa hiểu ý bạn, bạn nói rõ hơn giúp mình nhé.", toolTrace };
// }

//fixed
export async function callAgentWithTools({ model, input, tools, toolHandlers }) {
  const toolTrace = [];

  // console.log("TOOLS SENT:", JSON.stringify(tools, null, 2));

  let resp = await openai.responses.create({
    model,
    input,
    tools
  });

  while (resp.output?.some(o => o.type === "tool_call")) {
    const toolCalls = resp.output.filter(o => o.type === "tool_call");

    const toolResults = [];
    for (const call of toolCalls) {
      const name = call.name;
      const rawArgs = call.arguments ?? "{}";
      const args = typeof rawArgs === "string" ? safeJsonParse(rawArgs) : rawArgs;

      const handler = toolHandlers[name];
      const result = handler
        ? await handler(args)
        : { ok: false, error: `No handler for tool: ${name}` };

      toolTrace.push({ name, args, result });

      toolResults.push({
        type: "tool_result",
        tool_call_id: call.id,
        output: JSON.stringify(result)
      });
    }

    resp = await openai.responses.create({
      model,
      input: [...input, ...toolResults], // ✅ feed đúng item type tool_result
      tools
    });
  }

  return { finalText: resp.output_text || "Mình chưa hiểu ý bạn, bạn nói rõ hơn giúp mình nhé.", toolTrace };
}

function safeJsonParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}