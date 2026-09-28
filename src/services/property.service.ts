import { PropertyRepository, type PropertyInsertInput, type IPropertyRow } from "../repositories/property.repository";
import { OrderRepository } from "../repositories/order.repository";
import { UserRepository } from "../repositories/user.repository";
import { AppError } from "../utils/AppError";
import { duplicateEntryMessage } from "../utils/mysqlErrors";
import type { EntityId } from "../utils/id";

export class PropertyService {
  private static async resolveTargetClientId(userId: EntityId): Promise<EntityId> {
    const user = await UserRepository.findById(userId);
    return user?.parent_client_id ?? userId;
  }

  static async listByUserId(userId: EntityId): Promise<IPropertyRow[]> {
    const targetUserId = await this.resolveTargetClientId(userId);
    return await PropertyRepository.listByUserId(targetUserId);
  }

  static async getById(id: EntityId, userId?: EntityId): Promise<IPropertyRow> {
    const prop = await PropertyRepository.findById(id);
    if (!prop) throw new AppError("Property not found", 404);
    
    if (userId) {
      const targetUserId = await this.resolveTargetClientId(userId);
      if (prop.user_id !== userId && prop.user_id !== targetUserId) {
        throw new AppError("Forbidden", 403);
      }
    }
    return prop;
  }

  static async addPropertyForClientUser(
    userId: EntityId,
    input: Omit<PropertyInsertInput, "user_id">
  ): Promise<IPropertyRow | null> {
    const targetUserId = await this.resolveTargetClientId(userId);

    // Check for duplicates by lat/lng
    if (input.lat !== undefined && input.lng !== undefined && input.lat !== null && input.lng !== null) {
      const existing = await PropertyRepository.findByLatLng(targetUserId, input.lat, input.lng);
      if (existing) {
        throw new AppError("A property with these coordinates already exists for this client", 409);
      }
    }

    try {
      const row: PropertyInsertInput = {
        user_id: targetUserId,
        ...input,
      };
      const id = await PropertyRepository.insert(null, row);
      return await PropertyRepository.findById(id);
    } catch (err) {
      const dup = duplicateEntryMessage(err);
      if (dup) throw new AppError(dup, 409);
      throw err;
    }
  }

  static async updateProperty(
    propertyId: EntityId,
    data: Partial<Pick<IPropertyRow, "property_name" | "address" | "city" | "area" | "access_notes" | "lat" | "lng">>,
    userId?: EntityId
  ): Promise<void> {
    const prop = await PropertyRepository.findById(propertyId);
    if (!prop) throw new AppError("Property not found", 404);

    if (userId) {
      const targetUserId = await this.resolveTargetClientId(userId);
      if (prop.user_id !== userId && prop.user_id !== targetUserId) {
        throw new AppError("Forbidden", 403);
      }
    }

    // Check for duplicates by lat/lng if coordinates are changing
    const newLat = data.lat !== undefined ? data.lat : prop.lat;
    const newLng = data.lng !== undefined ? data.lng : prop.lng;

    if (newLat !== null && newLng !== null) {
      const existing = await PropertyRepository.findByLatLng(prop.user_id, newLat, newLng);
      if (existing && existing.id !== propertyId) {
        throw new AppError("A property with these coordinates already exists for this client", 409);
      }
    }

    await PropertyRepository.update(propertyId, data);
  }

  static async deleteProperty(propertyId: EntityId, userId?: EntityId): Promise<void> {
    const prop = await PropertyRepository.findById(propertyId);
    if (!prop) throw new AppError("Property not found", 404);

    if (userId) {
      const targetUserId = await this.resolveTargetClientId(userId);
      if (prop.user_id !== userId && prop.user_id !== targetUserId) {
        throw new AppError("Forbidden", 403);
      }
    }

    // Integrity Check: Cannot delete if associated with an order
    const hasOrders = await OrderRepository.existsByPropertyId(propertyId);
    if (hasOrders) {
      throw new AppError("Cannot delete property because it has associated orders.", 400);
    }

    await PropertyRepository.delete(propertyId);
  }
}
