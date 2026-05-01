import nodemailer from 'nodemailer';

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error('SMTP not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in .env');
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export async function sendOtpEmail(to: string, otp: string): Promise<void> {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const transporter = getTransporter();
  await transporter.sendMail({
    from: `"Paper Portfolio" <${from}>`,
    to,
    subject: 'Your password reset OTP',
    html: `
      <div style="font-family:sans-serif;max-width:400px;margin:auto">
        <h2 style="color:#00B386">Password Reset</h2>
        <p>Use the OTP below to reset your Paper Portfolio password. It expires in <strong>10 minutes</strong>.</p>
        <div style="font-size:2rem;font-weight:bold;letter-spacing:0.4em;padding:16px;background:#f3f4f6;border-radius:8px;text-align:center">
          ${otp}
        </div>
        <p style="color:#6b7280;font-size:12px;margin-top:16px">If you did not request this, ignore this email.</p>
      </div>
    `,
  });
}