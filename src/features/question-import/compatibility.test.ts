import { describe, expect, it } from "vitest";

import { convertImportStatus, parseQuestionFormat } from "./compatibility";

describe("compatibilité du contrat Excel", () => {
  it("publie ready", () => expect(convertImportStatus("ready")).toEqual({ action: "import", status: "published" }));
  it("conserve review en brouillon", () => expect(convertImportStatus("review")).toEqual({ action: "import", status: "draft" }));
  it("ignore rejected", () => expect(convertImportStatus("rejected")).toEqual({ action: "ignore", status: null }));
  it.each(["opinion", "projection", "regulation", "comportement", "dilemme"])("accepte le format %s", (format) => expect(parseQuestionFormat(format)).toBe(format));
  it("refuse un format inconnu", () => expect(parseQuestionFormat("actualité")).toBeNull());
});

