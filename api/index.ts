import "../src/config/env";
import app from "../src/app";
import { connectDB } from "../src/config/db";

// Establish a single shared MongoDB connection per serverless runtime.
// Vercel may reuse the same runtime across many requests, so we connect once here.
connectDB().catch((error) => {
  console.error("Failed to connect to MongoDB", error);
});

// Export the Express app as the default handler for the Vercel Node serverless function.
export default app;

