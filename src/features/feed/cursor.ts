import { z } from "zod";
import { ALGORITHM_VERSION } from "./schema";

const cursorSchema = z.object({
  version: z.literal(ALGORITHM_VERSION),
  snapshot: z.iso.datetime(),
  seen: z.array(z.uuid()).max(200),
  recentAuthors: z.array(z.uuid()).max(2),
  recentCategories: z.array(z.uuid()).max(2),
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
