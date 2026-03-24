import mongoose, { Document, Schema } from "mongoose";

export interface IInvoices extends Document {
  invoice_number: string;
  client: Schema.Types.ObjectId;
  orders: Schema.Types.ObjectId[];
  issue_date: Date;
  due_date: Date;
  line_items: {
    description: string;
    quantity: number;
    unit_price: number;
    total_price: number;
  }[];
  subtotal: number;
  vat_percentage: number;
  vat_amount: number;
  total: number;
  status: string;
  payments: {
    amount: number;
    method: string;
    transaction_reference: string;
    paid_at: Date;
  }[];
  created_at: Date;
}

const invoicesSchema = new Schema<IInvoices>(
  {    
    invoice_number: {
        type: String,
        required: true,
    },
    client: {
        type: Schema.Types.ObjectId,
        ref: "Clients",
        required: true,
    },
    orders: [
        {
            type: Schema.Types.ObjectId,
            ref: "Orders",
        },
    ],
    issue_date: {
        type: Date,
        required: true,
    },
    due_date: {
        type: Date,
        required: true,
    },
    line_items: [
        {
            description: {
                type: String,
                required: true,
            },
            quantity: {
                type: Number,
                required: true,
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
    status: {
        type: String,
        enum: ["pending", "paid", "overdue"],
        required: true,
        default: "pending",
    },
    payments: [
        {
            amount: {
                type: Number,
                required: true,
            },
            method: {
                type: String,
                enum: ["cash", "bank_transfer", "card"],
                required: true,
            },
            transaction_reference: {
                type: String,
                required: true,
            },
            paid_at: {
                type: Date,
                required: true,
            },
        }
    ],
    created_at: {
        type: Date,
        default: Date.now,
    },
  },
);

export default mongoose.model<IInvoices>("Invoices", invoicesSchema);