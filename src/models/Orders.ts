import mongoose, { Document, Schema } from "mongoose";

export interface IOrders extends Document {
  order_number: string;
  client: Schema.Types.ObjectId;
  property: Schema.Types.ObjectId;
  service_type: string;
  pickup_date: Date;
  pickup_window: {
    start_time: Date;
    end_time: Date;
  };
  estimated_bags: number;
  actual_bags: number;
  special_notes: string;
  deliver_id: Schema.Types.ObjectId;
  status: string;
  items: {
    item_code: string;
    name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
  }[];
  pricing_snapshot: {
    subtotal: number;
    vat_percentage: number;
    vat_amount: number;
    total: number;
  };
  status_history: {
    status: string;
    changed_by: Schema.Types.ObjectId | string;
    timestamp: Date;
    note?: string;
  }[];
  photos: {
    photo_url: string;
    type: string;
    uploaded_at: Date;
  }[];
  created_at: Date;
  updated_at: Date;
}

const ordersSchema = new Schema<IOrders>(
  {
    order_number: {
      type: String,
      required: true,
    },
    client: {
      type: Schema.Types.ObjectId,
      ref: "Clients",
      required: true,
    },
    property: {
      type: Schema.Types.ObjectId,
    },
    service_type: {
      type: String,
      enum: ["express", "standard"],
      required: true,
    },
    pickup_date: {
      type: Date,
      required: true,
    },
    pickup_window: {
        start_time: {
            type: Date,
            required: true,
        },
        end_time: {
            type: Date,
            required: true,
        },
    },
    estimated_bags: {
        type: Number,
    },
    actual_bags: {
        type: Number,
    },
    special_notes: {
        type: String,
    },
    deliver_id: {
        type: Schema.Types.ObjectId,
        ref: "User",
    },
    status: {
        type: String,
        enum: ["Pending", "Assigned", "Transit", "Arrived", "Washing", "Drying", "Ironing", "QualityCheck", "ReadyToDeliver", "Collected", "Delivered", "Invoiced", "Completed"],
        required: true,
        default: "Pending",
    },
    items: [
        {
            item_code: {
                type: String,
                required: true,
            },
            name: {
                type: String,
                required: true,
            },
            quantity: {
                type: Number,
            },
            unit_price: {
                type: Number,
                required: true,
            },
            total_price: {
                type: Number,
                required: true,
            },
        }
    ],
    pricing_snapshot: {
        subtotal: {
            type: Number,
            required: true,
        },
        vat_percentage: {
            type: Number,
            required: true,
        },
        vat_amount: {
            type: Number,
            required: true,
        },
        total: {
            type: Number,
            required: true,
        },
    },
    status_history: [
        {
            status: {
                type: String,
                required: true,
            },
            changed_by: {
                type: Schema.Types.Mixed,
                required: true,
            },
            timestamp: {
                type: Date,
                required: true,
            },
            note: {
                type: String,
            },
        }
    ],
    photos: [
        {
            photo_url: {
                type: String,
                required: true,
            },
            type: {
                type: String,
                enum: ["before", "after"],
                required: true,
            },
            uploaded_at: {
                type: Date,
                required: true,
            },
        }
    ],
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

export default mongoose.model<IOrders>("Orders", ordersSchema);