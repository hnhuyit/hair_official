// src/app.js
import express from "express";
import morgan from "morgan";
import bodyParser from "body-parser";
import webhookRoutes from "./routes/webhook.routes.js";
import { logRequest } from "./middlewares/logger.js";
import { errorHandler } from "./middlewares/errorHandler.js";

const app = express();

// Parse JSON và lưu raw body nếu cần xác thực chữ ký
app.use(bodyParser.json({
  verify: (req, res, buf) => { req.rawBody = buf.toString("utf8"); }
}));

// Static files (nếu có)
app.use(express.static("public"));

// Ghi log bằng morgan & middleware custom
app.use(morgan("dev"));
app.use(logRequest);

// Đăng ký route – các endpoint liên quan đến webhook và hash
app.use("/", webhookRoutes);

// Các route khác (vd: homepage)
app.get("/", (req, res) => {
  res.send("This is homepage.");
});

// Centralized error handler
app.use(errorHandler);

export default app;
