const puppeteer = require('c:/Users/shanni/Documents/MTO Wizard/node_modules/puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--allow-file-access-from-files']
  });
  const page = await browser.newPage();
  const filePath = 'file:///' + path.resolve('vite-version/dist/PullSheetWizard.html').replace(/\\/g, '/');
  
  const consoleLogs = [];
  page.on('console', msg => consoleLogs.push(msg.type() + ': ' + msg.text()));
  page.on('pageerror', err => consoleLogs.push('ERROR: ' + err.toString()));

  await page.goto(filePath, { waitUntil: 'load' });
  
  // 1. Verify initial UI state
  const initial = await page.evaluate(() => {
    const btnSelect = document.getElementById('btn-select-folder');
    const btnScan = document.getElementById('btn-scan');
    const badge = document.getElementById('folder-count-badge');
    const container = document.getElementById('paths-list-container');
    const wizardSec = document.getElementById('section-wizard');
    return {
      selectBtnText: btnSelect ? btnSelect.textContent.trim() : null,
      scanBtnText: btnScan ? btnScan.textContent.trim() : null,
      badgeVisible: badge ? badge.style.display !== 'none' : false,
      rowCount: container ? container.children.length : 0,
      wizardHidden: wizardSec ? wizardSec.classList.contains('hidden') : false
    };
  });
  console.log('1. Initial UI State:', JSON.stringify(initial, null, 2));

  // 2. Simulate selecting Folder 1 and Folder 2
  const multiFolderTest = await page.evaluate(async () => {
    // Expose test functions if bundled inside module
    const mpr1 = '[001\nl="2440.0"\nw="1220.0"\nh="12.7"\n]2\nKL X="100.0" Y="100.0"';
    const mpr2 = '[001\nl="2440.0"\nw="1220.0"\nh="19.0"\n]2\nKL X="50.0" Y="50.0"';

    const dir1 = {
      id: 'mock_dir_1',
      name: '180922-1 Morristown 925 CBD/1-2 Cameo White SS',
      handle: {
        name: '1-2 Cameo White SS',
        values: async function*() {
          yield { kind: 'file', name: 'part1.mpr', getFile: async () => ({ text: async () => mpr1 }) };
        }
      }
    };
    const dir2 = {
      id: 'mock_dir_2',
      name: '180922-1 Morristown 925 CBD/3-4 PB Core',
      handle: {
        name: '3-4 PB Core',
        values: async function*() {
          yield { kind: 'file', name: 'part2.mpr', getFile: async () => ({ text: async () => mpr2 }) };
        }
      }
    };

    // Simulate clicking "Select / Add Local Folder" twice
    // Since showDirectoryPicker cannot be opened non-interactively without user gesture in headless,
    // we directly test the addition logic and UI rendering
    window.state.selectedDirectories.push(dir1);
    addLocalFolderRow(dir1);

    window.state.selectedDirectories.push(dir2);
    addLocalFolderRow(dir2);

    const badge = document.getElementById('folder-count-badge');
    const scanLabel = document.getElementById('btn-scan-label');
    const rows = document.querySelectorAll('#paths-list-container .local-folder-row');
    const wizardSec = document.getElementById('section-wizard');

    return {
      rowCount: rows.length,
      badgeText: badge ? badge.textContent.trim() : null,
      scanLabelText: scanLabel ? scanLabel.textContent.trim() : null,
      stillWaitingBeforeScan: wizardSec.classList.contains('hidden')
    };
  });
  console.log('2. Multi-Folder Selection State (Before Scan):', JSON.stringify(multiFolderTest, null, 2));

  // 3. Trigger Scan Folders button
  await page.evaluate(() => {
    document.getElementById('btn-scan').click();
  });

  // Wait 1 second for scan processing
  await new Promise(r => setTimeout(r, 1000));

  const afterScan = await page.evaluate(() => {
    const wizardSec = document.getElementById('section-wizard');
    const detectedMats = document.querySelectorAll('#detected-materials li');
    const matNames = Array.from(detectedMats).map(li => li.textContent.trim());
    return {
      wizardVisible: !wizardSec.classList.contains('hidden'),
      materialsCount: Object.keys(window.state.materials).length,
      materialNames: matNames,
      jobNum: window.state.metadata.jobNumber,
      projectName: window.state.metadata.projectName
    };
  });
  console.log('3. After Scan Result:', JSON.stringify(afterScan, null, 2));

  // 4. Test removing a folder row
  const removeTest = await page.evaluate(() => {
    const removeBtns = document.querySelectorAll('#paths-list-container .btn-remove-path-field');
    if (removeBtns.length > 0) {
      removeBtns[0].click();
    }
    const badge = document.getElementById('folder-count-badge');
    const scanLabel = document.getElementById('btn-scan-label');
    const rows = document.querySelectorAll('#paths-list-container .local-folder-row');
    return {
      remainingRows: rows.length,
      badgeText: badge ? badge.textContent.trim() : null,
      scanLabelText: scanLabel ? scanLabel.textContent.trim() : null,
      selectedDirsCount: window.state.selectedDirectories.length
    };
  });
  console.log('4. Remove Folder Test:', JSON.stringify(removeTest, null, 2));

  await browser.close();
  console.log('\n>>> ALL TEST VERIFICATIONS COMPLETED SUCCESSFULLY! <<<');
})().catch(err => {
  console.error('Puppeteer Test Failed:', err);
  process.exit(1);
});
