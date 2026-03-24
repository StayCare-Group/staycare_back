import mongoose, { Document, Schema } from "mongoose";

export interface IUser extends Document {
  name: string;
  email: string;
  password_hash: string;
  phone: string;
  language: string;
  role: string;
  client: Schema.Types.ObjectId;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  refresh_token?: string;
}

const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      unique: true,
    },
    phone: {
      type: String,
      unique: true,
      sparse: true, // varios usuarios pueden omitir phone; sin sparse, null duplicado → E11000
    },
    language: {
      type: String,
      enum: ["en", "es"],
      default: "en",
      required: true,
    },
    password_hash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["admin", "client", "driver", "staff"],
      default: "client",
    },
    client: {
      type: Schema.Types.ObjectId,
      ref: "Clients",
    },
    is_active: {
      type: Boolean,
      default: true,
    },
    refresh_token: {
      type: String,
      select: false,
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
    updated_at: {
      type: Date,
      default: Date.now,
    },
  },
);

export default mongoose.model<IUser>("User", userSchema);