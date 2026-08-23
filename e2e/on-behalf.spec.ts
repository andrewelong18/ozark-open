// An admin placing a wager for someone else — /bets?for=<userId>.
//
// This is the worst silent bug the app can have: a wager landing on the wrong
// person's slate. It is money, it is invisible until someone reconciles, and
// until now no browser test had ever exercised the path. The compile-time guard
// (onBehalfOf is a required prop) and the unit test on placementTarget both
// prove the *decision*; only this proves the request that actually goes out.
//
// So the assertion is on the wire: which endpoint, and whose id in the body.

import { expect, test } from "@playwright/test"

import { ACCOUNTS, deletePlacementsFor, signInAs, signOut, userIdFor } from "./fixtures/auth.ts"

test("an admin's wager for a member lands on the member, not the admin", async ({ page }) => {
  const memberId = await userIdFor(ACCOUNTS.approved)
  const adminId = await userIdFor(ACCOUNTS.admin)
  await deletePlacementsFor(ACCOUNTS.approved)
  await deletePlacementsFor(ACCOUNTS.admin)

  await signInAs(page, ACCOUNTS.admin)
  await page.goto(`/bets?for=${memberId}`)

  // The page says whose slate this is, in so many words.
  await expect(page.getByText("Placing wagers as Avery Approved.")).toBeVisible()

  // Capture the write as it happens.
  const posts: { url: string; body: unknown }[] = []
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/")) {
      posts.push({ url: request.url(), body: request.postDataJSON() })
    }
  })

  const row = page
    .getByTestId("bet-1")
    .locator("div")
    .filter({ has: page.getByText("Dan Mercer", { exact: true }) })
    .filter({ has: page.getByRole("button", { name: "Place stake" }) })
    .last()
  await row.getByRole("textbox").fill("7")
  await row.getByRole("button", { name: "Place stake" }).click()
  await page.getByRole("button", { name: "Confirm bet" }).click()
  await expect(page.getByText("Locked in")).toBeVisible()

  const placement = posts.find((p) => p.url.includes("/placements"))
  expect(placement, "no placement request was sent").toBeTruthy()

  // The admin route, not the member route — a dropped flag would silently swap
  // these and the wager would become the admin's own.
  expect(placement!.url).toContain("/api/admin/placements")
  expect(placement!.url).not.toContain("/api/placements")

  // And the body names the MEMBER as the bettor.
  expect((placement!.body as { userId?: string }).userId).toBe(memberId)
  expect((placement!.body as { userId?: string }).userId).not.toBe(adminId)

  // The consequence, read off both slates.
  await page.goto("/my-bets")
  await expect(page.getByText("Dan Mercer")).toHaveCount(0)

  await signOut(page)
  await signInAs(page, ACCOUNTS.approved)
  await page.goto("/my-bets")
  await expect(page.getByText("Dan Mercer")).toBeVisible()
  await expect(page.getByTestId("budget-wagered")).toHaveText("$7")
})

test("a non-admin can't open someone else's slate", async ({ page }) => {
  const memberId = await userIdFor(ACCOUNTS.nonplayer)

  await signInAs(page, ACCOUNTS.approved)
  const response = await page.goto(`/bets?for=${memberId}`)

  // 404, deliberately — not a 403, and emphatically not a silent render of the
  // viewer's own menu, which would let them place thinking they were someone
  // else (or worse, not notice).
  expect(response?.status()).toBe(404)
  await expect(page.getByText("Placing wagers as")).toHaveCount(0)
})
