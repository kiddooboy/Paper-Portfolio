import nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  return transporter;
}

export function isEmailConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function sendOtpEmail(to: string, otp: string): Promise<boolean> {
  const t = getTransporter();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@paperportfolio.in';

  if (!t) {
    // Fallback: log to console so dev/testing still works without SMTP setup
    console.log(`[email] (no SMTP configured) OTP for ${to}: ${otp}`);
    return true;
  }

  try {
    await t.sendMail({
      from: `"Paper Portfolio" <${from}>`,
      to,
      subject: 'Your Paper Portfolio login code',
      text: `Your one-time login code is ${otp}. It expires in 10 minutes.`,
      html: `
        <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #00b386; margin: 0 0 16px;">Paper Portfolio</h2>
          <p>Your one-time login code is:</p>
          <div style="font-size: 32px; font-weight: bold; letter-spacing: 6px; padding: 16px; background: #f5f5f5; border-radius: 8px; text-align: center; margin: 16px 0;">
            ${otp}
          </div>
          <p style="color: #666; font-size: 14px;">This code expires in 10 minutes. If you didn't request this, ignore this email.</p>
        </div>
      `,
    });
    return true;
  } catch (err: any) {
    console.warn('[email] sendOtpEmail failed:', err?.message || err);
    return false;
  }
}
