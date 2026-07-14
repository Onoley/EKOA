import { z } from "zod";
import { ALGORITHM_VERSION } from "./schema";

const cursorSchema = z.object({
  version: z.literal(ALGORITHM_VERSION),
  sessionId: z.uuid(),
  snapshot: z.iso.datetime(),
  offset: z.number().int().min(0).max(10_000),
});

export type FeedCursor = z.infer<typeof cursorSchema>;

export function encodeCursor(cursor: FeedCursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeCursor(value: string): FeedCursor | null {
  try {
    return cursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
  } catch {
    return null;
  }
}
