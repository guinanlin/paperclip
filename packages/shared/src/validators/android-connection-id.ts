import { z } from "zod";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AndroidConnectionIdRef =
  | { kind: "public"; publicId: number }
  | { kind: "uuid"; uuid: string };

export function parseAndroidConnectionIdRef(value: unknown): AndroidConnectionIdRef | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return { kind: "public", publicId: value };
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) {
      const publicId = Number.parseInt(trimmed, 10);
      if (publicId > 0) return { kind: "public", publicId };
    }
    if (UUID_RE.test(trimmed)) {
      return { kind: "uuid", uuid: trimmed };
    }
  }

  return null;
}

export const androidConnectionIdSchema = z.union([
  z.string().uuid(),
  z.coerce.number().int().positive(),
]);
