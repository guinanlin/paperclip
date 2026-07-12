import { describe, expect, it } from "vitest";
import { parseAndroidConnectionIdRef } from "@paperclipai/shared";

describe("parseAndroidConnectionIdRef", () => {
  it("accepts positive integers", () => {
    expect(parseAndroidConnectionIdRef(12)).toEqual({ kind: "public", publicId: 12 });
    expect(parseAndroidConnectionIdRef("12")).toEqual({ kind: "public", publicId: 12 });
  });

  it("accepts uuid strings", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    expect(parseAndroidConnectionIdRef(uuid)).toEqual({ kind: "uuid", uuid });
  });

  it("rejects invalid values", () => {
    expect(parseAndroidConnectionIdRef("not-a-uuid")).toBeNull();
    expect(parseAndroidConnectionIdRef("")).toBeNull();
    expect(parseAndroidConnectionIdRef(0)).toBeNull();
  });
});
