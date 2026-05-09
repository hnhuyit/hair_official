import crypto from "crypto";

export default function verifyZaloSignature(req, res, next) {
  try {
    const signature = req.headers["x-zevent-signature"];

    const APP_ID = process.env.ZALO_APP_ID;
    const SECRET_KEY = process.env.ZALO_SECRET_KEY;

    const raw = APP_ID +
      req.rawBody +
      req.body.timestamp +
      SECRET_KEY;

    const expected =
      "mac=" +
      crypto.createHash("sha256")
        .update(raw)
        .digest("hex");

    if (signature !== expected) {
      return res.status(401).json({
        error: "Invalid signature"
      });
    }

    next();

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: "Verify failed"
    });
  }
}