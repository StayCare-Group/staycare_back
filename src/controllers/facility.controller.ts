import { Request, Response } from "express";
import Machine from "../models/Machine";
import { sendSuccess, sendError } from "../utils/response";

export const getMachineStatus = async (_req: Request, res: Response) => {
  try {
    const machines = await Machine.find()
      .populate("current_order", "order_number status")
      .sort({ type: 1, name: 1 });
    return sendSuccess(res, 200, "Facility machine status", machines);
  } catch (error) {
    return sendError(res, 500, "Failed to fetch machine status");
  }
};

export const createMachine = async (req: Request, res: Response) => {
  try {
    const machine = await Machine.create(req.body);
    return sendSuccess(res, 201, "Machine created", machine);
  } catch (error: any) {
    if (error?.code === 11000) {
      return sendError(res, 409, "A machine with that name already exists");
    }
    return sendError(res, 400, "Machine creation failed");
  }
};

export const updateMachine = async (req: Request, res: Response) => {
  try {
    const machine = await Machine.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!machine) return sendError(res, 404, "Machine not found");
    return sendSuccess(res, 200, "Machine updated", machine);
  } catch (error) {
    return sendError(res, 400, "Machine update failed");
  }
};

export const deleteMachine = async (req: Request, res: Response) => {
  try {
    const machine = await Machine.findById(req.params.id);
    if (!machine) return sendError(res, 404, "Machine not found");
    if (machine.status === "running") {
      return sendError(res, 400, "Cannot delete a machine that is currently running");
    }
    await machine.deleteOne();
    return sendSuccess(res, 200, "Machine deleted");
  } catch (error) {
    return sendError(res, 400, "Machine deletion failed");
  }
};

export const assignMachine = async (req: Request, res: Response) => {
  try {
    const { order_id } = req.body;
    if (!order_id) return sendError(res, 400, "order_id is required");

    const machine = await Machine.findById(req.params.id);
    if (!machine) return sendError(res, 404, "Machine not found");
    if (machine.status === "running") {
      return sendError(res, 400, "Machine is already running another order");
    }
    if (machine.status === "maintenance") {
      return sendError(res, 400, "Machine is under maintenance");
    }

    machine.status = "running";
    machine.current_order = order_id;
    machine.started_at = new Date();
    await machine.save();

    const populated = await Machine.findById(machine._id)
      .populate("current_order", "order_number status");

    return sendSuccess(res, 200, "Machine assigned", populated);
  } catch (error) {
    return sendError(res, 400, "Machine assignment failed");
  }
};

export const releaseMachine = async (req: Request, res: Response) => {
  try {
    const machine = await Machine.findById(req.params.id);
    if (!machine) return sendError(res, 404, "Machine not found");

    machine.status = "available";
    machine.current_order = null;
    machine.started_at = null;
    await machine.save();

    return sendSuccess(res, 200, "Machine released", machine);
  } catch (error) {
    return sendError(res, 400, "Machine release failed");
  }
};

export const seedMachines = async (_req: Request, res: Response) => {
  try {
    const existing = await Machine.countDocuments();
    if (existing > 0) {
      return sendSuccess(res, 200, "Machines already seeded", { count: existing });
    }

    const defaults = [
      { name: "Washer #1", type: "washer", capacity: "25 kg" },
      { name: "Washer #2", type: "washer", capacity: "25 kg" },
      { name: "Washer #3", type: "washer", capacity: "15 kg" },
      { name: "Dryer #1", type: "dryer", capacity: "30 kg" },
      { name: "Dryer #2", type: "dryer", capacity: "30 kg" },
      { name: "Dryer #3", type: "dryer", capacity: "20 kg" },
      { name: "Iron Station #1", type: "iron", capacity: "N/A" },
      { name: "Iron Station #2", type: "iron", capacity: "N/A" },
    ];

    const machines = await Machine.insertMany(defaults);
    return sendSuccess(res, 201, "Machines seeded", machines);
  } catch (error) {
    return sendError(res, 500, "Machine seeding failed");
  }
};
