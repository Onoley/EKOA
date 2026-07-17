import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/app/admin/page.tsx", "utf8");
const layout = readFileSync("src/app/admin/layout.tsx", "utf8");

describe("contrat d’accès à l’administration", () => {
  it("protège la page et son layout avec requireAdmin", () => {
    expect(page).toContain("await requireAdmin()");
    expect(layout).toContain("await requireAdmin()");
  });

  it("n’autorise plus le rôle modérateur sur la route admin", () => {
    expect(page).not.toContain("requireModerator");
    expect(layout).not.toContain("requireModerator");
  });
});
