import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import userRoutes from "./routes/user.routes";
import healthRoutes from "./routes/health.routes";
import authRoutes from "./routes/auth.routes";
import clientRoutes from "./routes/client.routes";
import orderRoutes from "./routes/order.routes";
import invoiceRoutes from "./routes/invoice.routes";
import itemRoutes from "./routes/item.routes";
import routeRoutes from "./routes/route.routes";
import facilityRoutes from "./routes/facility.routes";
import invitationRoutes from "./routes/invitation.routes";
import reportRoutes from "./routes/report.routes";
import { errorHandler } from "./middleware/errorHandler";

const app = express();

// Debe coincidir con la URL exacta del front (puerto incluido). Con cookies, no uses origin: '*'.
const corsOrigin = process.env.CLIENT_URL || "http://localhost:3000";

app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

app.use("/api/users", userRoutes);
app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/items", itemRoutes);
app.use("/api/routes", routeRoutes);
app.use("/api/facility", facilityRoutes);
app.use("/api/invitations", invitationRoutes);
app.use("/api/reports", reportRoutes);

app.use(errorHandler);

export default app;
