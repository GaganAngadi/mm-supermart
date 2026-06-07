import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";

export const notificationRouter = Router();

const thankYouSchema = z.object({
  mobile: z.string().optional(),
  customerName: z.string().optional(),
  invoiceNo: z.string().min(1),
  total: z.number().nonnegative(),
  savings: z.number().nonnegative().optional()
});

function normalizePhone(value = "") {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  return digits.length === 10 ? `91${digits}` : digits;
}

function buildThankYouMessage(input: z.infer<typeof thankYouSchema>) {
  const customer = input.customerName && input.customerName !== "Walk-in Customer" ? input.customerName : "Customer";
  return [
    `Thank you ${customer} for shopping with M&M SuperMart.`,
    `Invoice: ${input.invoiceNo}`,
    `Amount: INR ${Math.round(input.total)}`,
    input.savings ? `You saved INR ${Math.round(input.savings)} today.` : "",
    "Please visit again."
  ].filter(Boolean).join("\n");
}

async function sendWhatsAppText(phone: string, message: string) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return { status: "not_configured" as const };

  const response = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: phone,
      type: "text",
      text: { preview_url: false, body: message }
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { status: "failed" as const, data };
  return { status: "sent" as const, data };
}

async function sendFast2Sms(phone: string, message: string) {
  const apiKey = process.env.FAST2SMS_API_KEY;
  if (!apiKey) return { status: "not_configured" as const, provider: "fast2sms" };

  const response = await fetch("https://www.fast2sms.com/dev/bulkV2", {
    method: "POST",
    headers: {
      authorization: apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      route: process.env.FAST2SMS_ROUTE ?? "q",
      message,
      language: "english",
      flash: 0,
      numbers: phone.replace(/^91(?=\d{10}$)/, "")
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.return === false) return { status: "failed" as const, provider: "fast2sms", data };
  return { status: "sent" as const, provider: "fast2sms", data };
}

async function sendTwilioSms(phone: string, message: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !from) return { status: "not_configured" as const, provider: "twilio" };

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      From: from,
      To: phone.startsWith("+") ? phone : `+${phone}`,
      Body: message
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { status: "failed" as const, provider: "twilio", data };
  return { status: "sent" as const, provider: "twilio", data };
}

async function sendSms(phone: string, message: string) {
  const provider = (process.env.SMS_PROVIDER ?? "fast2sms").toLowerCase();
  if (provider === "twilio") return sendTwilioSms(phone, message);
  return sendFast2Sms(phone, message);
}

notificationRouter.post("/customer-thank-you", requireAuth, async (req, res, next) => {
  try {
    const input = thankYouSchema.parse(req.body);
    const phone = normalizePhone(input.mobile);
    if (!phone) return res.json({ status: "skipped", reason: "missing_mobile" });

    const message = buildThankYouMessage(input);
    const result = await sendSms(phone, message);
    if (result.status === "not_configured" && process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) {
      const whatsappResult = await sendWhatsAppText(phone, message);
      return res.json({ ...whatsappResult, phone, channel: "whatsapp" });
    }
    return res.json({ ...result, phone });
  } catch (error) {
    return next(error);
  }
});
