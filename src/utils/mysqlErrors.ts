/**
 * Maps MySQL ER_DUP_ENTRY to a stable API message (index / column hints).
 */
export function duplicateEntryMessage(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const e = err as { code?: string; errno?: number; sqlMessage?: string };
  if (e.code !== "ER_DUP_ENTRY" && e.errno !== 1062) return null;
  const msg = (e.sqlMessage || "").toLowerCase();
  if (msg.includes("email") || msg.includes("uq_users_email")) {
    return "Email already in use";
  }
  if (msg.includes("phone") || msg.includes("uq_users_phone")) {
    return "Phone already in use";
  }
  return "Duplicate entry";
}
