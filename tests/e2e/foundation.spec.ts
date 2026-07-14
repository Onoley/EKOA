import { expect, test } from "@playwright/test";

test("affiche la connexion française ou son état de configuration", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Répondez/ })).toBeVisible();
  await expect(page.getByText(/ne constituent pas un sondage/)).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");

  const form = page.getByRole("button", { name: "Recevoir un lien de connexion" });
  const setupState = page.getByText("La configuration Supabase est requise");
  await expect(form.or(setupState)).toBeVisible();
});

test("affiche une erreur de lien de connexion accessible", async ({ page }) => {
  await page.goto("/auth/erreur");
  await expect(page.getByRole("heading", { name: "Ce lien n’est plus valide" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Retour à la connexion" })).toBeVisible();
});
