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
  
  console.log('Testing Sidebar Navigation & Continuous Scroll...');

  // 1. Verify Sidebar is sticky
  const sidebarStyles = await page.evaluate(() => {
    const sidebar = document.querySelector('.sidebar');
    const style = window.getComputedStyle(sidebar);
    return {
      position: style.position,
      top: style.top,
      height: style.height
    };
  });
  console.log('1. Sidebar CSS:', sidebarStyles);
  if (sidebarStyles.position !== 'sticky') {
    throw new Error('Sidebar should have position: sticky');
  }

  // 2. Click "Generate Demo Files" so all sections are populated and visible
  await page.evaluate(() => {
    document.getElementById('btn-generate-demo').click();
  });
  await new Promise(r => setTimeout(r, 600));

  const visibilityAfterDemo = await page.evaluate(() => {
    return {
      scan: !document.getElementById('section-scan').classList.contains('hidden'),
      meta: !document.getElementById('section-metadata').classList.contains('hidden'),
      wizard: !document.getElementById('section-wizard').classList.contains('hidden'),
      export: !document.getElementById('section-export').classList.contains('hidden'),
      settings: !document.getElementById('section-settings').classList.contains('hidden'),
    };
  });
  console.log('2. Visibility after demo loaded:', visibilityAfterDemo);

  // 3. Click "SQLite Export" tab (#nav-database)
  await page.evaluate(() => {
    document.getElementById('nav-database').click();
  });
  await new Promise(r => setTimeout(r, 600));

  const afterDatabaseClick = await page.evaluate(() => {
    const exportSec = document.getElementById('section-export');
    const rect = exportSec.getBoundingClientRect();
    return {
      navDatabaseActive: document.getElementById('nav-database').classList.contains('active'),
      // Crucial requirement: other modules must NOT disappear!
      scanStillVisible: !document.getElementById('section-scan').classList.contains('hidden'),
      metaStillVisible: !document.getElementById('section-metadata').classList.contains('hidden'),
      wizardStillVisible: !document.getElementById('section-wizard').classList.contains('hidden'),
      exportVisible: !exportSec.classList.contains('hidden'),
      settingsHidden: document.getElementById('section-settings').classList.contains('hidden'),
      scrollY: window.scrollY,
      exportSectionTop: rect.top
    };
  });
  console.log('3. After clicking SQLite Export tab:', afterDatabaseClick);
  if (!afterDatabaseClick.scanStillVisible || !afterDatabaseClick.metaStillVisible || !afterDatabaseClick.wizardStillVisible) {
    throw new Error('Hostile behavior detected: other modules were hidden when clicking SQLite Export!');
  }
  if (!afterDatabaseClick.navDatabaseActive) {
    throw new Error('nav-database should be active');
  }

  // 4. Click "Lay-Up Wizard" tab (#nav-wizard)
  await page.evaluate(() => {
    document.getElementById('nav-wizard').click();
  });
  await new Promise(r => setTimeout(r, 600));

  const afterWizardClick = await page.evaluate(() => {
    const wizardSec = document.getElementById('section-wizard');
    const rect = wizardSec.getBoundingClientRect();
    return {
      navWizardActive: document.getElementById('nav-wizard').classList.contains('active'),
      scanStillVisible: !document.getElementById('section-scan').classList.contains('hidden'),
      metaStillVisible: !document.getElementById('section-metadata').classList.contains('hidden'),
      wizardVisible: !wizardSec.classList.contains('hidden'),
      exportStillVisible: !document.getElementById('section-export').classList.contains('hidden'),
      scrollY: window.scrollY,
      wizardTop: rect.top
    };
  });
  console.log('4. After clicking Lay-Up Wizard tab:', afterWizardClick);

  // 5. Click "Settings" tab (#nav-settings) - The ONLY exception: should be on its own!
  await page.evaluate(() => {
    document.getElementById('nav-settings').click();
  });
  await new Promise(r => setTimeout(r, 400));

  const afterSettingsClick = await page.evaluate(() => {
    return {
      navSettingsActive: document.getElementById('nav-settings').classList.contains('active'),
      settingsVisible: !document.getElementById('section-settings').classList.contains('hidden'),
      scanHidden: document.getElementById('section-scan').classList.contains('hidden'),
      metaHidden: document.getElementById('section-metadata').classList.contains('hidden'),
      wizardHidden: document.getElementById('section-wizard').classList.contains('hidden'),
      exportHidden: document.getElementById('section-export').classList.contains('hidden')
    };
  });
  console.log('5. Settings tab (isolated view exception):', afterSettingsClick);
  if (!afterSettingsClick.settingsVisible || !afterSettingsClick.scanHidden || !afterSettingsClick.wizardHidden) {
    throw new Error('Settings section should be displayed on its own!');
  }

  // 6. Return from Settings to Project View
  await page.evaluate(() => {
    document.getElementById('btn-settings-back').click();
  });
  await new Promise(r => setTimeout(r, 500));

  const afterReturnFromSettings = await page.evaluate(() => {
    return {
      navDashboardActive: document.getElementById('nav-dashboard').classList.contains('active'),
      settingsHidden: document.getElementById('section-settings').classList.contains('hidden'),
      scanVisible: !document.getElementById('section-scan').classList.contains('hidden'),
      metaVisible: !document.getElementById('section-metadata').classList.contains('hidden'),
      wizardVisible: !document.getElementById('section-wizard').classList.contains('hidden'),
      exportVisible: !document.getElementById('section-export').classList.contains('hidden'),
      scrollY: window.scrollY
    };
  });
  console.log('6. After returning from Settings:', afterReturnFromSettings);
  if (!afterReturnFromSettings.scanVisible || !afterReturnFromSettings.wizardVisible || !afterReturnFromSettings.exportVisible) {
    throw new Error('Main modules were not restored after leaving Settings!');
  }

  // 7. Test scroll tracking (smooth natural scrolling updates active nav item)
  await new Promise(r => setTimeout(r, 600)); // wait for programmatic scroll cooldown
  await page.evaluate(() => {
    const wizardSec = document.getElementById('section-wizard');
    window.scrollTo({ top: wizardSec.offsetTop + 10, behavior: 'instant' });
  });
  await new Promise(r => setTimeout(r, 300));

  const scrollActiveNav = await page.evaluate(() => {
    return {
      activeNavId: document.querySelector('.nav-item.active') ? document.querySelector('.nav-item.active').id : null
    };
  });
  console.log('7. Active nav on scroll into wizard:', scrollActiveNav);
  if (scrollActiveNav.activeNavId !== 'nav-wizard') {
    throw new Error('Scrolling into wizard should activate nav-wizard, but was ' + scrollActiveNav.activeNavId);
  }

  console.log('\n>>> ALL SIDEBAR & SCROLL NAVIGATION TESTS PASSED! <<<');
  await browser.close();
})().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
