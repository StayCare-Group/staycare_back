import { Router } from "express";
import {
  getAllTenants,
  createTenant,
  getTenantRoles,
  createCustomRole,
} from "../controllers/tenant.controller";
import { validate } from "../middleware/validate";
import {
  createTenantSchema,
  createCustomRoleSchema,
} from "../validation/tenant.validation";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/authorize";

const router = Router();

router.use(authenticate);

// Super-Admin: List & Create Tenants
router.get("/", authorize("admin"), getAllTenants);
router.post("/", authorize("admin"), validate(createTenantSchema), createTenant);

// Tenant Admin / Super-Admin: Manage custom roles
router.get("/:tenantId/roles", authorize("admin", "client"), getTenantRoles);
router.post(
  "/:tenantId/roles",
  authorize("admin", "client"),
  validate(createCustomRoleSchema),
  createCustomRole
);

export default router;
