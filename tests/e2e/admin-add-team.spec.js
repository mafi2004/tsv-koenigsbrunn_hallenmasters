import { test, expect } from "@playwright/test";

test("Admin adds team → Viewer sees it", async ({ page, browser }) => {
  await page.goto("http://localhost/5v5/admin.html");

  await page.fill("#teamName", "TSV Königsbrunn");
  await page.selectOption("#teamGroup", "A");
  await page.click("#btnAddTeam");

  const viewer = await browser.newPage();
  await viewer.goto("http://localhost/5v5/viewer.html");

  await viewer.waitForSelector("text=TSV Königsbrunn");
});
