import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

// Route imports
import userRoutes from "./routes/user.routes";
import healthRoutes from "./routes/health.routes";
import authRoutes from "./routes/auth.routes";
import clientRoutes from "./routes/client.routes";
import propertyRoutes from "./routes/property.routes";
import orderRoutes from "./routes/order.routes";
import invoiceRoutes from "./routes/invoice.routes";
import itemRoutes from "./routes/item.routes";
import routeRoutes from "./routes/route.routes";
import machineRoutes from "./routes/machine.routes";
import invitationRoutes from "./routes/invitation.routes";
import reportRoutes from "./routes/report.routes";

import { errorHandler } from "./middleware/errorHandler";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./config/swagger";
import { config } from "./config";

const app = express();

const corsOrigin = config.app.clientUrl;

app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

// Swagger Documentation
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// API Routes
app.use("/api/users", userRoutes);
app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/properties", propertyRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/items", itemRoutes);
app.use("/api/routes", routeRoutes);
app.use("/api/machines", machineRoutes);
app.use("/api/invitations", invitationRoutes);
app.use("/api/reports", reportRoutes);

app.use(errorHandler);

export default app;
