// src/middlewares/errorHandler.js
export function errorHandler(err, req, res, next) {
    console.error("❌ Error handler:", err.stack);
    res.status(500).json({
      status: "error",
      message: err.message || "Internal Server Error"
    });
  }
  