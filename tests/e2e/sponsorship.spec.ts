import { expect,test } from "@playwright/test";

test("un visiteur ne peut pas ouvrir les rapports sponsor",async({page})=>{
 await page.goto("/profil/campagnes");
 await expect(page).toHaveURL(/\/$/);
 await expect(page.getByLabel(/e-mail/i)).toBeVisible();
 await expect(page.getByText("Rapports sponsor",{exact:true})).toHaveCount(0);
});
