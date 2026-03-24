import { Request, Response } from "express";
import Client from "../models/Clients";
import User from "../models/User";
import { sendSuccess, sendError } from "../utils/response";
import { parsePagination, paginationMeta } from "../utils/paginate";

export const createClient = async (req: Request, res: Response) => {
  try {
    const existing = await Client.findOne({ email: req.body.email });
    if (existing) {
      return sendError(res, 409, "Client with this email already exists");
    }

    const client = await Client.create(req.body);
    return sendSuccess(res, 201, "Client created", client);
  } catch (error) {
    return sendError(res, 400, "Client creation failed");
  }
};

export const getAllClients = async (req: Request, res: Response) => {
  try {
    const { page, limit, skip } = parsePagination(req);
    const [clients, total] = await Promise.all([
      Client.find().skip(skip).limit(limit),
      Client.countDocuments(),
    ]);
    return sendSuccess(res, 200, "Clients retrieved", clients, paginationMeta(total, page, limit));
  } catch (error) {
    return sendError(res, 400, "Failed to fetch clients");
  }
};

export const getClientById = async (req: Request, res: Response) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) {
      return sendError(res, 404, "Client not found");
    }

    if (req.user!.role === "client") {
      const user = await User.findById(req.user!.userId).select("client");
      const userClientId = user?.client?.toString?.();
      const requestedId = req.params.id;

      if (!userClientId || userClientId !== requestedId) {
        return sendError(res, 403, "Forbidden");
      }
    }

    return sendSuccess(res, 200, "Client retrieved", client);
  } catch (error) {
    return sendError(res, 400, "Failed to fetch client");
  }
};

export const updateClient = async (req: Request, res: Response) => {
  try {
    const client = await Client.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    if (!client) {
      return sendError(res, 404, "Client not found");
    }
    return sendSuccess(res, 200, "Client updated", client);
  } catch (error) {
    return sendError(res, 400, "Client update failed");
  }
};

export const deleteClient = async (req: Request, res: Response) => {
  try {
    const client = await Client.findByIdAndDelete(req.params.id);
    if (!client) {
      return sendError(res, 404, "Client not found");
    }
    return sendSuccess(res, 200, "Client deleted");
  } catch (error) {
    return sendError(res, 400, "Client deletion failed");
  }
};

export const addProperty = async (req: Request, res: Response) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) {
      return sendError(res, 404, "Client not found");
    }

    client.properties.push(req.body);
    await client.save();

    return sendSuccess(res, 201, "Property added", client);
  } catch (error) {
    return sendError(res, 400, "Failed to add property");
  }
};

export const updateProperty = async (req: Request, res: Response) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) {
      return sendError(res, 404, "Client not found");
    }

    const property = (client.properties as any).id(req.params.propertyId);
    if (!property) {
      return sendError(res, 404, "Property not found");
    }

    Object.assign(property, req.body);
    await client.save();

    return sendSuccess(res, 200, "Property updated", client);
  } catch (error) {
    return sendError(res, 400, "Failed to update property");
  }
};

export const deleteProperty = async (req: Request, res: Response) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) {
      return sendError(res, 404, "Client not found");
    }

    const property = (client.properties as any).id(req.params.propertyId);
    if (!property) {
      return sendError(res, 404, "Property not found");
    }

    property.deleteOne();
    await client.save();

    return sendSuccess(res, 200, "Property deleted", client);
  } catch (error) {
    return sendError(res, 400, "Failed to delete property");
  }
};

async function getOwnClient(req: Request, res: Response) {
  const user = await User.findById(req.user!.userId).select("client");
  if (!user?.client) {
    sendError(res, 400, "Your account has no linked client profile");
    return null;
  }
  const client = await Client.findById(user.client);
  if (!client) {
    sendError(res, 404, "Linked client not found");
    return null;
  }
  return client;
}

export const addSelfProperty = async (req: Request, res: Response) => {
  try {
    const client = await getOwnClient(req, res);
    if (!client) return;
    client.properties.push(req.body);
    await client.save();
    return sendSuccess(res, 201, "Property added", client);
  } catch (error) {
    return sendError(res, 400, "Failed to add property");
  }
};

export const updateSelfProperty = async (req: Request, res: Response) => {
  try {
    const client = await getOwnClient(req, res);
    if (!client) return;
    const property = (client.properties as any).id(req.params.propertyId);
    if (!property) return sendError(res, 404, "Property not found");
    Object.assign(property, req.body);
    await client.save();
    return sendSuccess(res, 200, "Property updated", client);
  } catch (error) {
    return sendError(res, 400, "Failed to update property");
  }
};

export const deleteSelfProperty = async (req: Request, res: Response) => {
  try {
    const client = await getOwnClient(req, res);
    if (!client) return;
    const property = (client.properties as any).id(req.params.propertyId);
    if (!property) return sendError(res, 404, "Property not found");
    property.deleteOne();
    await client.save();
    return sendSuccess(res, 200, "Property deleted", client);
  } catch (error) {
    return sendError(res, 400, "Failed to delete property");
  }
};

export const createClientForCurrentUser = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    const user = await User.findById(userId);
    if (!user) {
      return sendError(res, 404, "User not found");
    }

    if (user.client) {
      return sendError(res, 400, "Client is already linked to this user");
    }

    const existing = await Client.findOne({ email: req.body.email });
    if (existing) {
      return sendError(res, 409, "Client with this email already exists");
    }

    const client = await Client.create(req.body);

    user.client = client._id as any;
    await user.save();

    return sendSuccess(res, 201, "Client created for current user", {
      client,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        client: client._id.toString(),
      },
    });
  } catch (error) {
    return sendError(res, 400, "Client creation failed");
  }
};
