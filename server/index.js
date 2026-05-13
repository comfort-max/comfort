require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Supabase client (server-side, uses service role key)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // NOT the anon key — use service role
);

// Load config from Supabase at runtime
async function getEmailConfig() {
  const { data, error } = await supabase.from('app_config').select('key, value');
  if (error) throw new Error('Failed to load email config: ' + error.message);
  const config = {};
  data.forEach(row => { config[row.key] = row.value; });
  return config;
}

// Build transporter dynamically based on config
async function createTransporter(config) {
  if (config.email_provider === 'sendgrid') {
    return nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      auth: {
        user: 'apikey',
        pass: config.sendgrid_api_key,
      },
    });
  }
  // Default: Gmail / SMTP
  return nodemailer.createTransport({
    host: config.smtp_host || 'smtp.gmail.com',
    port: parseInt(config.smtp_port || '587'),
    secure: false,
    auth: {
      user: config.smtp_user || process.env.EMAIL_USER,
      pass: config.smtp_pass || process.env.EMAIL_PASS,
    },
  });
}

app.post('/send', async (req, res) => {
  const { to, subject, body, fromName, attachments } = req.body;
  if (!to || !subject || !body) {
    return res.status(400).json({ error: 'Missing required fields: to, subject, body' });
  }
  try {
    const config = await getEmailConfig();
    const transporter = await createTransporter(config);
    const displayName = fromName || config.email_from_name || 'COMFORT';
    const fromAddress = config.email_from_address || config.smtp_user || process.env.EMAIL_USER;

    const info = await transporter.sendMail({
      from: `"${displayName}" <${fromAddress}>`,
      to,
      subject,
      text: body,
      html: body.split('\n').map(line => `<p>${line}</p>`).join(''),
      attachments: attachments || [],
    });
    res.json({ success: true, messageId: info.messageId });
  } catch (error) {
    console.error('Email error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to update config from the UI (Settings page calls this)
app.post('/config', async (req, res) => {
  const updates = req.body; // { email_provider: "sendgrid", sendgrid_api_key: "SG.xxx" }
  try {
    const rows = Object.entries(updates).map(([key, value]) => ({ key, value, updated_at: new Date().toISOString() }));
    const { error } = await supabase.from('app_config').upsert(rows, { onConflict: 'key' });
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get current config (for Settings page to display)
app.get('/config', async (req, res) => {
  try {
    const config = await getEmailConfig();
    // Mask sensitive values before sending to frontend
    if (config.smtp_pass) config.smtp_pass = '••••••••';
    if (config.sendgrid_api_key) config.sendgrid_api_key = 'SG.••••••••';
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', (_, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Email server running on port ${PORT}`));