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
  
  console.log('--- TEST 1: Unit testing resolveSheetDimensions direct API ---');
  const unitResults = await page.evaluate(() => {
    if (typeof window.resolveSheetDimensions !== 'function') {
      throw new Error('resolveSheetDimensions is not exposed on window');
    }

    const testMat = {
      name: 'Test Mat',
      raw_max_x: 96.0,
      raw_max_y: 48.0,
      use_whole_sheets: 0
    };

    // Case A: Normal cropped offcut
    // net_length 40 + 2 overage = 42
    const sheetA = {
      net_length: 40.0,
      net_width: 30.0,
      raw_max_x: 96.0,
      raw_max_y: 48.0
    };
    const resA = window.resolveSheetDimensions(sheetA, testMat);

    // Case B: Whole Sheet Mode
    const testMatWhole = Object.assign({}, testMat, { use_whole_sheets: 1 });
    const resB = window.resolveSheetDimensions(sheetA, testMatWhole);

    // Case C: Manual Override
    const sheetC = Object.assign({}, sheetA, {
      is_modified: true,
      manual_final_length: 77.5,
      manual_final_width: 35.25
    });
    const resC = window.resolveSheetDimensions(sheetC, testMat);

    return { resA, resB, resC };
  });

  console.log('Case A (Cropped offcut):', unitResults.resA);
  if (unitResults.resA.finX !== 42 || unitResults.resA.finY !== 32 || unitResults.resA.tagText !== '') {
    throw new Error('Case A failed: unexpected dimensions ' + JSON.stringify(unitResults.resA));
  }

  console.log('Case B (Whole sheet):', unitResults.resB);
  if (unitResults.resB.finX !== 96 || unitResults.resB.finY !== 48 || unitResults.resB.tagText !== '(Whole Sheet)') {
    throw new Error('Case B failed: unexpected whole sheet dimensions ' + JSON.stringify(unitResults.resB));
  }

  console.log('Case C (Manual override):', unitResults.resC);
  if (unitResults.resC.finX !== 77.5 || unitResults.resC.finY !== 35.25 || unitResults.resC.tagText !== '(Modified)') {
    throw new Error('Case C failed: unexpected manual dimensions ' + JSON.stringify(unitResults.resC));
  }

  console.log('--- TEST 2: Integration testing with Demo Files ---');
  await page.evaluate(() => {
    document.getElementById('btn-generate-demo').click();
  });
  await new Promise(r => setTimeout(r, 600));

  // Verify materials rendered with badges
  const integrationResults = await page.evaluate(() => {
    const cards = document.querySelectorAll('.wizard-card');
    const dbRows = document.querySelectorAll('#db-summary-rows tr');
    const directItems = document.querySelectorAll('.ps-direct-item');
    const layupCards = document.querySelectorAll('.ps-layup-card');

    return {
      cardCount: cards.length,
      dbRowCount: dbRows.length,
      directItemCount: directItems.length,
      layupCardCount: layupCards.length,
      firstCardBadgeText: cards[0] ? cards[0].querySelector('.layup-dimensions-badge').innerText : ''
    };
  });
  console.log('Integration UI Counts:', integrationResults);

  if (integrationResults.cardCount === 0 || integrationResults.dbRowCount === 0) {
    throw new Error('Demo project failed to populate cards or DB rows');
  }

  console.log('--- TEST 3: Testing Sheet Edit Prompt & Synchronization ---');
  // Mock window.prompt to return "55.0 x 33.0"
  await page.evaluate(() => {
    window.prompt = () => '55.0 x 33.0';
    const firstEditBtn = document.querySelector('.btn-edit-sheet-size');
    if (firstEditBtn) firstEditBtn.click();
  });
  await new Promise(r => setTimeout(r, 500));

  const afterEdit = await page.evaluate(() => {
    const firstCard = document.querySelector('.wizard-card');
    const badgeText = firstCard ? firstCard.querySelector('.layup-dimensions-badge').innerText : '';
    const resetBtn = firstCard ? firstCard.querySelector('.btn-reset-sheet-size') : null;
    return {
      badgeText,
      hasResetBtn: !!resetBtn
    };
  });
  console.log('After Edit Prompt:', afterEdit);
  if (!afterEdit.badgeText.includes('55.0" x 33.0"') || !afterEdit.badgeText.includes('(Modified)')) {
    throw new Error('Manual edit was not reflected in card dimensions badge: ' + afterEdit.badgeText);
  }
  if (!afterEdit.hasResetBtn) {
    throw new Error('Reset button did not appear after manual edit');
  }

  console.log('--- TEST 4: Testing Reset Button Reversion ---');
  await page.evaluate(() => {
    const resetBtn = document.querySelector('.btn-reset-sheet-size');
    if (resetBtn) resetBtn.click();
  });
  await new Promise(r => setTimeout(r, 500));

  const afterReset = await page.evaluate(() => {
    const firstCard = document.querySelector('.wizard-card');
    const badgeText = firstCard ? firstCard.querySelector('.layup-dimensions-badge').innerText : '';
    const editBtn = firstCard ? firstCard.querySelector('.btn-edit-sheet-size') : null;
    return {
      badgeText,
      hasEditBtn: !!editBtn
    };
  });
  console.log('After Reset:', afterReset);
  if (afterReset.badgeText.includes('(Modified)')) {
    throw new Error('Badge still marked as modified after reset');
  }

  console.log('--- TEST 5: Testing Konva Layup Wizard Modal Integration ---');
  await page.evaluate(() => {
    const layupBtn = document.querySelector('.btn-custom-layup');
    if (layupBtn) layupBtn.click();
  });
  await new Promise(r => setTimeout(r, 500));

  const modalInfo = await page.evaluate(() => {
    const modal = document.getElementById('layup-wizard-modal');
    const subtitle = document.getElementById('layup-modal-subtitle');
    const isHidden = modal.classList.contains('hidden');
    return {
      isHidden,
      subtitle: subtitle ? subtitle.textContent : ''
    };
  });
  console.log('Layup Modal Info:', modalInfo);
  if (modalInfo.isHidden) {
    throw new Error('Layup wizard modal failed to open');
  }
  if (!modalInfo.subtitle.includes('Current Sheet Size:')) {
    throw new Error('Layup wizard subtitle missing sheet size: ' + modalInfo.subtitle);
  }

  // Close modal
  await page.evaluate(() => {
    document.getElementById('btn-close-layup-modal').click();
  });

  await browser.close();
  console.log('\n>>> ALL DIMENSION RESOLVER TESTS PASSED FLAWLESSLY! <<<');
})().catch(err => {
  console.error('\nFAILED WITH ERROR:', err);
  process.exit(1);
});
