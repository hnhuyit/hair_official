// src/server.js
import app from "./app.js";

// Nếu cần chạy các tác vụ background như cron, refresh token, … bạn có thể import module đó tại đây.
import cron from "node-cron";
import { refreshOAToken } from "../src/config/index.js";

// Ví dụ: refresh token hàng ngày vào 1:30 AM
cron.schedule("30 1 * * *", async () => {
  console.log("[CRON] 1:30AM - Refreshing OA token...");
  await refreshOAToken();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
