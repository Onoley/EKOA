import {z} from "zod";
const schema=z.object({version:z.literal(1),questionId:z.uuid(),before:z.iso.datetime(),beforeId:z.uuid()});
export function encodeCommentCursor(value:z.infer<typeof schema>){return Buffer.from(JSON.stringify(value)).toString("base64url")}
export function decodeCommentCursor(value:string){try{return schema.parse(JSON.parse(Buffer.from(value,"base64url").toString("utf8")))}catch{return null}}
