export async function bookAppointment({ platform, userId, service, datetime_iso, phone, note }) {
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
