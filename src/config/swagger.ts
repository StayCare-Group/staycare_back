import swaggerJsdoc from "swagger-jsdoc";
import path from "path";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "StayCare API",
      version: "1.0.0",
      description:
        "API REST StayCare (MySQL). La sesión usa **cookies httpOnly**: `accessToken` (JWT corto) y `refreshToken`. " +
        "En Swagger UI activa **Authorize → cookieAuth** y pega el valor del token si probaste login en el mismo origen; " +
        "o usa el front / Postman con `credentials: 'include'`. El header `Authorization: Bearer` no es el mecanismo principal.",
    },
    contact: {
      name: "API Support",
    },
    servers: [
      {
        url: "http://localhost:5001",
        description: "Docker / Desarrollo (PORT 5001)",
      },
    ],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "accessToken",
          description: "JWT de acceso devuelto en cookie tras `POST /api/auth/login` o `register`.",
        },
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Opcional; el servidor valida sobre todo la cookie `accessToken`.",
        },
      },
      schemas: {
        ClientProfileInput: {
          type: "object",
          required: ["contact_person", "billing_address"],
          properties: {
            contact_person: { type: "string" },
            billing_address: { type: "string" },
            credits_terms_days: { type: "integer", minimum: 1 },
            pricing_tier: {
              type: "string",
              enum: ["standard", "premium", "enterprise"],
            },
          },
        },
        PropertyInput: {
          type: "object",
          required: ["property_name", "address", "city", "area"],
          properties: {
            property_name: { type: "string" },
            address: { type: "string" },
            city: { type: "string" },
            area: { type: "string" },
            access_notes: { type: "string" },
            lat: { type: "number" },
            lng: { type: "number" },
          },
        },
        RegisterRequest: {
          type: "object",
          required: ["name", "email", "password", "phone", "language"],
          properties: {
            name: { type: "string", description: "Nombre del usuario / empresa" },
            email: { type: "string", format: "email" },
            password: { type: "string", minLength: 6 },
            phone: { type: "string" },
            language: { type: "string", enum: ["en", "es"] },
            role: {
              type: "string",
              enum: ["admin", "staff", "client", "driver"],
              default: "client",
              description:
                "Si es `admin`, `staff` o `driver`, la petición debe ir autenticada como **admin** (cookie accessToken).",
            },
            client_profile: {
              allOf: [{ $ref: "#/components/schemas/ClientProfileInput" }],
              description: "Obligatorio si `role` es `client` (omitted o default).",
            },
            properties: {
              type: "array",
              items: { $ref: "#/components/schemas/PropertyInput" },
              description: "Solo con `role` client (opcional)",
            },
          },
        },
        UpdateClientRequest: {
          type: "object",
          properties: {
            company_name: { type: "string" },
            contact_person: { type: "string" },
            email: { type: "string" },
            phone: { type: "string", nullable: true },
            billing_address: { type: "string" },
            credits_terms_days: { type: "integer" },
            pricing_tier: {
              type: "string",
              enum: ["standard", "premium", "enterprise"],
            },
          },
        },
        UpdateUserByAdminRequest: {
          type: "object",
          properties: {
            name: { type: "string" },
            email: { type: "string" },
            phone: { type: "string" },
            language: { type: "string", enum: ["en", "es"] },
            password: { type: "string", minLength: 6 },
            is_active: { type: "boolean" },
          },
        },
      },
    },
    security: [],
  },
  apis: [
    path.join(__dirname, "../routes/*.{ts,js}"),
    path.join(__dirname, "../controllers/*.{ts,js}"),
    path.join(__dirname, "../validation/*.{ts,js}"),
  ],
};

export const swaggerSpec = swaggerJsdoc(options);

