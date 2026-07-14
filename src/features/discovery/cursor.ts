import { z } from "zod";
import { discoveryModeSchema } from "./schema";

const cursorSchema = z.object({
  version: z.literal(1), mode: discoveryModeSchema, query: z.string().max(100), category: z.string().max(80).nullable(),
  snapshot: z.iso.datetime(), offset: z.number().int().min(0).max(500),
});
export type DiscoveryCursor = z.infer<typeof cursorSchema>;

export function encodeDiscoveryCursor(cursor: DiscoveryCursor) { return Buffer.from(JSON.stringify(cursor)).toString("base64url"); }
export function decodeDiscoveryCursor(value: string) {
  try { return cursorSchema.parse(JSON.parse(Buffer.from(value,"base64url").toString("utf8"))); }
  catch { return null; }
}
