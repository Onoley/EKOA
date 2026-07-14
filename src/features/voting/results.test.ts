import { describe, expect, it } from "vitest";
import { formatPercentage, resultBarWidth } from "./results";

describe("résultats", () => {
  it("borne les largeurs de barres", () => { expect(resultBarWidth(-2)).toBe("0%"); expect(resultBarWidth(125)).toBe("100%"); });
  it("formate un pourcentage en français", () => expect(formatPercentage(33.3)).toBe("33,3"));
});
