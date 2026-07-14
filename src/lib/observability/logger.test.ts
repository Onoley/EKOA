import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("journal opérationnel", () => {
  it("utilise un contexte fermé sans charge utilisateur", async () => {
    const source = await readFile("src/lib/observability/logger.ts", "utf8");
    expect(source).toContain("type SafeContext");
    expect(source).not.toContain("email?:");
    expect(source).not.toContain("metadata?:");
    expect(source).not.toContain("payload?:");
  });
});
