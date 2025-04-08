// src/config/index.js
import dotenv from "dotenv";
import Airtable from "airtable";

dotenv.config();

// Cấu hình chung từ .env
const config = {
  openaiApiKey: process.env.OPENAI_API_KEY,
  airtableApiKey: process.env.AIRTABLE_API_KEY,
  baseId: process.env.AIRTABLE_BASE_ID || "apptmh0D4kfxxCTn1",
  systemPrompt: process.env.SYSTEM_PROMPT || "Bạn là trợ lý OA.",
  oaAccessToken: process.env.OA_ACCESS_TOKEN,
};

// Thiết lập Airtable base
const base = new Airtable({ apiKey: config.airtableApiKey }).base(config.baseId);

// Lưu trữ token hiện tại (có thể khởi tạo từ biến môi trường)
let cachedToken = config.oaAccessToken || "";

/**
 * Lấy các cấu hình từ bảng Airtable (bảng Meta)
 * Giả sử bảng Meta có các trường:
 *   - name: tên cấu hình (ví dụ "OA_ACCESS_TOKEN")
 *   - key: giá trị của cấu hình đó.
 */
export async function fetchConfigFromAirtable() {
  try {
    const tableName = "Meta";
    const records = await base(tableName).select().all();
    const airtableConfig = {};
    records.forEach((record) => {
      const name = record.fields.name;
      const value = record.fields.key;
      if (name && typeof value !== "undefined") {
        airtableConfig[name] = value;
      }
    });
    return airtableConfig;
  } catch (error) {
    console.error("Error fetching config from Airtable:", error);
    return {};
  }
}

/**
 * Làm mới OA_ACCESS_TOKEN từ Airtable.
 * Nếu token mới khác với cachedToken thì cập nhật và log lại thời gian refresh.
 */
export async function refreshOAToken() {
  const airtableConfig = await fetchConfigFromAirtable();
  const newToken = airtableConfig.OA_ACCESS_TOKEN;
  if (newToken && newToken !== cachedToken) {
    cachedToken = newToken;
    console.log(`[TOKEN] OA Token refreshed at ${new Date().toISOString()}`);
  } else {
    console.log("[TOKEN] OA Token unchanged");
  }
  return cachedToken;
}

/**
 * Trả về token OA hiện tại từ cache.
 */
export function getOAToken() {
  return cachedToken;
}

// Thêm default export cho toàn bộ config nếu cần
// export default config;
export { config, base };