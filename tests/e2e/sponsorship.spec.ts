import { expect,test } from "@playwright/test";

test("un visiteur ne peut pas ouvrir les rapports sponsor",async({page})=>{
 await page.goto("/profil/campagnes");
 await expect(page).toHaveURL(/\/$/);
 const signIn=page.getByLabel(/e-mail/i);
 const setupState=page.getByText("La configuration Supabase est requise");
 await expect(signIn.or(setupState)).toBeVisible();
 await expect(page.getByText("Rapports sponsor",{exact:true})).toHaveCount(0);
});
