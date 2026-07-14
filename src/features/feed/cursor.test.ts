import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor } from "./cursor";

const id = "11111111-1111-4111-8111-111111111111";

describe("feed cursor", () => {
  it("round-trips opaque state", () => {
    const cursor = { version: 1 as const, sessionId:id, snapshot: "2026-07-13T10:00:00.000Z", offset:5 };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });
  it("rejects invalid and obsolete cursors", () => {
    expect(decodeCursor("invalid")).toBeNull();
    expect(decodeCursor(Buffer.from(JSON.stringify({ version: 0 })).toString("base64url"))).toBeNull();
  });
});
