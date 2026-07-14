import { RECOMMENDATION_CONFIG } from "./constants";
import type { AffinityProfile, InteractionSignal } from "./types";

const clamp = (value: number) => Math.max(RECOMMENDATION_CONFIG.affinityBounds.min, Math.min(RECOMMENDATION_CONFIG.affinityBounds.max, value));

function add(target: Map<string, number>, key: string | null, value: number) {
  if (!key) return;
  target.set(key, clamp((target.get(key) ?? 0) + value));
}

export function decayWeight(weight: number, occurredAt: string, now: Date) {
  const days = Math.max(0, (now.getTime() - new Date(occurredAt).getTime()) / 86_400_000);
  return weight * Math.exp(-days / RECOMMENDATION_CONFIG.interestDecayDays);
}

export function computeUserAffinity(signals: InteractionSignal[], followedCategories: Array<{ categoryId: string; universeId: string }>, now: Date): AffinityProfile {
  const profile: AffinityProfile = { universes: new Map(), categories: new Map(), tags: new Map(), formats: new Map(), interactionCount: signals.length };
  for (const followed of followedCategories) {
    add(profile.categories, followed.categoryId, RECOMMENDATION_CONFIG.interactionWeights.category_follow.category);
    add(profile.universes, followed.universeId, RECOMMENDATION_CONFIG.interactionWeights.category_follow.universe);
  }
  for (const signal of signals) {
    if (signal.type === "report" || signal.type === "category_unfollow") continue;
    const weights = RECOMMENDATION_CONFIG.interactionWeights[signal.type];
    if (!weights) continue;
    if ("category" in weights) add(profile.categories, signal.categoryId, decayWeight(weights.category, signal.occurredAt, now));
    if ("universe" in weights) add(profile.universes, signal.universeId, decayWeight(weights.universe, signal.occurredAt, now));
    if ("tag" in weights) for (const tag of signal.tags) add(profile.tags, tag, decayWeight(weights.tag, signal.occurredAt, now));
    if ("format" in weights) add(profile.formats, signal.format, decayWeight(weights.format, signal.occurredAt, now));
  }
  return profile;
}
