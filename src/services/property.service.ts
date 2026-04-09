import { PropertyRepository, type PropertyInsertInput, type IPropertyRow } from "../repositories/property.repository";
import { OrderRepository } from "../repositories/order.repository";
import { UserRepository } from "../repositories/user.repository";
import { AppError } from "../utils/AppError";
import { duplicateEntryMessage } from "../utils/mysqlErrors";
import type { EntityId } from "../utils/id";

export class PropertyService {
  static async listByUserId(userId: EntityId): Promise<IPropertyRow[]> {
    return await PropertyRepository.listByUserId(userId);
  }

  static async getById(id: EntityId, userId?: EntityId): Promise<IPropertyRow> {
    const prop = await PropertyRepository.findById(id);
    if (!prop) throw new AppError("Property not found", 404);
    
    if (userId && prop.user_id !== userId) {
      throw new AppError("Forbidden", 403);
    }
    return prop;
  }

  static async addPropertyForClientUser(
    userId: EntityId,
    input: Omit<PropertyInsertInput, "user_id">
  ): Promise<IPropertyRow | null> {
    // Check for duplicates by lat/lng
    if (input.lat !== undefined && input.lng !== undefined && input.lat !== null && input.lng !== null) {
      const existing = await PropertyRepository.findByLatLng(userId, input.lat, input.lng);
      if (existing) {
        throw new AppError("Ya existe una sede con estas coordenadas para este cliente", 409);
      }
    }

    try {
      const row: PropertyInsertInput = {
        user_id: userId,
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

    if (userId && prop.user_id !== userId) {
      throw new AppError("Forbidden", 403);
    }

    // Check for duplicates by lat/lng if coordinates are changing
    const newLat = data.lat !== undefined ? data.lat : prop.lat;
    const newLng = data.lng !== undefined ? data.lng : prop.lng;

    if (newLat !== null && newLng !== null) {
      const existing = await PropertyRepository.findByLatLng(prop.user_id, newLat, newLng);
      if (existing && existing.id !== propertyId) {
        throw new AppError("Ya existe una sede con estas coordenadas para este cliente", 409);
      }
    }

    await PropertyRepository.update(propertyId, data);
  }

  static async deleteProperty(propertyId: EntityId, userId?: EntityId): Promise<void> {
    const prop = await PropertyRepository.findById(propertyId);
    if (!prop) throw new AppError("Property not found", 404);

    if (userId && prop.user_id !== userId) {
      throw new AppError("Forbidden", 403);
    }

    // Integrity Check: Cannot delete if associated with an order
    const hasOrders = await OrderRepository.existsByPropertyId(propertyId);
    if (hasOrders) {
      throw new AppError("No se puede eliminar la sede porque tiene órdenes asociadas. Por seguridad, el historial de sedes debe mantenerse si ya ha sido utilizado.", 400);
    }

    await PropertyRepository.delete(propertyId);
  }
}
