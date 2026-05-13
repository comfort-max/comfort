import nodemailer from "nodemailer";

const createTransporter = () =>
  nodemailer.createTransport({
    host: process.env.EMAIL_HOST || "smtp.gmail.com",
    port: parseInt(process.env.EMAIL_PORT || "587", 10),
    secure: (process.env.EMAIL_PORT || "587") === "465",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { to, subject, body, fromName } = req.body || {};
  if (!to || !subject || !body) {
    return res.status(400).json({ error: "Missing required fields: to, subject, body" });
  }

  const transporter = createTransporter();
  const fromLabel = fromName || process.env.EMAIL_FROM_NAME || "COMFORT";
  const fromEmail = process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_USER;

  try {
    const info = await transporter.sendMail({
      from: `"${fromLabel}" <${fromEmail}>`,
      replyTo: process.env.EMAIL_REPLY_TO || fromEmail,
      to,
      subject,
      text: body,
      html: `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.7;">${body.replace(/\n/g, "<br/>")}</div>`,
    });

    return res.status(200).json({ success: true, messageId: info.messageId });
  } catch (error) {
    console.error("Email error:", error);
    return res.status(500).json({ error: error.message || "Failed to send email" });
  }
}
