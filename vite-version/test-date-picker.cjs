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
  
  const consoleLogs = [];
  page.on('console', msg => consoleLogs.push(msg.type() + ': ' + msg.text()));
  page.on('pageerror', err => consoleLogs.push('ERROR: ' + err.toString()));

  await page.goto(filePath, { waitUntil: 'load' });
  
  console.log('Testing Date Picker in Project Details...');

  // 1. Verify date picker input attributes
  const dateFieldInfo = await page.evaluate(() => {
    const el = document.getElementById('meta-date-processed');
    const now = new Date();
    const expectedToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return {
      type: el ? el.type : null,
      readOnly: el ? el.readOnly : null,
      value: el ? el.value : null,
      expectedToday: expectedToday,
      matchesToday: el && el.value === expectedToday
    };
  });
  console.log('1. Date Field Info:', dateFieldInfo);
  if (dateFieldInfo.type !== 'date') {
    throw new Error('Expected type="date", got: ' + dateFieldInfo.type);
  }
  if (dateFieldInfo.readOnly) {
    throw new Error('Expected date field NOT to be readonly');
  }
  if (!dateFieldInfo.matchesToday) {
    throw new Error(`Expected default value to match today (${dateFieldInfo.expectedToday}), got: ${dateFieldInfo.value}`);
  }

  // 2. Load demo files so Project Details is visible and populated
  await page.evaluate(() => {
    document.getElementById('btn-generate-demo').click();
  });
  await new Promise(r => setTimeout(r, 600));

  // 3. Change date picker value to a specific test date
  const testDate = '2026-12-25';
  await page.evaluate((val) => {
    const el = document.getElementById('meta-date-processed');
    el.value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, testDate);

  const afterDateChange = await page.evaluate(() => {
    const dbRows = document.getElementById('db-metadata-rows');
    return {
      stateDate: window.state.metadata.dateProcessed,
      dbPreviewContains: dbRows ? dbRows.textContent : ''
    };
  });
  console.log('2. After changing date to ' + testDate + ':', afterDateChange);
  if (afterDateChange.stateDate !== testDate) {
    throw new Error('state.metadata.dateProcessed did not update to ' + testDate);
  }

  // 4. Verify pull sheet report uses the changed date
  const pullSheetDate = await page.evaluate(() => {
    document.getElementById('btn-print-pull-sheet').click();
    const container = document.getElementById('pull-sheet-report-container');
    const span = container ? container.querySelector('.ps-header-top > span:last-child') : null;
    return span ? span.textContent.trim() : null;
  });
  console.log('3. Date displayed on printed Pull Sheet:', pullSheetDate);
  if (pullSheetDate !== '12/25/2026') {
    throw new Error('Expected pull sheet header date to be 12/25/2026, got: ' + pullSheetDate);
  }

  // 5. Scroll to Project Details and take a screenshot
  await page.evaluate(() => {
    document.getElementById('nav-metadata').click();
  });
  await new Promise(r => setTimeout(r, 500));

  await page.screenshot({ 
    path: 'c:/Users/shanni/.gemini/antigravity/brain/4edc73d8-c6bf-420b-bf82-d2ae6d9a8879/date_picker_screenshot.png',
    fullPage: false 
  });

  console.log('\n>>> DATE PICKER VERIFICATION PASSED SUCCESSFULLY! <<<');
  await browser.close();
})().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
