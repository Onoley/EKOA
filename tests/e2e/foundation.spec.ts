import { expect, test } from "@playwright/test";

test("affiche la connexion française ou son état de configuration", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Répondez/ })).toBeVisible();
  await expect(page.getByText(/ne constituent pas un sondage/)).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");

  const form = page.getByRole("button", { name: "Se connecter" });
  const setupState = page.getByText("La configuration Supabase est requise");
  await expect(form.or(setupState)).toBeVisible();
});

test("propose la création de compte et la récupération du mot de passe", async ({ page }) => {
  await page.goto("/");
  const setupState = page.getByText("La configuration Supabase est requise");
  if (await setupState.isVisible()) {
    await expect(setupState).toBeVisible();
    return;
  }
  await page.getByRole("tab", { name: "Créer un compte" }).click();
  await expect(page.getByRole("button", { name: "Créer mon compte" })).toBeVisible();
  await page.goto("/mot-de-passe/oublie");
  await expect(page.getByRole("heading", { name: "Mot de passe oublié" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Recevoir l’e-mail" })).toBeVisible();
});

test("affiche une erreur de lien de connexion accessible", async ({ page }) => {
  await page.goto("/auth/erreur");
  await expect(page.getByRole("heading", { name: "Ce lien n’est plus valide" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Retour à la connexion" })).toBeVisible();
});
