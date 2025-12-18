// export async function createBooking({ platform, userId, service, datetime_iso, phone, note }) {
//   // 1) Validate tối thiểu
//   if (!service) return { ok: false, need: ["service"], message: "Bạn muốn làm dịch vụ gì ạ?" };

//   // Nếu thiếu ngày giờ hoặc phone thì yêu cầu hỏi lại (để model hỏi)
//   const missing = [];
//   if (!datetime_iso) missing.push("datetime_iso");
//   if (!phone) missing.push("phone");

//   if (missing.length) {
//     return {
//       ok: false,
//       need: missing,
//       message:
//         missing.includes("datetime_iso")
//           ? "Bạn muốn đặt lịch ngày giờ nào ạ? (VD: 3pm hôm nay / 10:30 sáng mai)"
//           : "Bạn cho mình xin số điện thoại để xác nhận lịch nhé."
//     };
//   }

//   // 2) Gọi POS/booking API của bạn (placeholder)
//   // TODO: thay endpoint thật
//   const payload = {
//     userId,
//     platform,
//     service,
//     datetime_iso,
//     phone,
//     note: note || ""
//   };

//   try {
//     const r = await fetch(process.env.BOOKING_API_URL, {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/json",
//         "x-api-key": process.env.BOOKING_API_KEY
//       },
//       body: JSON.stringify(payload)
//     });

//     const data = await r.json().catch(() => ({}));

//     if (!r.ok) {
//       return { ok: false, error: "BOOKING_API_FAILED", detail: data };
//     }

//     return {
//       ok: true,
//       booking_id: data.booking_id || data.id,
//       summary: `Đã đặt ${service} lúc ${datetime_iso}. SĐT: ${phone}`
//     };
//   } catch (e) {
//     return { ok: false, error: "BOOKING_API_EXCEPTION", detail: String(e) };
//   }
// }


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



function toMMDDYYYY_HHMM(date) {
  // date: JS Date
  const pad = (n) => String(n).padStart(2, "0");
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const yyyy = date.getFullYear();
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  return `${mm}/${dd}/${yyyy} ${hh}:${mi}`;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}


// TODO: thay bằng bảng mapping thật (Airtable/DB)
const SERVICE_MAP = {
  "tư vấn marketing": 6137,
  "nail": 6137
};

export async function createBookingPOS({
  // service,
  datetime_iso,
  datetime_text, // optional
  // phone,
  // name,
  // email,
  note
}) {
  // 1) validate tối thiểu
  const missing = [];
  // if (!service) missing.push("service");
  // if (!phone) missing.push("phone");
  if (!datetime_iso && !datetime_text) missing.push("datetime");

  if (missing.length) {
    return {
      ok: false,
      need: missing,
      message:
        // missing.includes("service") ? "Bạn muốn đặt dịch vụ nào ạ?"
        missing.includes("datetime") ? "Bạn muốn đặt lịch ngày giờ nào ạ?"
        : "Bạn cho mình xin số điện thoại để xác nhận lịch nhé."
    };
  }

  // 2) Map service -> serviceId (tạm)
  // const key = String(service).trim().toLowerCase();
  // const serviceId = SERVICE_MAP[key];
  // if (!serviceId) {
  //   return {
  //     ok: false,
  //     need: ["service"],
  //     message: "Mình chưa có mã dịch vụ tương ứng. Bạn cho mình biết dịch vụ cụ thể hơn giúp mình nhé."
  //   };
  // }

  // 3) Parse datetime
  // Khuyến nghị: model gửi datetime_iso (+07). Nếu chỉ có datetime_text thì tạm fail/hoặc bạn tự parse sau.
  if (!datetime_iso) {
    return { ok: false, need: ["datetime_iso"], message: "Bạn cho mình xin ngày giờ cụ thể (VD: 2025-12-15T18:30:00+07:00) nhé." };
  }

  const start = new Date(datetime_iso);
  if (isNaN(start.getTime())) {
    return { ok: false, need: ["datetime_iso"], message: "Thời gian chưa đúng định dạng. Bạn gửi lại giúp mình nhé." };
  }

  // 4) duration tạm = 30 phút (sau này lấy theo service duration)
  // const durationMin = Number(process.env.BOOKING_DEFAULT_DURATION_MIN || 30);
  const end = addMinutes(start, 60);

  // 5) Build payload POS (default customerId/group/staffId)
  const payload = {
    customerId: Number(process.env.POS_DEFAULT_CUSTOMER_ID || 137553),
    group: Number(process.env.POS_DEFAULT_GROUP_ID || 1656),
    items: [
      {
        startTime: toMMDDYYYY_HHMM(start),
        endTime: toMMDDYYYY_HHMM(end),
        requestStaff: true,
        serviceIds: [6137],
        staffId: Number(process.env.POS_DEFAULT_STAFF_ID || 1643)
      }
    ],
    note: note || `Booking từ AI. Name: ${name || ""} | Phone: ${phone} | Email: ${email || ""}`.trim(),
    referenceId: `ai_${Date.now()}_${Math.random().toString(16).slice(2)}`, // idempotency key của bạn
    sourceType: "ai_chat"
  };

  // 6) Call POS
  const url = "https://api.ontiloo.com/api/v1/open-api/appointments";

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.POS_API_KEY,
        "Authorization": `Bearer ${process.env.POS_BEARER_TOKEN}`
      },
      body: JSON.stringify(payload)
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return { ok: false, error: "POS_BOOKING_FAILED", detail: data };
    }

    return {
      ok: true,
      booking_id: data?.data || data?.id || data?.bookingId || payload.referenceId,
      summary:
        `✅ Đã ghi nhận lịch ${service} lúc ${toMMDDYYYY_HHMM(start)}.\n` +
        `SĐT: ${phone}` +
        (name ? `\nTên: ${name}` : "") +
        (email ? `\nEmail: ${email}` : "")
    };
  } catch (e) {
    return { ok: false, error: "POS_BOOKING_EXCEPTION", detail: String(e) };
  }
}