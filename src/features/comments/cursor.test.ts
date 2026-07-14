import {describe,expect,it} from "vitest";
import {decodeCommentCursor,encodeCommentCursor} from "./cursor";
const value={version:1 as const,questionId:"11111111-1111-4111-8111-111111111111",before:"2026-07-13T10:00:00.000Z",beforeId:"22222222-2222-4222-8222-222222222222"};
describe("curseur commentaires",()=>{it("est lié à la question",()=>expect(decodeCommentCursor(encodeCommentCursor(value))).toEqual(value));it("refuse une valeur invalide",()=>expect(decodeCommentCursor("non")).toBeNull())});
