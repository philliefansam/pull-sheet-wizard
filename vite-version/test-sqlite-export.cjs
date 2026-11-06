const puppeteer = require('c:/Users/shanni/Documents/MTO Wizard/node_modules/puppeteer');
const path = require('path');

(async () => {
  console.log('=== Starting SQLite Database Export Verification Suite ===');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--allow-file-access-from-files']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const filePath = 'file:///' + path.resolve('vite-version/dist/PullSheetWizard.html').replace(/\\/g, '/');

  const consoleLogs = [];
  page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => consoleLogs.push(`[ERROR] ${err.toString()}`));

  await page.goto(filePath, { waitUntil: 'load' });
  console.log('Page loaded successfully.');

  // Wait for SQL.js WASM to be ready
  await page.waitForFunction(() => window.state && window.state.SQL !== null, { timeout: 10000 });
  console.log('SQL.js WASM engine is ready.');

  // 1. Generate Demo Project
  console.log('--- Step 1: Loading Demo Project ---');
  await page.evaluate(() => {
    document.getElementById('btn-generate-demo').click();
  });
  await new Promise(r => setTimeout(r, 600));

  // 2. Export SQLite database in default state
  console.log('--- Step 2: Exporting SQLite Database (Default Demo State) ---');
  const exportResult1 = await page.evaluate(async () => {
    const res = await window.handleExportSqlite();
    
    // Inspect database tables & schemas using SQL.js
    const db = new window.state.SQL.Database(res.binaryArray);

    // Schema inspection
    const matColumns = db.exec("PRAGMA table_info(material_summary);")[0].values.map(col => ({
      cid: col[0],
      name: col[1],
      type: col[2]
    }));

    const metaColumns = db.exec("PRAGMA table_info(project_metadata);")[0].values.map(col => ({
      cid: col[0],
      name: col[1],
      type: col[2]
    }));

    // Data inspection
    const metaRows = db.exec("SELECT * FROM project_metadata;")[0];
    const matRows = db.exec("SELECT * FROM material_summary;")[0];

    return {
      success: res.success,
      rowCount: res.rowCount,
      binaryLength: res.binaryArray ? res.binaryArray.byteLength : 0,
      matColumns,
      metaColumns,
      metaValues: metaRows ? metaRows.values : [],
      matColumnsNames: matRows ? matRows.columns : [],
      matValues: matRows ? matRows.values : []
    };
  });

  console.log(`Export 1 Success: ${exportResult1.success}, Binary Size: ${exportResult1.binaryLength} bytes, Rows: ${exportResult1.rowCount}`);
  
  // Verify material_summary schema columns
  const expectedMatCols = [
    'id', 'material_name', 'machine_type', 'quantity', 'layup_required',
    'faceUp_matl', 'core_substrate', 'faceDown_matl', 'thickness', 'grain_direction',
    'final_length', 'final_width', 'raw_max_x', 'raw_max_y',
    'use_whole_sheets', 'custom_layup', 'file_name'
  ];
  const actualMatColNames = exportResult1.matColumns.map(c => c.name);
  console.log('material_summary columns found:', actualMatColNames.join(', '));

  for (const col of expectedMatCols) {
    if (!actualMatColNames.includes(col)) {
      throw new Error(`MISSING COLUMN in material_summary: ${col}`);
    }
  }
  console.log('PASS: All 17 expected columns in material_summary exist.');

  // Verify project_metadata schema columns
  const expectedMetaCols = ['job_number', 'client', 'project_name', 'date_processed', 'operator_name'];
  const actualMetaColNames = exportResult1.metaColumns.map(c => c.name);
  console.log('project_metadata columns found:', actualMetaColNames.join(', '));

  for (const col of expectedMetaCols) {
    if (!actualMetaColNames.includes(col)) {
      throw new Error(`MISSING COLUMN in project_metadata: ${col}`);
    }
  }
  console.log('PASS: All 5 expected columns in project_metadata exist.');

  // Check rows in project_metadata
  if (exportResult1.metaValues.length === 0) {
    throw new Error('project_metadata has no rows!');
  }
  const jobNum = exportResult1.metaValues[0][0]; // job_number is index 0
  console.log(`Metadata Job Number: "${jobNum}"`);
  if (!jobNum) {
    throw new Error('project_metadata job_number is empty');
  }

  // Check rows in material_summary
  if (exportResult1.matValues.length === 0) {
    throw new Error('material_summary has no rows!');
  }
  console.log(`material_summary contains ${exportResult1.matValues.length} rows.`);

  // 3. Test with use_whole_sheets = 1 and custom_layup populated
  console.log('--- Step 3: Modifying Materials with use_whole_sheets=1 & custom_layup ---');
  const customLayupPayload = {
    blueprint: 'Test Layup Config',
    layers: [
      { type: 'face', name: 'Wilsonart Laminate' },
      { type: 'core', name: 'MDF 3/4' },
      { type: 'back', name: 'Phenolic Backer' }
    ],
    glue: 'PVA'
  };

  const exportResult2 = await page.evaluate(async (customPayload) => {
    // Select the first material key
    const matKeys = Object.keys(window.state.materials);
    const firstKey = matKeys[0];
    const secondKey = matKeys[1] || matKeys[0];

    // Set first material to use whole sheets
    window.state.materials[firstKey].use_whole_sheets = 1;

    // Attach custom layup to the second material's sheet
    const secondMat = window.state.materials[secondKey];
    if (secondMat.sheets && secondMat.sheets.length > 0) {
      secondMat.sheets[0].custom_layup = customPayload;
      secondMat.sheets[0].fileName = 'nested_cabinet_parts.mpr';
    }

    // Trigger preview table update
    window.updateDatabasePreview();

    // Export SQLite
    const res = await window.handleExportSqlite();
    const db = new window.state.SQL.Database(res.binaryArray);

    const queryRes = db.exec(`
      SELECT material_name, use_whole_sheets, custom_layup, file_name 
      FROM material_summary;
    `)[0];

    return {
      columns: queryRes.columns,
      rows: queryRes.values,
      firstKey,
      secondKey
    };
  }, customLayupPayload);

  console.log('Query Results after modifications:');
  let foundWholeSheet = false;
  let foundCustomLayup = false;

  exportResult2.rows.forEach(r => {
    const [matName, wholeSheets, customLayupStr, fileName] = r;
    console.log(`- Material: "${matName}" | whole_sheets: ${wholeSheets} | custom_layup: ${customLayupStr ? 'YES' : 'NULL'} | file_name: "${fileName}"`);
    if (wholeSheets === 1) foundWholeSheet = true;
    if (customLayupStr) {
      foundCustomLayup = true;
      const parsed = JSON.parse(customLayupStr);
      if (parsed.blueprint !== 'Test Layup Config') {
        throw new Error('custom_layup JSON content mismatch: ' + customLayupStr);
      }
    }
  });

  if (!foundWholeSheet) {
    throw new Error('FAILED: use_whole_sheets = 1 was not persisted in SQLite database row!');
  }
  console.log('PASS: use_whole_sheets=1 persisted accurately in SQLite table.');

  if (!foundCustomLayup) {
    throw new Error('FAILED: custom_layup was not persisted in SQLite database row!');
  }
  console.log('PASS: custom_layup JSON payload persisted accurately in SQLite table.');

  // 4. Verify UI Preview Table DOM
  console.log('--- Step 4: Verifying UI Database Preview Table ---');
  const previewDomCheck = await page.evaluate(() => {
    // Switch to database export section & tab
    document.querySelectorAll('.tab-btn').forEach(btn => {
      if (btn.getAttribute('data-tab') === 'tab-material-summary') {
        btn.click();
      }
    });

    const thElements = Array.from(document.querySelectorAll('#tab-material-summary table thead th')).map(th => th.innerText.trim());
    const tbodyRows = Array.from(document.querySelectorAll('#db-summary-rows tr')).map(tr => {
      const cells = Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim());
      return cells;
    });

    const exportBtn = document.getElementById('btn-export-sqlite');

    return {
      headers: thElements,
      rowCount: tbodyRows.length,
      sampleRow: tbodyRows[0],
      btnDisabled: exportBtn ? exportBtn.disabled : false,
      btnText: exportBtn ? exportBtn.innerText.trim() : ''
    };
  });

  console.log('UI Table Headers:', previewDomCheck.headers.join(' | '));
  if (!previewDomCheck.headers.includes('use_whole_sheets') ||
      !previewDomCheck.headers.includes('custom_layup') ||
      !previewDomCheck.headers.includes('file_name')) {
    throw new Error('UI Preview table missing new header columns');
  }
  console.log('PASS: UI table header contains use_whole_sheets, custom_layup, file_name.');
  console.log(`UI Table Rows: ${previewDomCheck.rowCount}`);
  console.log('Sample UI Row:', previewDomCheck.sampleRow.join(' | '));

  // Check button state restored
  if (previewDomCheck.btnDisabled) {
    throw new Error('Export button was left disabled!');
  }
  console.log('PASS: btn-export-sqlite restored to enabled state.');

  // 5. Test Error Handling (e.g., missing Job Number)
  console.log('--- Step 5: Testing Validation Handling (Missing Job Number) ---');
  const validationCheck = await page.evaluate(async () => {
    const originalJobNum = window.state.metadata.jobNumber;
    window.state.metadata.jobNumber = ''; // clear job number
    
    let caught = false;
    try {
      await window.handleExportSqlite();
    } catch (e) {
      caught = true;
    }

    const btn = document.getElementById('btn-export-sqlite');
    const btnDisabled = btn.disabled;
    
    // restore
    window.state.metadata.jobNumber = originalJobNum;

    return { btnDisabled, caught };
  });

  if (validationCheck.btnDisabled) {
    throw new Error('btn-export-sqlite remained disabled after validation failure!');
  }
  console.log('PASS: Missing job number validation handled cleanly; button not disabled.');

  console.log('\n=== ALL SQLITE EXPORT TESTS PASSED SUCCESSFULLY! ===');
  await browser.close();
  process.exit(0);
})().catch(err => {
  console.error('\nFAILED WITH ERROR:', err);
  process.exit(1);
});
