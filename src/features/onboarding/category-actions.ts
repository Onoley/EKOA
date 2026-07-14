"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActiveProfile } from "@/features/auth/authorization";

export async function setCategoryFollow(formData: FormData) {
  const categoryId = z.uuid().safeParse(formData.get("categoryId"));
  const intent = z.enum(["follow", "unfollow"]).safeParse(formData.get("intent"));
  if (!categoryId.success || !intent.success) return;

  const { supabase, profile } = await requireActiveProfile();
  if (intent.data === "follow") {
    const { error } = await supabase.from("category_follows").insert({ user_id: profile.user_id, category_id: categoryId.data });
    if (error && error.code !== "23505") throw new Error("Impossible de suivre cette catégorie.");
  } else {
    const { error } = await supabase.from("category_follows").delete().eq("user_id", profile.user_id).eq("category_id", categoryId.data);
    if (error) throw new Error("Impossible de ne plus suivre cette catégorie.");
  }
  revalidatePath("/explorer");
}
