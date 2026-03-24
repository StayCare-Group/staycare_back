import mongoose, { Document, Schema } from "mongoose";
import crypto from "crypto";

export interface IPasswordReset extends Document {
  email: string;
  token: string;
  expires_at: Date;
  used: boolean;
}

const passwordResetSchema = new Schema<IPasswordReset>({
  email: { type: String, required: true },
  token: { type: String, required: true, unique: true },
  expires_at: { type: Date, required: true },
  used: { type: Boolean, default: false },
});

passwordResetSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

export function generateResetToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export default mongoose.model<IPasswordReset>("PasswordReset", passwordResetSchema);
