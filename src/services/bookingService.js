export async function createBooking({ platform, userId, service, datetime_iso, phone, note }) {
  // 1) Validate tối thiểu
  if (!service) return { ok: false, need: ["service"], message: "Bạn muốn làm dịch vụ gì ạ?" };

  // Nếu thiếu ngày giờ hoặc phone thì yêu cầu hỏi lại (để model hỏi)
  const missing = [];
  if (!datetime_iso) missing.push("datetime_iso");
  if (!phone) missing.push("phone");

  if (missing.length) {
    return {
      ok: false,
      need: missing,
      message:
        missing.includes("datetime_iso")
          ? "Bạn muốn đặt lịch ngày giờ nào ạ? (VD: 3pm hôm nay / 10:30 sáng mai)"
          : "Bạn cho mình xin số điện thoại để xác nhận lịch nhé."
    };
  }

  // 2) Gọi POS/booking API của bạn (placeholder)
  // TODO: thay endpoint thật
  const payload = {
    userId,
    platform,
    service,
    datetime_iso,
    phone,
    note: note || ""
  };

  try {
    const r = await fetch(process.env.BOOKING_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.BOOKING_API_KEY
      },
      body: JSON.stringify(payload)
    });

    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      return { ok: false, error: "BOOKING_API_FAILED", detail: data };
    }

    return {
      ok: true,
      booking_id: data.booking_id || data.id,
      summary: `Đã đặt ${service} lúc ${datetime_iso}. SĐT: ${phone}`
    };
  } catch (e) {
    return { ok: false, error: "BOOKING_API_EXCEPTION", detail: String(e) };
  }
}


// src/services/bookingService.js
import { base } from "../config/index.js";

const LEAD_TABLE = "Leads";

// Field Airtable (đổi đúng tên cột của bạn)
const FIELD_BOOKING_TIME = "đặt lịch";
const FIELD_SERVICE = "Service";
const FIELD_PHONE = "phone";
const FIELD_NAME = "name"; 
const FIELD_EMAIL = "mail";   // optional
const FIELD_NOTE = "notes";  // optional


/**
 * Ghi booking trực tiếp vào Airtable
 * KHÔNG check userId
 */
export async function createBookingAirtable({ service, datetime_iso, phone, name, mail, note }) {
  // 1️⃣ Validate lần cuối (backend safeguard)
  if (!service) {
    return { ok: false, need: ["service"], message: "Bạn muốn làm dịch vụ gì ạ?" };
  }
  // if (!datetime_iso) {
  //   return { ok: false, need: ["datetime_iso"], message: "Bạn muốn đặt lúc mấy giờ ạ?" };
  // }
  if (!phone) {
    return { ok: false, need: ["phone"], message: "Bạn cho mình xin số điện thoại để giữ lịch nhé." };
  }
  // if (!name) {
  //   return { ok: false, need: ["name"], message: "Bạn cho mình xin tên nhé." };
  // }

  // 2️⃣ Tạo record booking mới (mỗi booking = 1 row)
  const record = await base(LEAD_TABLE).create({
    [FIELD_SERVICE]: service,
    [FIELD_BOOKING_TIME]: datetime_iso, // ISO string → Airtable Date OK
    [FIELD_PHONE]: phone,
    [FIELD_NAME]: name,
    [FIELD_EMAIL]: mail,
    [FIELD_NOTE]: note || "Booking từ AI"
  });

  return {
    ok: true,
    booking_id: record.id,
    summary: `✅ Đã ghi nhận lịch ${service} lúc ${datetime_iso}. SĐT: ${phone}` +
    (name ? `\n👤 ${name}` : "") +
    (mail ? `\n📧 ${mail}` : "")
  };
}