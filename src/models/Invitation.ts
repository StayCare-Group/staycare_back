import mongoose, { Document, Schema } from "mongoose";
import crypto from "crypto";

export interface IInvitation extends Document {
  token: string;
  email: string;
  role: "admin" | "driver" | "staff";
  created_by: Schema.Types.ObjectId;
  expires_at: Date;
  used: boolean;
  used_at?: Date;
}

const invitationSchema = new Schema<IInvitation>({
  token: {
    type: String,
    required: true,
    unique: true,
    default: () => crypto.randomBytes(32).toString("hex"),
  },
  email: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ["admin", "driver", "staff"],
    required: true,
  },
  created_by: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  expires_at: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
  },
  used: {
    type: Boolean,
    default: false,
  },
  used_at: {
    type: Date,
  },
});

invitationSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model<IInvitation>("Invitation", invitationSchema);
