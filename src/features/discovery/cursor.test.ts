import { describe,expect,it } from "vitest";
import { decodeDiscoveryCursor,encodeDiscoveryCursor } from "./cursor";

describe("curseur Explorer",()=>{
  it("conserve la recherche et l'instantané",()=>{ const value={version:1 as const,mode:"search" as const,query:"mobilité",category:"transport",snapshot:"2026-07-13T10:00:00.000Z",offset:12}; expect(decodeDiscoveryCursor(encodeDiscoveryCursor(value))).toEqual(value); });
  it("refuse un curseur altéré",()=>expect(decodeDiscoveryCursor("invalide")).toBeNull());
});
