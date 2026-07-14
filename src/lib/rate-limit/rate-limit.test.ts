import { describe, expect, it } from "vitest";

describe("politiques de limitation", () => {
  it("reste un module exclusivement serveur", async () => {
    const source = await import("node:fs/promises").then((fs) => fs.readFile("src/lib/rate-limit/rate-limit.ts", "utf8"));
    expect(source).toContain('import "server-only"');
    expect(source).toContain('createHash("sha256")');
    expect(source).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});
