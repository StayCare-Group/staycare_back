import { Router } from "express";
import {
  getMachineStatus,
  createMachine,
  updateMachine,
  deleteMachine,
  assignMachine,
  releaseMachine,
  seedMachines,
} from "../controllers/facility.controller";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/authorize";

const router = Router();

router.use(authenticate);

router.get("/machines", authorize("admin", "staff"), getMachineStatus);
router.post("/machines", authorize("admin"), createMachine);
router.put("/machines/:id", authorize("admin"), updateMachine);
router.delete("/machines/:id", authorize("admin"), deleteMachine);
router.post("/machines/:id/assign", authorize("admin", "staff"), assignMachine);
router.post("/machines/:id/release", authorize("admin", "staff"), releaseMachine);
router.post("/machines/seed", authorize("admin", "staff"), seedMachines);

export default router;
