import { Router } from "express";
import {
  getMachineStatus,
  createMachine,
  updateMachine,
  deleteMachine,
  assignMachine,
  releaseMachine,
  seedMachines,
} from "../controllers/machine.controller";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/authorize";

/**
 * @swagger
 * tags:
 *   name: Machines
 *   description: Endpoints para gestión de lavadoras, secadoras y estaciones de planchado
 */

const router = Router();

router.use(authenticate);

router.get("/", authorize("admin", "staff", "operator"), getMachineStatus);
router.post("/", authorize("admin"), createMachine);
router.put("/:id", authorize("admin", "staff"), updateMachine);
router.delete("/:id", authorize("admin", "staff"), deleteMachine);
router.post("/:id/assign", authorize("admin", "staff", "operator"), assignMachine);
router.post("/:id/release", authorize("admin", "staff", "operator"), releaseMachine);
router.post("/seed", authorize("admin", "staff"), seedMachines);

export default router;
