import nodemailer from "nodemailer";
import { config } from "../config/index";
import { OrderStatus } from "../types/orderStatus";

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
    });
  }
  return transporter;
}

function isMailConfigured(): boolean {
  const configured = !!(config.smtp.user && config.smtp.pass);
  if (!configured) {
    console.warn("[MAIL] Email sending is skipped: SMTP_USER or SMTP_PASS not set in environment.");
  }
  return configured;
}

export async function sendInvitationEmail(
  to: string,
  role: string,
  inviteUrl: string,
) {
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);

  await getTransporter().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: `You've been invited to StayCare as ${roleLabel}`,
    html: `
<div style="margin:0;padding:0;background:#f3f4f5;">
  <div style="max-width:520px;margin:0 auto;padding:40px 24px;font-family:Inter, Arial, sans-serif;color:#191c1d;">
    
    <!-- Card -->
    <div style="background:#ffffff;border-radius:24px;padding:40px 32px;">
      
      <!-- Header -->
      <h1 style="font-family:Manrope, Arial, sans-serif;font-size:28px;margin:0 0 16px 0;color:#00316e;">
        Welcome to StayCare
      </h1>

      <p style="font-size:14px;color:#434751;margin-bottom:24px;">
        You've been invited as <strong>${roleLabel}</strong> to join our platform.
      </p>

      <!-- CTA -->
      <div style="margin:32px 0;">
        <a href="${inviteUrl}" 
           style="display:inline-block;padding:14px 32px;
           background:linear-gradient(135deg,#00316e,#19488e);
           color:#ffffff;text-decoration:none;border-radius:999px;
           font-weight:600;font-size:14px;">
          Create Account
        </a>
      </div>

      <p style="font-size:13px;color:#434751;">
        This invitation expires in <strong>24 hours</strong>.
      </p>

      <!-- Divider via space -->
      <div style="height:32px;"></div>

      <!-- Fallback -->
      <p style="font-size:12px;color:#434751;">
        If the button doesn’t work, use this link:
      </p>
      <p style="font-size:12px;word-break:break-all;color:#335da4;">
        ${inviteUrl}
      </p>

    </div>
  </div>
</div>
`
  });
}

const STATUS_LABELS: Record<string, string> = {
  [OrderStatus.PENDING]: "Pending Pickup",
  [OrderStatus.ASSIGNED]: "Driver Assigned",
  [OrderStatus.TRANSIT]: "Transit",
  [OrderStatus.ARRIVED]: "Received at Facility",
  [OrderStatus.WASHING]: "Washing",
  [OrderStatus.DRYING]: "Drying",
  [OrderStatus.IRONING]: "Ironing",
  [OrderStatus.QUALITY_CHECK]: "Quality Check",
  [OrderStatus.READY_TO_DELIVERY]: "Ready to Delivery",
  [OrderStatus.COLLECTED]: "Out for Delivery",
  [OrderStatus.DELIVERED]: "Delivered",
  [OrderStatus.INVOICED]: "Invoiced",
  [OrderStatus.COMPLETED]: "Completed",
  [OrderStatus.CANCELLED]: "Cancelled",
  [OrderStatus.RESCHEDULED]: "Rescheduled",
};

export async function sendOrderStatusEmail(
  to: string,
  orderNumber: string,
  newStatus: string,
  clientName?: string,
): Promise<void> {
  if (!isMailConfigured()) return;

  const label = STATUS_LABELS[newStatus] ?? newStatus;
  const greeting = clientName ? `Hi ${clientName},` : "Hi,";

  try {
    await getTransporter().sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject: `Order ${orderNumber} — ${label}`,
      html: `
<div style="margin:0;padding:0;background:#f3f4f5;">
  <div style="max-width:520px;margin:0 auto;padding:40px 24px;font-family:Inter, Arial, sans-serif;color:#191c1d;">
    
    <div style="background:#ffffff;border-radius:24px;padding:40px 32px;">

      <!-- Title -->
      <h1 style="font-family:Manrope, Arial, sans-serif;font-size:26px;margin-bottom:8px;color:#00316e;">
        Order Update
      </h1>

      <p style="font-size:14px;color:#434751;margin-bottom:24px;">
        ${greeting}
      </p>

      <p style="font-size:14px;margin-bottom:24px;">
        Your order <strong>#${orderNumber}</strong> status has changed:
      </p>

      <!-- Status Block -->
      <div style="
        padding:20px;
        border-radius:20px;
        background:#f8f9fa;
        text-align:center;
      ">
        <span style="
          display:inline-block;
          padding:8px 20px;
          background:#cde5ff;
          border-radius:999px;
          font-size:13px;
          color:#00316e;
          font-weight:600;
        ">
          ${label}
        </span>
      </div>

      <!-- Spacer -->
      <div style="height:32px;"></div>

      <!-- Progress feel -->
      <div style="
        height:10px;
        border-radius:999px;
        background:linear-gradient(90deg,#146394,#adc7ff);
      "></div>

      <div style="height:24px;"></div>

      <p style="font-size:12px;color:#434751;">
        Track your order anytime in your dashboard.
      </p>

    </div>
  </div>
</div>
`
    });
  } catch (err) {
    console.error(`Failed to send order status email to ${to}:`, (err as Error).message);
  }
}

export async function sendInvoiceReminderEmail(
  to: string,
  invoiceNumber: string,
  amount: number,
  dueDate: string,
  clientName?: string,
): Promise<void> {
  if (!isMailConfigured()) return;

  const greeting = clientName ? `Hi ${clientName},` : "Hi,";

  try {
    await getTransporter().sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject: `Invoice ${invoiceNumber} — Payment Reminder`,
      html: `
<div style="margin:0;padding:0;background:#f3f4f5;">
  <div style="max-width:520px;margin:0 auto;padding:40px 24px;font-family:Inter, Arial, sans-serif;">
    
    <div style="background:#ffffff;border-radius:24px;padding:40px 32px;">

      <h1 style="font-family:Manrope, Arial, sans-serif;font-size:26px;color:#00316e;margin-bottom:16px;">
        Payment Reminder
      </h1>

      <p style="font-size:14px;color:#434751;">
        ${greeting}
      </p>

      <!-- Amount block -->
      <div style="
        margin:24px 0;
        padding:24px;
        border-radius:20px;
        background:#edeeef;
      ">
        <p style="margin:0;font-size:12px;color:#434751;">Invoice</p>
        <p style="margin:4px 0;font-size:18px;font-weight:600;">#${invoiceNumber}</p>

        <p style="margin:12px 0 0 0;font-size:24px;font-weight:700;color:#00316e;">
          €${amount.toFixed(2)}
        </p>

        <p style="font-size:12px;color:#434751;">
          Due on ${dueDate}
        </p>
      </div>

      <p style="font-size:13px;color:#434751;">
        Please complete your payment before the due date.
      </p>

    </div>
  </div>
</div>
`
    });
  } catch (err) {
    console.error(`Failed to send invoice reminder to ${to}:`, (err as Error).message);
  }
}

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
): Promise<void> {
  await getTransporter().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: "StayCare — Reset Your Password",
    html: `
<div style="margin:0;padding:0;background:#f3f4f5;">
  <div style="max-width:520px;margin:0 auto;padding:40px 24px;font-family:Inter, Arial, sans-serif;">
    
    <div style="background:#ffffff;border-radius:24px;padding:40px 32px;">

      <h1 style="font-family:Manrope, Arial, sans-serif;font-size:26px;color:#00316e;margin-bottom:16px;">
        Reset your password
      </h1>

      <p style="font-size:14px;color:#434751;">
        We received a request to reset your password.
      </p>

      <p style="font-size:13px;color:#434751;">
        This link expires in <strong>1 hour</strong>.
      </p>

      <!-- CTA -->
      <div style="margin:32px 0;">
        <a href="${resetUrl}" 
           style="display:inline-block;padding:14px 32px;
           background:linear-gradient(135deg,#00316e,#19488e);
           color:#ffffff;text-decoration:none;border-radius:999px;
           font-weight:600;font-size:14px;">
          Reset Password
        </a>
      </div>

      <p style="font-size:12px;color:#434751;">
        If you didn’t request this, you can safely ignore this email.
      </p>

      <p style="font-size:12px;color:#335da4;word-break:break-all;">
        ${resetUrl}
      </p>

    </div>
  </div>
</div>
`
  });
}
