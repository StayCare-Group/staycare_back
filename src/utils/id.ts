import { randomUUID } from "crypto";

export type EntityId = string;

export const generateEntityId = (): EntityId => randomUUID();
