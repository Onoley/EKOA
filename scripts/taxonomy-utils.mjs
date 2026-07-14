import {createHash} from "node:crypto";
export function stableUuid(namespace,slug){const hex=createHash("sha256").update(`ekoa:${namespace}:${slug}`).digest("hex").slice(0,32).split("");hex[12]="5";hex[16]=((Number.parseInt(hex[16],16)&3)|8).toString(16);return `${hex.slice(0,8).join("")}-${hex.slice(8,12).join("")}-${hex.slice(12,16).join("")}-${hex.slice(16,20).join("")}-${hex.slice(20).join("")}`}
export const sql=(value)=>`'${String(value).replaceAll("'","''")}'`;
