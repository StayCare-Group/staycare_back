import { Request, Response } from "express";
import Route from "../models/Routes";
import Order from "../models/Orders";
import { sendSuccess, sendError } from "../utils/response";
import { parsePagination, paginationMeta } from "../utils/paginate";

export const createRoute = async (req: Request, res: Response) => {
  try {
    const route = await Route.create(req.body);

    if (req.body.orders?.length) {
      await Order.updateMany(
        { _id: { $in: req.body.orders } },
        { status: "Assigned", deliver_id: req.body.driver, updated_at: new Date() },
      );
    }

    return sendSuccess(res, 201, "Route created", route);
  } catch (error) {
    return sendError(res, 400, "Route creation failed");
  }
};

export const getAllRoutes = async (req: Request, res: Response) => {
  try {
    const { status, driver, area, date } = req.query;
    const filter: Record<string, any> = {};

    if (status) filter.status = status;
    if (area) filter.area = area;

    if (req.user!.role === "driver") {
      filter.driver = req.user!.userId;
    } else if (driver) {
      filter.driver = driver;
    }

    if (date) {
      const d = new Date(date as string);
      const nextDay = new Date(d);
      nextDay.setDate(nextDay.getDate() + 1);
      filter.route_date = { $gte: d, $lt: nextDay };
    }

    const { page, limit, skip } = parsePagination(req);
    const [routes, total] = await Promise.all([
      Route.find(filter)
        .populate("driver", "name email phone")
        .populate({
          path: "orders",
          populate: { path: "client", select: "company_name contact_person phone properties billing_address" },
        })
        .sort({ route_date: -1 })
        .skip(skip)
        .limit(limit),
      Route.countDocuments(filter),
    ]);

    return sendSuccess(res, 200, "Routes retrieved", routes, paginationMeta(total, page, limit));
  } catch (error) {
    return sendError(res, 400, "Failed to fetch routes");
  }
};

export const getRouteById = async (req: Request, res: Response) => {
  try {
    const route = await Route.findById(req.params.id)
      .populate("driver", "name email phone")
      .populate({
        path: "orders",
        populate: [
          { path: "client", select: "company_name contact_person phone properties billing_address" },
        ],
      });

    if (!route) {
      return sendError(res, 404, "Route not found");
    }

    return sendSuccess(res, 200, "Route retrieved", route);
  } catch (error) {
    return sendError(res, 400, "Failed to fetch route");
  }
};

export const updateRoute = async (req: Request, res: Response) => {
  try {
    const route = await Route.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    if (!route) {
      return sendError(res, 404, "Route not found");
    }
    return sendSuccess(res, 200, "Route updated", route);
  } catch (error) {
    return sendError(res, 400, "Route update failed");
  }
};

export const updateRouteStatus = async (req: Request, res: Response) => {
  try {
    const route = await Route.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true },
    );
    if (!route) {
      return sendError(res, 404, "Route not found");
    }
    return sendSuccess(res, 200, "Route status updated", route);
  } catch (error) {
    return sendError(res, 400, "Route status update failed");
  }
};

export const deleteRoute = async (req: Request, res: Response) => {
  try {
    const route = await Route.findById(req.params.id);
    if (!route) {
      return sendError(res, 404, "Route not found");
    }
    if (route.status !== "planned") {
      return sendError(res, 400, "Only planned routes can be deleted");
    }
    await route.deleteOne();
    return sendSuccess(res, 200, "Route deleted");
  } catch (error) {
    return sendError(res, 400, "Route deletion failed");
  }
};
