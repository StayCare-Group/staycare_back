import mongoose, { Document, Schema } from "mongoose";

export interface IClients extends Document {
  company_name: string;
  contact_person: string;
  email: string;
  phone: string;
  vat_number: string;
  billing_address: string;
  credits_terms_days: number;
  pricing_tier: string;
  created_at: Date;
  properties: {
    property_name: string;
    address: string;
    city: string;
    area: string;
    access_notes: string;
    lat?: number;
    lng?: number;
  }[];
}

const clientsSchema = new Schema<IClients>(
  {
    company_name: {
      type: String,
      required: true,
    },
    contact_person: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    phone: {
      type: String,
      required: true,
    },
    vat_number: {
      type: String,
      required: true,
    },
    billing_address: {
      type: String,
      required: true,
    },
    credits_terms_days: {
      type: Number,
      required: true,
      default: 30,
    },
    pricing_tier: {
      type: String,
      required: true,
      default: "standard",
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
    properties: [
        {            
            property_name: {
                type: String,
                required: true,
            },
            address: {
                type: String,
                required: true,
            },
            city: {
                type: String,
                default: "",
            },
            area: {
                type: String,
                default: "",
            },
            access_notes: {
                type: String,
                default: "",
            },
            lat: { type: Number },
            lng: { type: Number },
        }
    ]
  },
);

export default mongoose.model<IClients>("Clients", clientsSchema);