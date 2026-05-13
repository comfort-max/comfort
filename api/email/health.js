export default async function handler(req, res) {
  return res.status(200).json({
    status: "ok",
    userConfigured: Boolean(process.env.EMAIL_USER),
  });
}
