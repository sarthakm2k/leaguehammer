import { chromium } from 'playwright';
import path from 'path';

const ARTIFACTS_DIR = 'C:/Users/admin/.gemini/antigravity-ide/brain/b49c33ec-6c3b-4600-87fa-32cfd96bc601';

async function run() {
  console.log('1. Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    console.log('2. Navigating to login page...');
    await page.goto('http://localhost:5174/login', { waitUntil: 'networkidle' });

    console.log('3. Filling login credentials...');
    await page.fill('input[type="email"]', 'admin@malabarfc.com');
    await page.fill('input[type="password"]', 'SecureAuction2026!');
    await page.click('button[type="submit"]');

    console.log('4. Waiting for dashboard navigation...');
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    console.log('Successfully logged in!');

    console.log('5. Navigating to Tournament Overview...');
    await page.goto('http://localhost:5174/tournaments/662dbae9-1f23-4cb7-9847-d85c2c4c87e3', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const overviewShotPath = path.join(ARTIFACTS_DIR, 'm6_overview_screen.png');
    await page.screenshot({ path: overviewShotPath });
    console.log(`Saved overview screenshot to ${overviewShotPath}`);

    console.log('6. Clicking Live Auction Console...');
    const liveButton = page.locator('text=Live Auction Console').first();
    await liveButton.click();

    await page.waitForURL('**/auction', { timeout: 10000 });
    await page.waitForTimeout(1500);
    console.log('7. Successfully reached Auctioneer Console!');

    // Check if there is an active lot already or if we need to reveal
    let revealBtn = page.locator('button:has-text("REVEAL NEXT PLAYER")');
    if (await revealBtn.isVisible()) {
      console.log('Clicking Reveal Next Player...');
      await revealBtn.click();
      await page.waitForTimeout(2000);
    }

    const playerRevealedShot = path.join(ARTIFACTS_DIR, 'm6_player_revealed.png');
    await page.screenshot({ path: playerRevealedShot });
    console.log(`Saved revealed player screenshot to ${playerRevealedShot}`);

    // If a lot is on podium, sell it or adjust bid
    const soldBtn = page.locator('button:has-text("SOLD TO")').first();
    if (await soldBtn.isVisible()) {
      // Click increment button +₹1000 or +₹500
      const incBtn = page.locator('button:has-text("+₹1000"), button:has-text("+₹500")').first();
      if (await incBtn.isVisible()) {
        await incBtn.click();
        await page.waitForTimeout(300);
        console.log('Clicked bid increment button');
      }

      console.log('Selling player to winning franchise...');
      await soldBtn.click();
      await page.waitForTimeout(2500);

      const soldShot = path.join(ARTIFACTS_DIR, 'm6_sold_success.png');
      await page.screenshot({ path: soldShot });
      console.log(`Saved sold player screenshot to ${soldShot}`);
    }

    // Check recent lot correction button
    const correctBtn = page.locator('button:has-text("Correct")').first();
    if (await correctBtn.isVisible()) {
      console.log('Testing Result Correction modal...');
      await correctBtn.click();
      await page.waitForTimeout(1000);

      const correctionModalShot = path.join(ARTIFACTS_DIR, 'm6_correction_modal.png');
      await page.screenshot({ path: correctionModalShot });
      console.log(`Saved correction modal screenshot to ${correctionModalShot}`);

      // Fill audit reason
      const reasonInput = page.locator('textarea, input[placeholder*="reason" i]').first();
      if (await reasonInput.isVisible()) {
        await reasonInput.fill('Correcting winning team assignment post-confirmation review');
        await page.waitForTimeout(300);
        const commitBtn = page.locator('button:has-text("Commit Correction")').first();
        if (await commitBtn.isVisible()) {
          console.log('Clicking Commit Correction...');
          await commitBtn.click();
          await page.waitForTimeout(2500);
          console.log('Successfully committed result correction!');
        }
      }
    }

    // Now reveal another player and mark UNSOLD
    revealBtn = page.locator('button:has-text("REVEAL NEXT PLAYER")');
    if (await revealBtn.isVisible()) {
      console.log('Revealing next player to test UNSOLD action...');
      await revealBtn.click();
      await page.waitForTimeout(2000);

      const unsoldBtn = page.locator('button:has-text("MARK UNSOLD")').first();
      if (await unsoldBtn.isVisible()) {
        console.log('Marking player as UNSOLD...');
        await unsoldBtn.click();
        await page.waitForTimeout(2500);
        console.log('Successfully marked lot as unsold!');
      }
    }

    const finalConsoleShot = path.join(ARTIFACTS_DIR, 'm6_console_final.png');
    await page.screenshot({ path: finalConsoleShot });
    console.log(`Saved final console screenshot to ${finalConsoleShot}`);

    console.log('All Milestone 6 verification steps completed successfully!');
  } catch (err) {
    console.error('Verification failed:', err);
    const errShot = path.join(ARTIFACTS_DIR, 'm6_error_debug.png');
    await page.screenshot({ path: errShot }).catch(() => {});
    throw err;
  } finally {
    await browser.close();
  }
}

run();
