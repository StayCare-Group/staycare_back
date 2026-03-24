import mongoose, { Document, Schema } from "mongoose";

export interface IMachine extends Document {
  name: string;
  type: string;
  capacity: string;
  status: string;
  current_order: Schema.Types.ObjectId | null;
  started_at: Date | null;
}

const machineSchema = new Schema<IMachine>({
  name: {
    type: String,
    required: true,
    unique: true,
  },
  type: {
    type: String,
    enum: ["washer", "dryer", "iron"],
    required: true,
  },
  capacity: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ["available", "running", "maintenance"],
    default: "available",
  },
  current_order: {
    type: Schema.Types.ObjectId,
    ref: "Orders",
    default: null,
  },
  started_at: {
    type: Date,
    default: null,
  },
});

export default mongoose.model<IMachine>("Machine", machineSchema);
