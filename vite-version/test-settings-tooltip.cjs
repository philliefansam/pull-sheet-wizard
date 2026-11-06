const puppeteer = require('c:/Users/shanni/Documents/MTO Wizard/node_modules/puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--allow-file-access-from-files']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const filePath = 'file:///' + path.resolve('vite-version/dist/PullSheetWizard.html').replace(/\\/g, '/');
  await page.goto(filePath, { waitUntil: 'load' });
  
  // 1. Navigate to Settings
  await page.evaluate(() => {
    document.getElementById('nav-settings').click();
  });
  await new Promise(r => setTimeout(r, 400));

  // 2. Verify label cursor and tooltip attributes
  const labelCheck = await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('.settings-tooltip-label'));
    return labels.map(l => ({
      text: l.textContent.trim(),
      cursor: window.getComputedStyle(l).cursor,
      tooltipAttr: l.getAttribute('data-tooltip')
    }));
  });
  console.log('1. Settings labels:', labelCheck);
  if (labelCheck.length !== 2) {
    throw new Error('Expected 2 settings tooltip labels');
  }
  if (labelCheck[0].cursor !== 'help' || labelCheck[1].cursor !== 'help') {
    throw new Error('Expected cursor: help on settings labels');
  }

  // 3. Hover over the first label to trigger tooltip
  const firstLabel = await page.$('.settings-tooltip-label');
  await firstLabel.hover();
  await new Promise(r => setTimeout(r, 300));

  // Take screenshot with tooltip visible
  await page.screenshot({ 
    path: 'c:/Users/shanni/.gemini/antigravity/brain/4edc73d8-c6bf-420b-bf82-d2ae6d9a8879/settings_tooltip_screenshot.png',
    fullPage: false 
  });

  console.log('\n>>> SETTINGS TOOLTIP VERIFICATION PASSED SUCCESSFULLY! <<<');
  await browser.close();
})().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
