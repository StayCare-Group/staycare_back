import nodemailer from "nodemailer";

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT || "587", 10),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

function isMailConfigured(): boolean {
  return !!(process.env.SMTP_USER && process.env.SMTP_PASS);
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
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #FF56B0;">Welcome to StayCare!</h2>
        <p>You've been invited to join StayCare as a <strong>${roleLabel}</strong>.</p>
        <p>Click the button below to create your account. This link expires in <strong>24 hours</strong>.</p>
        <a href="${inviteUrl}"
           style="display: inline-block; margin: 24px 0; padding: 12px 32px;
                  background: #FF56B0; color: #fff; text-decoration: none;
                  border-radius: 8px; font-weight: bold;">
          Create Your Account
        </a>
        <p style="color: #888; font-size: 13px;">
          If the button doesn't work, copy and paste this link into your browser:<br/>
          <a href="${inviteUrl}" style="color: #FF56B0;">${inviteUrl}</a>
        </p>
      </div>
    `,
  });
}

const STATUS_LABELS: Record<string, string> = {
  Pending: "Pending Pickup",
  Assigned: "Driver Assigned",
  Transit: "In Transit to Facility",
  Arrived: "Received at Facility",
  Washing: "Washing",
  Drying: "Drying",
  Ironing: "Ironing",
  QualityCheck: "Quality Check",
  ReadyToDeliver: "Ready for Delivery",
  Collected: "Out for Delivery",
  Delivered: "Delivered",
  Invoiced: "Invoiced",
  Completed: "Completed",
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
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
          <h2 style="color: #FF56B0;">Order Update</h2>
          <p>${greeting}</p>
          <p>Your order <strong>${orderNumber}</strong> has been updated to:</p>
          <div style="margin: 20px 0; padding: 16px; background: #FFF0F7; border-radius: 8px; text-align: center;">
            <span style="font-size: 18px; font-weight: bold; color: #FF56B0;">${label}</span>
          </div>
          <p style="color: #888; font-size: 13px;">
            Log in to StayCare to see full order details.
          </p>
        </div>
      `,
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
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
          <h2 style="color: #FF56B0;">Payment Reminder</h2>
          <p>${greeting}</p>
          <p>Invoice <strong>${invoiceNumber}</strong> for <strong>&euro;${amount.toFixed(2)}</strong> is due on <strong>${dueDate}</strong>.</p>
          <p>Please ensure payment is made before the due date to avoid late fees.</p>
          <p style="color: #888; font-size: 13px;">Log in to StayCare to view invoice details and make a payment.</p>
        </div>
      `,
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
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #FF56B0;">Reset Your Password</h2>
        <p>We received a request to reset your password. Click the button below to choose a new one.</p>
        <p>This link expires in <strong>1 hour</strong>.</p>
        <a href="${resetUrl}"
           style="display: inline-block; margin: 24px 0; padding: 12px 32px;
                  background: #FF56B0; color: #fff; text-decoration: none;
                  border-radius: 8px; font-weight: bold;">
          Reset Password
        </a>
        <p style="color: #888; font-size: 13px;">
          If you didn't request this, you can safely ignore this email.<br/>
          <a href="${resetUrl}" style="color: #FF56B0;">${resetUrl}</a>
        </p>
      </div>
    `,
  });
}
