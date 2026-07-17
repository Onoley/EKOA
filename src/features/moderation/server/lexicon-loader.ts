import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {extendedModerationLexiconSchema,moderationLexiconSchema,type ExtendedModerationLexicon,type ModerationLexicon} from "../schema";

if(typeof window!=="undefined"&&process.env.NODE_ENV!=="test")throw new Error("moderation_lexicon_server_only");

const lexiconDirectory=join(process.cwd(),"src/features/moderation/data/fr");
let fullLexiconPromise:Promise<ModerationLexicon>|undefined;
let coreLexiconPromise:Promise<ModerationLexicon>|undefined;
let extendedLexiconPromise:Promise<ExtendedModerationLexicon>|undefined;

async function readLexicon<T>(filename:string,parse:(value:unknown)=>T):Promise<T>{
 const raw=await readFile(join(lexiconDirectory,filename),"utf8");
 return parse(JSON.parse(raw) as unknown);
}

export function loadFullModerationLexicon(){
 fullLexiconPromise??=readLexicon("ekoa_moderation_lexicon_fr_v1.json",value=>moderationLexiconSchema.parse(value));
 return fullLexiconPromise;
}

export function loadCoreModerationLexicon(){
 coreLexiconPromise??=readLexicon("ekoa_moderation_lexicon_core_fr_v1.json",value=>moderationLexiconSchema.parse(value));
 return coreLexiconPromise;
}

export function loadExtendedModerationLexicon(){
 extendedLexiconPromise??=readLexicon("ekoa_moderation_lexicon_extended_fr_v1.json",value=>extendedModerationLexiconSchema.parse(value));
 return extendedLexiconPromise;
}
