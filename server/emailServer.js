import express from "express";
import cors from "cors";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import inviteHandler from "../api/admin/invite.js";
import deleteUserHandler from "../api/admin/delete-user.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const SECRET = process.env.SERVER_SECRET || "changeme";
app.use("/api/email", (req, res, next) => {
  const clientSecret = req.headers["x-server-secret"];
  if (clientSecret !== SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});

const createTransporter = () =>
  nodemailer.createTransport({
    host: process.env.EMAIL_HOST || "smtp.gmail.com",
    port: parseInt(process.env.EMAIL_PORT || "587", 10),
    secure: process.env.EMAIL_PORT === "465",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

const fromAddress = () => process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_USER;

app.post("/api/email/send", async (req, res) => {
  const { to, subject, body, fromName } = req.body;
  if (!to || !subject || !body) {
    return res.status(400).json({ error: "Missing required fields: to, subject, body" });
  }
  const transporter = createTransporter();
  const fromLabel = fromName || process.env.EMAIL_FROM_NAME || "COMFORT";
  const addr = fromAddress();
  try {
    const info = await transporter.sendMail({
      from: `"${fromLabel}" <${addr}>`,
      replyTo: process.env.EMAIL_REPLY_TO || addr,
      to,
      subject,
      text: body,
      html: `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.7;">${String(body).replace(/\n/g, "<br/>")}</div>`,
    });
    res.json({ success: true, messageId: info.messageId });
  } catch (error) {
    console.error("Email error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/email/send-with-attachment", async (req, res) => {
  const { to, subject, body, fromName, attachmentBase64, attachmentName, attachmentMimeType } = req.body;
  if (!to || !subject || !body) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  const transporter = createTransporter();
  const fromLabel = fromName || process.env.EMAIL_FROM_NAME || "COMFORT";
  const addr = fromAddress();
  const mailOptions = {
    from: `"${fromLabel}" <${addr}>`,
    replyTo: process.env.EMAIL_REPLY_TO || addr,
    to,
    subject,
    text: body,
    html: `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.7;">${String(body).replace(/\n/g, "<br/>")}</div>`,
  };
  if (attachmentBase64 && attachmentName) {
    mailOptions.attachments = [
      {
        filename: attachmentName,
        content: attachmentBase64,
        encoding: "base64",
        contentType: attachmentMimeType || "application/pdf",
      },
    ];
  }
  try {
    const info = await transporter.sendMail(mailOptions);
    res.json({ success: true, messageId: info.messageId });
  } catch (error) {
    console.error("Email with attachment error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/email/health", (req, res) => {
  res.json({ status: "ok", user: process.env.EMAIL_USER });
});

app.post("/api/admin/invite", (req, res) => inviteHandler(req, res));
app.post("/api/admin/delete-user", (req, res) => deleteUserHandler(req, res));

const PORT = process.env.SERVER_PORT || 3001;
app.listen(PORT, () => {
  console.log(`Email + invite API: http://localhost:${PORT}`);
});
