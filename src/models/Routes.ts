import mongoose, { Document, Schema } from "mongoose";

export interface IRoutes extends Document {
  route_date: Date;
  driver: Schema.Types.ObjectId;
  area: string;
  orders: Schema.Types.ObjectId[];
  status: string;
}

const routesSchema = new Schema<IRoutes>(
  {
    route_date: {
        type: Date,
        required: true,
    },
    driver: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    area: {
        type: String,
        required: true,
    },
    orders: [
        {
            type: Schema.Types.ObjectId,
            ref: "Orders",
        },
    ],
    status: {
        type: String,
        enum: ["planned", "in_progress", "completed"],
        required: true,
        default: "planned",
    }
  },
);

export default mongoose.model<IRoutes>("Routes", routesSchema);