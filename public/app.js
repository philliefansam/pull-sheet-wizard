const state = {
  pastedPath: '',
  files: [],
  materials: {}, // Keyed by material name (subfolder)
  metadata: {
    jobNumber: '',
    client: '',
    projectName: '',
    operatorName: '',
    dateProcessed: ''
  },
  settings: {
    overcutOverage: 2.0,
    minOffcutDim: 6.0
  },
  SQL: null,
  activeTab: 'tab-project-metadata',
  directoryHandle: null // Native file system handle
};

const SHOP_CLEARANCE = 2.0;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  initApp();
});

// App Entry Point
async function initApp() {
  // Set default date
  const today = new Date();
  state.metadata.dateProcessed = today.toISOString().split('T')[0];
  document.getElementById('meta-date-processed').value = state.metadata.dateProcessed;
  
  // Set up event listeners
  setupEventListeners();

  // Restore session cache if present
  restoreSessionCache();
  
  // Check backend server connection and start live 3s heartbeat polling
  await checkServerConnection(true);
  setInterval(() => {
    checkServerConnection(true);
  }, 3000);
  
  // Load SQLite WASM
  await loadSqlWasm();
}

let isServerConnected = false;

// Check if backend server is responsive with cache-busting and live heartbeat
async function checkServerConnection(silent = false) {
  const statusEl = document.getElementById('connection-status');
  if (!statusEl) return;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    const res = await fetch('/api/status?_t=' + Date.now(), { 
      cache: 'no-store',
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      if (!isServerConnected || statusEl.classList.contains('offline')) {
        isServerConnected = true;
        statusEl.className = 'status-indicator online';
        statusEl.querySelector('.indicator-text').textContent = 'Server Connected';
        if (!silent) {
          showToast('Server Connected', 'Backend server connection established.', 'success');
        }
      }
      
      const data = await res.json();
      if (data.username && !state.metadata.operatorName) {
        state.metadata.operatorName = data.username;
        const opInput = document.getElementById('meta-operator-name');
        if (opInput) opInput.value = data.username;
        updateDatabasePreview();
      }
    } else {
      throw new Error('Non-200 response');
    }
  } catch (e) {
    if (isServerConnected || statusEl.classList.contains('online')) {
      isServerConnected = false;
      statusEl.className = 'status-indicator offline';
      statusEl.querySelector('.indicator-text').textContent = 'Server Offline';
      if (!silent) {
        showToast('Server Disconnected', 'Backend server is offline or unreachable.', 'error');
      }
    }
  }
}

// Load SQL.js WebAssembly
async function loadSqlWasm() {
  try {
    if (typeof initSqlJs !== 'undefined') {
      state.SQL = await initSqlJs({
        locateFile: file => `/public/${file}`
      });
      console.log('SQL.js initialized successfully.');
    } else {
      showToast('WASM Error', 'SQL.js library failed to load.', 'error');
    }
  } catch (e) {
    console.error('Failed to init SQL.js:', e);
    showToast('WASM Error', 'Could not initialize SQLite WebAssembly compiler.', 'error');
  }
}

// Setup Event Listeners
function setupEventListeners() {
  // Sidebar navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      
      const targetSection = item.id.replace('nav-', 'section-');
      document.querySelectorAll('main > .content-body > section').forEach(sec => {
        if (sec.id === targetSection || sec.id === 'section-scan') {
          sec.classList.remove('hidden');
        } else {
          sec.classList.add('hidden');
        }
      });
      // Show metadata if wizard, database, or pull sheet is shown
      if (targetSection === 'section-wizard' || targetSection === 'section-export' || targetSection === 'section-pull-sheet') {
        document.getElementById('section-metadata').classList.remove('hidden');
      }
      if (targetSection === 'section-pull-sheet') {
        renderPullSheetReport();
      }
      saveSessionCache();
    });
  });

  // Buttons
  document.getElementById('btn-scan').addEventListener('click', handleScan);
  document.getElementById('btn-select-folder').addEventListener('click', handleSelectFolder);
  document.getElementById('btn-generate-demo').addEventListener('click', handleGenerateDemo);
  document.getElementById('btn-export-sqlite').addEventListener('click', handleExportSqlite);
  
  const btnReset = document.getElementById('btn-reset-project');
  if (btnReset) {
    btnReset.addEventListener('click', handleResetProject);
  }
  
  const btnPrint = document.getElementById('btn-print-pull-sheet');
  if (btnPrint) {
    btnPrint.addEventListener('click', handlePrintPullSheet);
  }

  const btnGeneratePullSheet = document.getElementById('btn-generate-pull-sheet');
  if (btnGeneratePullSheet) {
    btnGeneratePullSheet.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      const navPullSheet = document.getElementById('nav-pull-sheet');
      if (navPullSheet) navPullSheet.classList.add('active');
      
      document.querySelectorAll('main > .content-body > section').forEach(sec => {
        if (sec.id === 'section-pull-sheet' || sec.id === 'section-scan' || sec.id === 'section-metadata') {
          sec.classList.remove('hidden');
        } else {
          sec.classList.add('hidden');
        }
      });
      renderPullSheetReport();
      saveSessionCache();
    });
  }
  
  // Plus sign path button
  document.getElementById('btn-add-path-field').addEventListener('click', () => {
    const container = document.getElementById('paths-list-container');
    const row = document.createElement('div');
    row.className = 'path-input-row';
    row.style.display = 'flex';
    row.style.gap = '8px';
    row.style.alignItems = 'center';
    row.innerHTML = `
      <input type="text" class="pasted-path-field" placeholder="e.g. Z:\\Homag CNC\\Empire Office\\180577-1 Criteo Corp - Reception Desk" style="flex: 1;">
      <button class="btn btn-secondary btn-remove-path-field" style="padding: 10px 14px; font-weight: bold; height: auto;" title="Remove this path">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    `;
    container.appendChild(row);
    
    // Bind delete click
    row.querySelector('.btn-remove-path-field').addEventListener('click', () => {
      row.remove();
      saveSessionCache();
    });
    saveSessionCache();
  });
  
  // Settings inputs
  document.getElementById('settings-overcut').addEventListener('input', e => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val) && val >= 0) {
      state.settings.overcutOverage = val;
      if (state.files.length > 0) {
        processScannedFiles();
        buildWizard();
        updateDatabasePreview();
      }
      saveSessionCache();
    }
  });
  document.getElementById('settings-offcut').addEventListener('input', e => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val) && val >= 0) {
      state.settings.minOffcutDim = val;
      if (state.files.length > 0) {
        processScannedFiles();
        buildWizard();
        updateDatabasePreview();
      }
      saveSessionCache();
    }
  });
  
  // Metadata inputs
  document.getElementById('meta-job-number').addEventListener('input', e => {
    state.metadata.jobNumber = e.target.value;
    updateDatabasePreview();
    saveSessionCache();
  });
  document.getElementById('meta-client').addEventListener('input', e => {
    state.metadata.client = e.target.value;
    updateDatabasePreview();
    saveSessionCache();
  });
  document.getElementById('meta-project-name').addEventListener('input', e => {
    state.metadata.projectName = e.target.value;
    updateDatabasePreview();
    saveSessionCache();
  });
  document.getElementById('meta-operator-name').addEventListener('input', e => {
    state.metadata.operatorName = e.target.value;
    updateDatabasePreview();
    saveSessionCache();
  });
  
  // Database Preview Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const tabId = btn.getAttribute('data-tab');
      document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
      document.getElementById(tabId).classList.remove('hidden');
    });
  });
}

// Reset all project fields, state, and session cache to start a new project
function handleResetProject() {
  if (confirm('Are you sure you want to reset all fields and clear cached project data to start a new project?')) {
    // 1. Clear session cache from localStorage
    localStorage.removeItem('pull_sheet_wizard_session');

    // 2. Reset global state object
    const savedOperator = state.metadata ? state.metadata.operatorName : '';
    state.files = [];
    state.scannedFiles = [];
    state.materials = {};
    state.pastedPath = '';
    state.metadata = {
      jobNumber: '',
      client: '',
      projectName: '',
      operatorName: savedOperator || '',
      dateProcessed: new Date().toLocaleDateString('en-US')
    };

    // 3. Reset target folder path inputs
    const pathsContainer = document.getElementById('paths-list-container');
    if (pathsContainer) {
      pathsContainer.innerHTML = `
        <div class="path-input-row" style="display: flex; gap: 8px; align-items: center;">
          <input type="text" class="pasted-path-field" placeholder="e.g. Z:\\Homag CNC\\Empire Office\\180577-1 Criteo Corp - Reception Desk" style="flex: 1;" value="">
          <button id="btn-add-path-field" class="btn btn-secondary" style="padding: 10px 14px; font-weight: bold; height: auto;" title="Add another folder path">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
          </button>
        </div>
      `;
      const addBtn = document.getElementById('btn-add-path-field');
      if (addBtn) {
        addBtn.addEventListener('click', () => {
          const row = document.createElement('div');
          row.className = 'path-input-row';
          row.style.display = 'flex';
          row.style.gap = '8px';
          row.style.alignItems = 'center';
          row.innerHTML = `
            <input type="text" class="pasted-path-field" placeholder="e.g. Z:\\Homag CNC\\Empire Office\\180577-1 Criteo Corp - Reception Desk" style="flex: 1;">
            <button class="btn btn-secondary btn-remove-path-field" style="padding: 10px 14px; font-weight: bold; height: auto;" title="Remove this path">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          `;
          pathsContainer.appendChild(row);
          row.querySelector('.btn-remove-path-field').addEventListener('click', () => {
            row.remove();
            saveSessionCache();
          });
          saveSessionCache();
        });
      }
    }

    // 4. Reset Project Details metadata input fields
    const metaJob = document.getElementById('meta-job-number');
    if (metaJob) metaJob.value = '';
    const metaClient = document.getElementById('meta-client');
    if (metaClient) metaClient.value = '';
    const metaPrj = document.getElementById('meta-project-name');
    if (metaPrj) metaPrj.value = '';
    const metaOp = document.getElementById('meta-operator-name');
    if (metaOp) metaOp.value = savedOperator || '';
    const metaDate = document.getElementById('meta-date-processed');
    if (metaDate) metaDate.value = state.metadata.dateProcessed;

    // 5. Clear scan results & file tables
    const detectedMaterials = document.getElementById('detected-materials');
    if (detectedMaterials) detectedMaterials.innerHTML = '';
    const discoveredFilesBody = document.getElementById('discovered-files-body');
    if (discoveredFilesBody) discoveredFilesBody.innerHTML = '';
    const scanResults = document.getElementById('scan-results');
    if (scanResults) scanResults.classList.add('hidden');

    // 6. Clear Lay-Up Wizard & Pull Sheet Report
    const wizardSteps = document.getElementById('wizard-steps');
    if (wizardSteps) wizardSteps.innerHTML = '';
    const reportContainer = document.getElementById('pull-sheet-report-container');
    if (reportContainer) reportContainer.innerHTML = '';

    // 7. Clear SQLite Preview Tables
    const dbMetadataRows = document.getElementById('db-metadata-rows');
    if (dbMetadataRows) dbMetadataRows.innerHTML = '';
    const dbSummaryRows = document.getElementById('db-summary-rows');
    if (dbSummaryRows) dbSummaryRows.innerHTML = '';

    // 8. Reset active navigation tab and section visibility
    document.querySelectorAll('main > .content-body > section').forEach(sec => {
      if (sec.id === 'section-scan') {
        sec.classList.remove('hidden');
      } else {
        sec.classList.add('hidden');
      }
    });

    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    const navDashboard = document.getElementById('nav-dashboard') || document.getElementById('nav-scan');
    if (navDashboard) navDashboard.classList.add('active');

    showToast('Project Reset', 'All cached data, paths, and material fields have been cleared.', 'info');
  }
}

// Generate Demo Files
async function handleGenerateDemo() {
  const btn = document.getElementById('btn-generate-demo');
  btn.disabled = true;
  btn.textContent = 'Generating...';
  
  try {
    const res = await fetch('/api/generate-demo', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      document.querySelector('.pasted-path-field').value = data.demoPath;
      showToast('Demo Generated', `Demo project created at: ${data.demoPath}`, 'success');
      // Automatically scan after generating
      handleScan();
    } else {
      throw new Error();
    }
  } catch (e) {
    showToast('Error', 'Failed to generate demo project files.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
      Generate Demo Files
    `;
  }
}

// Handle Directory Scanning
async function handleScan() {
  const fields = document.querySelectorAll('.pasted-path-field');
  // Support both multi-fields and comma/semicolon delimited entries in any field
  const paths = [];
  fields.forEach(el => {
    const val = el.value.trim();
    if (val) {
      val.split(/[;,]/).map(p => p.trim()).filter(Boolean).forEach(p => {
        if (!paths.includes(p)) paths.push(p);
      });
    }
  });
  
  if (paths.length === 0) {
    showToast('Input Required', 'Please paste at least one target folder path.', 'warning');
    return;
  }
  
  state.pastedPath = paths[0]; // Prefill metadata uses the first path
  const btn = document.getElementById('btn-scan');
  const progress = document.getElementById('scan-progress');
  const progressFill = progress.querySelector('.progress-bar-fill');
  const progressText = progress.querySelector('.progress-text');
  
  btn.disabled = true;
  progress.classList.remove('hidden');
  progressFill.style.width = '20%';
  progressText.textContent = 'Scanning target directories...';
  
  try {
    state.files = [];
    
    // Fetch folders in parallel
    const scanPromises = paths.map(async (p) => {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: p })
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(`Scanning path "${p}" failed: ${err.message || 'Error'}`);
      }
      return res.json();
    });
    
    progressFill.style.width = '50%';
    progressText.textContent = 'Processing files...';
    
    const results = await Promise.all(scanPromises);
    
    // Combine all files from all scanned paths
    results.forEach((data, index) => {
      if (data.files && Array.isArray(data.files)) {
        const currentScannedPath = paths[index] || state.pastedPath;
        data.files.forEach(f => {
          if (!f.scannedPath) f.scannedPath = currentScannedPath;
          // Prevent duplicates by unique key combining scannedPath and relativePath
          const uniqueKey = `${f.scannedPath}/${f.relativePath}`;
          if (!state.files.some(existing => `${existing.scannedPath || ''}/${existing.relativePath}` === uniqueKey)) {
            state.files.push(f);
          }
        });
      }
      if (data.username) {
        state.metadata.operatorName = data.username;
        document.getElementById('meta-operator-name').value = data.username;
      }
    });
    
    progressFill.style.width = '75%';
    progressText.textContent = 'Grouping materials by machine and layup types...';
    
    // Group files by material subfolder
    processScannedFiles();
    
    progressFill.style.width = '100%';
    progressText.textContent = 'Scan complete!';
    
    setTimeout(() => {
      progress.classList.add('hidden');
      btn.disabled = false;
      displayScanResults();
      buildWizard();
      updateDatabasePreview();
      
      // Auto prefill metadata from folder name if empty
      prefillMetadata();
      
      // Reveal sections
      document.getElementById('section-metadata').classList.remove('hidden');
      document.getElementById('section-wizard').classList.remove('hidden');
      document.getElementById('section-export').classList.remove('hidden');
      
      showToast('Scan Successful', `Loaded ${Object.keys(state.materials).length} materials from target directories.`, 'success');
    }, 500);
    
  } catch (e) {
    console.error(e);
    progress.classList.add('hidden');
    btn.disabled = false;
    showToast('Scan Failed', e.message || 'Could not complete directory scan.', 'error');
  }
}

// Handle Native Folder Selection (File System Access API)
async function handleSelectFolder() {
  if (typeof window.showDirectoryPicker === 'undefined') {
    showToast('Not Supported', 'Your browser does not support native folder selection. Please use Chrome or Edge.', 'warning');
    return;
  }
  
  try {
    const dirHandle = await window.showDirectoryPicker({
      mode: 'readwrite'
    });
    
    state.directoryHandle = dirHandle;
    state.pastedPath = dirHandle.name;
    document.querySelector('.pasted-path-field').value = `Local: ${dirHandle.name}`;
    
    const progress = document.getElementById('scan-progress');
    const progressFill = progress.querySelector('.progress-bar-fill');
    const progressText = progress.querySelector('.progress-text');
    const btn = document.getElementById('btn-select-folder');
    
    btn.disabled = true;
    progress.classList.remove('hidden');
    progressFill.style.width = '30%';
    progressText.textContent = 'Reading local files recursively...';
    
    const fileList = await readDirectoryRecursive(dirHandle);
    
    progressFill.style.width = '70%';
    progressText.textContent = 'Parsing file payloads...';
    
    state.files = fileList;
    processScannedFiles();
    
    progressFill.style.width = '100%';
    progressText.textContent = 'Scan complete!';
    
    setTimeout(() => {
      progress.classList.add('hidden');
      btn.disabled = false;
      displayScanResults();
      buildWizard();
      updateDatabasePreview();
      
      // Prefill metadata
      prefillMetadata();
      
      document.getElementById('section-metadata').classList.remove('hidden');
      document.getElementById('section-wizard').classList.remove('hidden');
      document.getElementById('section-export').classList.remove('hidden');
      
      showToast('Scan Successful', `Loaded ${Object.keys(state.materials).length} materials from directory picker.`, 'success');
    }, 500);
    
  } catch (e) {
    console.error(e);
    const progress = document.getElementById('scan-progress');
    if (progress) progress.classList.add('hidden');
    document.getElementById('btn-select-folder').disabled = false;
    if (e.name !== 'AbortError') {
      showToast('Scan Failed', 'Could not read directory files.', 'error');
    }
  }
}


// Recursive directory reader helper for File System Access API
async function readDirectoryRecursive(dirHandle, pathAccumulator = '') {
  let fileList = [];
  for await (const entry of dirHandle.values()) {
    const relativePath = pathAccumulator ? `${pathAccumulator}/${entry.name}` : entry.name;
    if (entry.kind === 'file') {
      const nameLower = entry.name.toLowerCase();
      const ext = nameLower.split('.').pop();
      if (['mpr', 'hop', 'cpout', 'cpl', 'txt', 'pull'].includes(ext) || nameLower.includes('cpout')) {
        try {
          const file = await entry.getFile();
          const content = await file.text();
          fileList.push({
            name: entry.name,
            relativePath: relativePath,
            content: content
          });
        } catch (err) {
          console.warn('Skipping file due to read error:', relativePath, err);
        }
      }
    } else if (entry.kind === 'directory') {
      const subFiles = await readDirectoryRecursive(entry, relativePath);
      fileList = fileList.concat(subFiles);
    }
  }
  return fileList;
}

// Prefill Metadata
function prefillMetadata() {
  const parts = state.pastedPath.split(/[\\/]/);
  const folderName = parts[parts.length - 1] || parts[parts.length - 2] || '';
  
  // Try to match something like "180577-1 Criteo Corp - Reception Desk"
  const match = folderName.match(/^(\d+-\d+)\s+(.+)$/);
  if (match) {
    if (!state.metadata.jobNumber) {
      state.metadata.jobNumber = match[1];
      document.getElementById('meta-job-number').value = match[1];
    }
    
    const rest = match[2];
    if (rest.includes(' - ')) {
      const restParts = rest.split(' - ');
      const clientName = restParts[0].trim();
      const prjName = restParts.slice(1).join(' - ').trim();
      
      if (!state.metadata.client) {
        state.metadata.client = clientName;
        document.getElementById('meta-client').value = clientName;
      }
      if (!state.metadata.projectName) {
        state.metadata.projectName = prjName;
        document.getElementById('meta-project-name').value = prjName;
      }
    } else {
      if (!state.metadata.projectName) {
        state.metadata.projectName = rest;
        document.getElementById('meta-project-name').value = rest;
      }
    }
  } else if (!state.metadata.projectName) {
    state.metadata.projectName = folderName;
    document.getElementById('meta-project-name').value = folderName;
  }
}

// Helper to parse thickness in inches from material folder name (e.g. "1 1-8" -> 1.125, "3-4" -> 0.75, "15-16" -> 0.9375)
function parseThicknessFromName(name) {
  if (!name) return 0.75;
  const cleanName = name.trim();
  
  const matchWholeFrac = cleanName.match(/^(\d+)[\s-]+(\d+)[-/](\d+)(?![a-zA-Z])/);
  if (matchWholeFrac) {
    const whole = parseFloat(matchWholeFrac[1]);
    const num = parseFloat(matchWholeFrac[2]);
    const den = parseFloat(matchWholeFrac[3]);
    if (den !== 0) return parseFloat((whole + (num / den)).toFixed(4));
  }
  
  const matchFrac = cleanName.match(/^(\d+)[-/](\d+)(?![a-zA-Z])/);
  if (matchFrac) {
    const num = parseFloat(matchFrac[1]);
    const den = parseFloat(matchFrac[2]);
    if (den !== 0) return parseFloat((num / den).toFixed(4));
  }
  
  const matchDec = cleanName.match(/^(\d+\.\d+)/);
  if (matchDec) {
    return parseFloat(matchDec[1]);
  }
  
  return 0.75;
}

// Helper to extract clean material subfolder name from relative path
function extractMaterialName(relativePath, scannedPath, fileContent, fileName) {
  if (fileContent && (fileName || '').toLowerCase().includes('cpout')) {
    const matchInv2 = fileContent.match(/INV2\s*,\s*([^,\r\n]+)/i);
    if (matchInv2 && matchInv2[1].trim()) {
      const matStr = matchInv2[1].replace(/\(.*?\)/, '').trim();
      if (matStr) return matStr;
    }
  }

  if (!relativePath) return 'Unclassified';
  const parts = relativePath.split('/');
  // Filter out file name (last element) and intermediate subfolders like "Run59" or "Run62"
  const folderParts = parts.slice(0, -1).filter(p => !/^Run\d+$/i.test(p));
  if (folderParts.length === 0) {
    const targetP = scannedPath || state.pastedPath || '';
    const rootParts = targetP.split(/[\\/]/).filter(Boolean);
    const rootName = rootParts[rootParts.length - 1] || 'Unclassified';
    return rootName;
  }
  
  return folderParts[folderParts.length - 1];
}

// Helper to detect target machine of a file
function detectFileMachine(file) {
  const nameLower = file.name ? file.name.toLowerCase() : '';
  const ext = nameLower.split('.').pop();
  
  // Explicit file extension rules MUST NOT be overridden by folder keywords
  if (ext === 'mpr') return 'Homag';
  if (ext === 'hop') return 'Holzher CNC';
  if (ext === 'cpout' || ext === 'cpl' || nameLower.includes('cpout')) return 'Holzher Beam Saw';

  const relPathLower = (file.relativePath || '').toLowerCase();
  const scannedPathLower = (file.scannedPath || '').toLowerCase();
  const fullPathLower = (relPathLower + ' ' + scannedPathLower).toLowerCase();
  
  if (fullPathLower.includes('beam saw') || fullPathLower.includes('beamsaw')) {
    return 'Holzher Beam Saw';
  }
  if (fullPathLower.includes('holzher') || fullPathLower.includes('dynestic')) {
    return 'Holzher CNC';
  }
  if (fullPathLower.includes('homag')) {
    return 'Homag';
  }
  
  if (ext === 'txt' || ext === 'pull') {
    const upperContent = (file.content || '').toUpperCase();
    if (upperContent.includes('THEN BEAM SAW') || upperContent.includes('BEAM SAW')) {
      return 'Holzher Beam Saw';
    }
    if (upperContent.includes('THEN HOLZHER') || upperContent.includes('HOLZHER CNC') || upperContent.includes('HOLZHER')) {
      return 'Holzher CNC';
    }
  }
  return 'Homag';
}

// Group and parse files by material subfolder
function processScannedFiles() {
  const previousMetadata = {};
  if (state.materials) {
    Object.keys(state.materials).forEach(key => {
      const m = state.materials[key];
      previousMetadata[key] = {
        layup_required: m.layup_required,
        face_material: m.face_material,
        core_substrate: m.core_substrate,
        backer_material: m.backer_material,
        machine_type: m.machine_type,
        thickness: m.thickness,
        grain_direction: m.grain_direction,
        use_whole_sheets: m.use_whole_sheets
      };
    });
  }

  state.materials = {};
  
  state.files.forEach(file => {
    const materialName = extractMaterialName(file.relativePath, file.scannedPath, file.content, file.name);
    const machineType = detectFileMachine(file);
    
    // Create unique key based on material and machine to avoid grouping router and beam saw jobs together
    const key = `${materialName} (${machineType})`;
    
    if (!state.materials[key]) {
      const prev = previousMetadata[key];
      state.materials[key] = {
        key: key,
        name: materialName,
        files: [],
        sheets: [], // Store individual sheet dimensions
        raw_max_x: 0,
        raw_max_y: 0,
        final_length: 0,
        final_width: 0,
        machine_type: machineType,
        layup_required: prev ? prev.layup_required : 0, // 0 = False, 1 = True
        face_material: prev ? prev.face_material : '',
        core_substrate: prev ? prev.core_substrate : '',
        backer_material: prev ? prev.backer_material : '',
        thickness: prev ? prev.thickness : parseThicknessFromName(materialName),
        grain_direction: prev ? prev.grain_direction : 'Horizontal',
        use_whole_sheets: prev ? (prev.use_whole_sheets || 0) : 0,
        pullSheetData: null,
        toolpathData: null
      };
    }
    
    const mat = state.materials[key];
    mat.files.push(file);
    
    const fileName = file.name || '';
    const ext = fileName.split('.').pop().toLowerCase();
    const isReintro = fileName.length > 0 && fileName.charAt(0) === 'r';
    
    if (isReintro) {
      file.isReintro = true;
      return;
    }
    
    // Parse individual files
    if (ext === 'mpr') {
      const parsed = parseMPR(file.content);
      mat.raw_max_x = Math.max(mat.raw_max_x, parsed.raw_max_x);
      mat.raw_max_y = Math.max(mat.raw_max_y, parsed.raw_max_y);
      mat.final_length = Math.max(mat.final_length, parsed.recommended_length);
      mat.final_width = Math.max(mat.final_width, parsed.recommended_width);
      mat.toolpathData = parsed;
      
      mat.sheets.push({
        fileName: file.name,
        raw_max_x: parsed.raw_max_x,
        raw_max_y: parsed.raw_max_y,
        net_length: parsed.net_length,
        net_width: parsed.net_width,
        final_length: parsed.recommended_length,
        final_width: parsed.recommended_width
      });
    } else if (ext === 'hop') {
      const parsed = parseHOP(file.content);
      mat.raw_max_x = Math.max(mat.raw_max_x, parsed.raw_max_x);
      mat.raw_max_y = Math.max(mat.raw_max_y, parsed.raw_max_y);
      mat.final_length = Math.max(mat.final_length, parsed.recommended_length);
      mat.final_width = Math.max(mat.final_width, parsed.recommended_width);
      mat.toolpathData = parsed;
      
      mat.sheets.push({
        fileName: file.name,
        raw_max_x: parsed.raw_max_x,
        raw_max_y: parsed.raw_max_y,
        net_length: parsed.net_length,
        net_width: parsed.net_width,
        final_length: parsed.recommended_length,
        final_width: parsed.recommended_width
      });
    } else if (ext === 'cpout' || ext === 'cpl' || fileName.toLowerCase().includes('cpout')) {
      const parsed = parseCPOUT(file.content);
      mat.raw_max_x = Math.max(mat.raw_max_x, parsed.raw_max_x);
      mat.raw_max_y = Math.max(mat.raw_max_y, parsed.raw_max_y);
      mat.final_length = Math.max(mat.final_length, parsed.recommended_length);
      mat.final_width = Math.max(mat.final_width, parsed.recommended_width);
      mat.toolpathData = parsed;
      
      const sheetQty = parsed.sheet_count || 1;
      for (let s = 0; s < sheetQty; s++) {
        mat.sheets.push({
          fileName: sheetQty > 1 ? `${file.name} (Sheet ${s + 1}/${sheetQty})` : file.name,
          raw_max_x: parsed.raw_max_x,
          raw_max_y: parsed.raw_max_y,
          net_length: parsed.net_length,
          net_width: parsed.net_width,
          final_length: parsed.recommended_length,
          final_width: parsed.recommended_width
        });
      }
    } else if (ext === 'txt' || ext === 'pull') {
      const parsed = parsePullSheet(file.content);
      if (parsed && parsed.length > 0) {
        // Find matching spray booth item for layup details
        const sprayBoothItem = parsed.find(item => item.layup_required);
        if (sprayBoothItem) {
          mat.layup_required = 1;
          mat.face_material = sprayBoothItem.stack_composition.face;
          mat.core_substrate = sprayBoothItem.stack_composition.core;
          mat.backer_material = sprayBoothItem.stack_composition.backer;
          
          // Normalize pull sheet dims if no toolpath overrides them
          if (mat.final_length === 0) {
            mat.final_length = sprayBoothItem.dimensions.length_in;
          }
          if (mat.final_width === 0) {
            mat.final_width = sprayBoothItem.dimensions.width_in;
          }
        }
        mat.pullSheetData = parsed;
      }
    }
  });
  
  // Post-process sheets array and prune phantom empty materials
  Object.keys(state.materials).forEach(key => {
    const mat = state.materials[key];
    const hasCncFiles = mat.files.some(f => {
      if (f.isReintro) return false;
      const ext = f.name.split('.').pop().toLowerCase();
      return ['mpr', 'hop', 'cpout', 'cpl'].includes(ext) || f.name.toLowerCase().includes('cpout');
    });
    const hasPullData = mat.pullSheetData && mat.pullSheetData.length > 0;
    
    if (hasPullData) {
      // Primary source of truth for raw nest bounds is the CncRun / Pull Sheet manifest
      const sprayBoothItem = mat.pullSheetData.find(item => item.layup_required) || mat.pullSheetData[0];
      if (sprayBoothItem && sprayBoothItem.dimensions) {
        const bWidth = sprayBoothItem.dimensions.width_in || 85.0;
        const bLength = sprayBoothItem.dimensions.length_in || 74.0;
        
        mat.raw_max_x = Math.max(mat.raw_max_x, bWidth);
        mat.raw_max_y = Math.max(mat.raw_max_y, bLength);
        
        // Ensure each sheet references authentic stock bounds
        mat.sheets.forEach(sheet => {
          if (!sheet.raw_max_x || sheet.raw_max_x === 0) sheet.raw_max_x = bWidth;
          if (!sheet.raw_max_y || sheet.raw_max_y === 0) sheet.raw_max_y = bLength;
        });
      }
    }

    if (mat.sheets.length === 0 && !hasCncFiles && !hasPullData) {
      delete state.materials[key];
    } else if (mat.sheets.length === 0 && (hasCncFiles || hasPullData)) {
      if (hasPullData) {
        mat.pullSheetData.forEach((item, index) => {
          mat.sheets.push({
            fileName: item.material_name || `Pull Sheet Nest ${index + 1}`,
            raw_max_x: item.dimensions.width_in || 96.0,
            raw_max_y: item.dimensions.length_in || 48.0,
            net_length: item.dimensions.width_in || 0,
            net_width: item.dimensions.length_in || 0,
            final_length: item.dimensions.width_in || 0,
            final_width: item.dimensions.length_in || 0
          });
        });
      }
    }
  });
}

// Display Scan Results
function displayScanResults() {
  const resultsDiv = document.getElementById('scan-results');
  const matList = document.getElementById('detected-materials');
  const fileBody = document.getElementById('discovered-files-body');
  
  resultsDiv.classList.remove('hidden');
  matList.innerHTML = '';
  fileBody.innerHTML = '';
  
  Object.keys(state.materials).forEach(name => {
    const mat = state.materials[name];
    const li = document.createElement('li');
    li.className = 'material-item';
    li.innerHTML = `
      <span>${name}</span>
      <span class="material-tag">${mat.files.length} files</span>
    `;
    matList.appendChild(li);
    
    mat.files.forEach(f => {
      const ext = f.name.split('.').pop().toUpperCase();
      const tr = document.createElement('tr');
      const statusBadge = f.isReintro 
        ? `<span class="badge badge-warning" style="background: rgba(234, 179, 8, 0.15); color: #eab308; border: 1px solid rgba(234, 179, 8, 0.3);">Re-Intro (Excluded)</span>`
        : `<span class="status-check"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Parsed</span>`;

      tr.innerHTML = `
        <td>${name}</td>
        <td>${f.name}</td>
        <td><span class="badge badge-${ext.toLowerCase()}">${ext}</span></td>
        <td>${statusBadge}</td>
      `;
      fileBody.appendChild(tr);
    });
  });
}

// Build Layout / Laminate Routing Wizard Steps
function buildWizard() {
  const stepsContainer = document.getElementById('wizard-steps');
  stepsContainer.innerHTML = '';
  
  Object.keys(state.materials).forEach(name => {
    const mat = state.materials[name];
    
    const card = document.createElement('div');
    card.className = 'wizard-card';
    card.setAttribute('data-material', name);
    
    // Normalize core substrate state
    if (!mat.core_substrate) {
      // Try to match or default to PB
      if (name.toUpperCase().includes('BMCP')) mat.core_substrate = 'BMCP';
      else if (name.toUpperCase().includes('WMCP')) mat.core_substrate = 'WMCP';
      else if (name.toUpperCase().includes('PB')) mat.core_substrate = 'PB';
      else if (name.toUpperCase().includes('MDF')) mat.core_substrate = 'MDF';
      else if (name.toUpperCase().includes('PLY') || name.toUpperCase().includes('WOOD')) mat.core_substrate = 'Ply';
      else mat.core_substrate = 'PB';
    }
    
    const isRaw = mat.layup_required === 0;
    
    card.innerHTML = `
      <div class="wizard-card-header" style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div class="wizard-card-title">
          <div style="display: flex; align-items: center; gap: 8px;">
            <h4 class="material-card-name">${name}</h4>
            <button class="btn-rename-material" title="Rename material card" style="background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 4px; border-radius: 4px; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
          </div>
          <p>Target Machine: <strong style="color: var(--secondary);">${mat.machine_type}</strong></p>
        </div>
        <button class="btn-delete-material" title="Delete material card from memory" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 6px; border-radius: 6px; transition: all 0.2s ease; display: flex; align-items: center; justify-content: center;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        </button>
      </div>
      
      <div class="layup-fields">
        <div class="form-row-grid" style="grid-template-columns: 1fr 1fr 1fr auto; gap: 16px; align-items: end;">
          <div class="form-group">
            <label>Core Substrate</label>
            <select class="input-core">
              <option value="PB" ${mat.core_substrate === 'PB' ? 'selected' : ''}>Particle Board (PB)</option>
              <option value="MDF" ${mat.core_substrate === 'MDF' ? 'selected' : ''}>MDF</option>
              <option value="Ply" ${mat.core_substrate === 'Ply' || mat.core_substrate === 'Plywood' ? 'selected' : ''}>Plywood (Ply)</option>
              <option value="BMCP" ${mat.core_substrate === 'BMCP' ? 'selected' : ''}>BMCP (Black MCP)</option>
              <option value="WMCP" ${mat.core_substrate === 'WMCP' ? 'selected' : ''}>WMCP (White MCP)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Thickness (in)</label>
            <input type="number" step="0.001" min="0" class="input-thickness" value="${mat.thickness}">
          </div>
          <div class="form-group">
            <label>Grain Direction</label>
            <select class="input-grain">
              <option value="Horizontal" ${mat.grain_direction === 'Horizontal' ? 'selected' : ''}>Horizontal</option>
              <option value="Vertical" ${mat.grain_direction === 'Vertical' ? 'selected' : ''}>Vertical</option>
              <option value="No Grain" ${mat.grain_direction === 'No Grain' ? 'selected' : ''}>No Grain</option>
            </select>
          </div>
          <div class="form-group checkbox-group" style="padding-bottom: 8px; flex-direction: column; gap: 8px; align-items: flex-start;">
            <label class="checkbox-label">
              <input type="checkbox" class="input-raw-material" ${isRaw ? 'checked' : ''}>
              <span>Raw Material (No Lay-Up)</span>
            </label>
            <label class="checkbox-label">
              <input type="checkbox" class="input-use-whole-sheets" ${mat.use_whole_sheets ? 'checked' : ''}>
              <span>Use Whole Sheets</span>
            </label>
          </div>
        </div>
        
        <div class="form-row-grid">
          <div class="form-group">
            <label>Face Up Veneer/Laminate</label>
            <input type="text" class="input-face" placeholder="Face Up Veneer/Laminate" value="${mat.face_material || ''}" ${isRaw ? 'disabled' : ''}>
          </div>
          <div class="form-group">
            <label>Face Down Veneer/Laminate</label>
            <input type="text" class="input-backer" placeholder="Face Down Veneer/Laminate" value="${mat.backer_material || ''}" ${isRaw ? 'disabled' : ''}>
          </div>
        </div>
        
        <div class="layup-dimensions-badge" style="flex-direction: column; align-items: stretch; gap: 8px;">
          ${renderCardDimensionsBadge(mat)}
        </div>
      </div>
    `;
    
    // Select elements
    const rawCheckbox = card.querySelector('.input-raw-material');
    const wholeSheetsCheckbox = card.querySelector('.input-use-whole-sheets');
    const faceInput = card.querySelector('.input-face');
    const backerInput = card.querySelector('.input-backer');
    const coreSelect = card.querySelector('.input-core');
    const thicknessInput = card.querySelector('.input-thickness');
    const grainSelect = card.querySelector('.input-grain');
    
    // Add raw checkbox event
    rawCheckbox.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      mat.layup_required = isChecked ? 0 : 1;
      
      if (isChecked) {
        faceInput.disabled = true;
        backerInput.disabled = true;
      } else {
        faceInput.disabled = false;
        backerInput.disabled = false;
      }
      updateDatabasePreview();
      saveSessionCache();
    });

    wholeSheetsCheckbox.addEventListener('change', (e) => {
      mat.use_whole_sheets = e.target.checked ? 1 : 0;
      const badge = card.querySelector('.layup-dimensions-badge');
      if (badge) badge.innerHTML = renderCardDimensionsBadge(mat);
      updateDatabasePreview();
      saveSessionCache();
    });
    
    // Input syncs
    faceInput.addEventListener('input', e => {
      mat.face_material = e.target.value;
      updateDatabasePreview();
      saveSessionCache();
    });
    
    backerInput.addEventListener('input', e => {
      mat.backer_material = e.target.value;
      updateDatabasePreview();
      saveSessionCache();
    });
    
    coreSelect.addEventListener('change', e => {
      mat.core_substrate = e.target.value;
      updateDatabasePreview();
      saveSessionCache();
    });

    thicknessInput.addEventListener('input', e => {
      const val = parseFloat(e.target.value);
      mat.thickness = isNaN(val) ? 0 : val;
      updateDatabasePreview();
      saveSessionCache();
    });
    
    grainSelect.addEventListener('change', e => {
      mat.grain_direction = e.target.value;
      updateDatabasePreview();
      saveSessionCache();
    });

    const renameBtn = card.querySelector('.btn-rename-material');
    if (renameBtn) {
      renameBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const newName = prompt(`Rename material card "${name}":`, name);
        if (newName !== null && newName.trim() !== '' && newName.trim() !== name) {
          const trimmedName = newName.trim();
          
          const matData = state.materials[name];
          matData.name = trimmedName;
          matData.key = trimmedName;
          
          const newThickness = parseThicknessFromName(trimmedName);
          if (newThickness !== 0.75 || matData.thickness === 0.75) {
            matData.thickness = newThickness;
          }

          state.materials[trimmedName] = matData;
          delete state.materials[name];

          displayScanResults();
          buildWizard();
          updateDatabasePreview();
          renderPullSheetReport();
          saveSessionCache();

          showToast('Material Renamed', `Renamed "${name}" to "${trimmedName}".`, 'success');
        }
      });
    }

    const deleteBtn = card.querySelector('.btn-delete-material');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Are you sure you want to delete "${name}" from memory and pull sheet listings?`)) {
          delete state.materials[name];
          displayScanResults();
          buildWizard();
          updateDatabasePreview();
          renderPullSheetReport();
          saveSessionCache();
          showToast('Material Deleted', `"${name}" removed from project memory.`, 'info');
        }
      });
    }
    
    stepsContainer.appendChild(card);
  });
}

// Helper to render wizard card dimensions badge
function renderCardDimensionsBadge(mat) {
  const isWhole = mat.use_whole_sheets === 1 || mat.use_whole_sheets === true;

  return `
    <div style="display: flex; justify-content: space-between; border-bottom: 1px dashed var(--border-color); padding-bottom: 8px; margin-bottom: 4px;">
      <span>Sheet Quantity:</span>
      <strong>${mat.sheets.length} sheet${mat.sheets.length > 1 ? 's' : ''}</strong>
    </div>
    ${mat.sheets.map((sheet, idx) => {
      const rawX = Math.max(sheet.raw_max_x || 0, mat.raw_max_x || 0);
      const rawY = Math.min(sheet.raw_max_y || 0, mat.raw_max_y || 0);

      // Authentic recommended offcut size calculated from toolpath net span + shop overage
      const finX = sheet.final_length || calculateFinalDimension(sheet.net_length, rawX) || rawX;
      const finY = sheet.final_width || calculateFinalDimension(sheet.net_width, rawY) || rawY;

      if (isWhole) {
        return `
          <div class="sheet-dimension-item" style="display: flex; justify-content: space-between; font-size: 12px; color: var(--text-secondary);">
            <span>Sheet ${idx + 1} (${sheet.fileName || 'Nest'}):</span>
            <span>Raw: <strong>${rawX.toFixed(1)}" x ${rawY.toFixed(1)}"</strong> | Final: <strong>${rawX.toFixed(1)}" x ${rawY.toFixed(1)}" (Whole Sheet)</strong></span>
          </div>
        `;
      }
      return `
        <div class="sheet-dimension-item" style="display: flex; justify-content: space-between; font-size: 12px; color: var(--text-secondary);">
          <span>Sheet ${idx + 1} (${sheet.fileName || 'Nest'}):</span>
          <span>Raw: <strong>${rawX.toFixed(1)}" x ${rawY.toFixed(1)}"</strong> | Final: <strong>${finX.toFixed(1)}" x ${finY.toFixed(1)}"</strong></span>
        </div>
      `;
    }).join('')}
  `;
}

// Helper to get consolidated material summary rows (consolidates identical sheet parameters and calculates quantity)
function getConsolidatedMaterialRows() {
  const rows = [];
  if (!state.materials) return rows;
  
  Object.keys(state.materials).forEach(key => {
    const mat = state.materials[key];
    const isLayUp = mat.layup_required === 1;
    const isWholeSheets = mat.use_whole_sheets === 1 || mat.use_whole_sheets === true;
    const groupMap = {};
    
    const sheetsList = (mat.sheets && mat.sheets.length > 0) ? mat.sheets : [{
      fileName: 'Default Sheet',
      raw_max_x: mat.raw_max_x || 96.0,
      raw_max_y: mat.raw_max_y || 48.0,
      net_length: mat.final_length || 0,
      net_width: mat.final_width || 0,
      final_length: mat.final_length || 0,
      final_width: mat.final_width || 0
    }];
    
    sheetsList.forEach(s => {
      const rx = s.raw_max_x || mat.raw_max_x || 96.0;
      const ry = s.raw_max_y || mat.raw_max_y || 48.0;

      let fLen = isWholeSheets ? rx : (s.final_length || mat.final_length || 0);
      let fWid = isWholeSheets ? ry : (s.final_width || mat.final_width || 0);

      const thick = mat.thickness !== undefined ? mat.thickness : 0.75;
      const grain = mat.grain_direction || 'Horizontal';
      const faceMat = isLayUp ? (mat.face_material || '') : '';
      const backerMat = isLayUp ? (mat.backer_material || '') : '';
      const coreMat = mat.core_substrate || '';
      
      const sig = `${mat.name}|${mat.machine_type}|${mat.layup_required}|${faceMat}|${coreMat}|${backerMat}|${thick}|${grain}|${fLen}|${fWid}|${rx}|${ry}|${isWholeSheets ? 1 : 0}`;
      
      if (!groupMap[sig]) {
        groupMap[sig] = {
          material_name: mat.name,
          machine_type: mat.machine_type,
          quantity: 0,
          layup_required: mat.layup_required,
          faceUp_matl: faceMat,
          core_substrate: coreMat,
          faceDown_matl: backerMat,
          thickness: thick,
          grain_direction: grain,
          final_length: fLen,
          final_width: fWid,
          raw_max_x: rx,
          raw_max_y: ry,
          use_whole_sheets: isWholeSheets ? 1 : 0
        };
      }
      groupMap[sig].quantity += 1;
    });
    
    Object.values(groupMap).forEach(r => rows.push(r));
  });
  
  return rows;
}

// Update Database Preview Tables
function updateDatabasePreview() {
  const metaRows = document.getElementById('db-metadata-rows');
  const summaryRows = document.getElementById('db-summary-rows');
  
  metaRows.innerHTML = `
    <tr>
      <td>${state.metadata.jobNumber || '<span class="text-muted">None</span>'}</td>
      <td>${state.metadata.client || '<span class="text-muted">None</span>'}</td>
      <td>${state.metadata.projectName || '<span class="text-muted">None</span>'}</td>
      <td>${state.metadata.dateProcessed || '<span class="text-muted">None</span>'}</td>
      <td>${state.metadata.operatorName || '<span class="text-muted">None</span>'}</td>
    </tr>
  `;
  
  summaryRows.innerHTML = '';
  const rows = getConsolidatedMaterialRows();
  rows.forEach(row => {
    const tr = document.createElement('tr');
    const isLayUp = row.layup_required === 1;
    
    tr.innerHTML = `
      <td><strong>${row.material_name}</strong></td>
      <td>${row.machine_type}</td>
      <td><span class="badge" style="background-color: var(--primary); color: #fff;">${row.quantity}</span></td>
      <td><span class="badge" style="background-color: ${isLayUp ? 'rgba(76, 175, 80, 0.15)' : 'rgba(255, 255, 255, 0.05)'}; color: ${isLayUp ? 'var(--success)' : 'var(--text-muted)'};">${isLayUp ? 'TRUE' : 'FALSE'}</span></td>
      <td>${isLayUp ? (row.faceUp_matl || '<em>empty</em>') : '<span class="text-muted">NULL</span>'}</td>
      <td>${row.core_substrate || '<em>empty</em>'}</td>
      <td>${isLayUp ? (row.faceDown_matl || '<em>empty</em>') : '<span class="text-muted">NULL</span>'}</td>
      <td>${row.thickness.toFixed(3)}"</td>
      <td>${row.grain_direction}</td>
      <td>${row.final_length.toFixed(2)}</td>
      <td>${row.final_width.toFixed(2)}</td>
      <td>${row.raw_max_x.toFixed(2)}</td>
      <td>${row.raw_max_y.toFixed(2)}</td>
    `;
    summaryRows.appendChild(tr);
  });
}

// Compile SQLite DB file using SQL.js WASM and push to server
async function handleExportSqlite() {
  if (!state.SQL) {
    showToast('SQLite Compile Error', 'SQL.js engine is not ready.', 'error');
    return;
  }
  
  if (!state.metadata.jobNumber) {
    showToast('Validation Error', 'Job Number is required.', 'warning');
    return;
  }
  
  try {
    const db = new state.SQL.Database();
    
    // Create Table 1
    db.run(`
      CREATE TABLE project_metadata (
        job_number TEXT PRIMARY KEY,
        client TEXT,
        project_name TEXT,
        date_processed TEXT,
        operator_name TEXT
      );
    `);
    
    // Create Table 2
    db.run(`
      CREATE TABLE material_summary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        material_name TEXT,
        machine_type TEXT,
        quantity INTEGER,
        layup_required INTEGER,
        faceUp_matl TEXT,
        core_substrate TEXT,
        faceDown_matl TEXT,
        thickness REAL,
        grain_direction TEXT,
        final_length REAL,
        final_width REAL,
        raw_max_x REAL,
        raw_max_y REAL
      );
    `);
    
    // Insert Table 1 Row
    const insertMeta = db.prepare(`
      INSERT INTO project_metadata (job_number, client, project_name, date_processed, operator_name)
      VALUES (?, ?, ?, ?, ?);
    `);
    insertMeta.run([
      state.metadata.jobNumber,
      state.metadata.client || '',
      state.metadata.projectName || '',
      state.metadata.dateProcessed || '',
      state.metadata.operatorName || ''
    ]);
    insertMeta.free();
    
    // Insert Table 2 Rows
    const insertMat = db.prepare(`
      INSERT INTO material_summary (
        material_name, machine_type, quantity, layup_required, faceUp_matl, core_substrate, faceDown_matl,
        thickness, grain_direction, final_length, final_width, raw_max_x, raw_max_y
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);
    
    const summaryRows = getConsolidatedMaterialRows();
    summaryRows.forEach(r => {
      insertMat.run([
        r.material_name,
        r.machine_type,
        r.quantity,
        r.layup_required,
        r.faceUp_matl || null,
        r.core_substrate || null,
        r.faceDown_matl || null,
        r.thickness,
        r.grain_direction,
        r.final_length,
        r.final_width,
        r.raw_max_x,
        r.raw_max_y
      ]);
    });
    insertMat.free();
    
    // Export database binary array
    const binaryArray = db.export();
    
    const exportBtn = document.getElementById('btn-export-sqlite');
    exportBtn.disabled = true;
    exportBtn.textContent = 'Writing Database file...';
    
    if (state.directoryHandle) {
      // Write database directly to local folder via File System Access API
      const fileHandle = await state.directoryHandle.getFileHandle('project_data.db', { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(binaryArray);
      await writable.close();
      
      showToast('Database Written', 'project_data.db successfully written directly to directory.', 'success');
      exportBtn.disabled = false;
    } else {
      // Convert Uint8Array to base64 to send via JSON
      const base64Data = uint8ArrayToBase64(binaryArray);
      
      const res = await fetch('/api/save-database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetPath: state.pastedPath,
          dbBase64: base64Data
        })
      });
      
      if (res.ok) {
        showToast('Database Written', 'project_data.db successfully written to directory.', 'success');
      } else {
        const err = await res.json();
        throw new Error(err.message || 'Write failed');
      }
      
      exportBtn.disabled = false;
    }
    
    exportBtn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
      Write project_data.db to target directory
    `;
    
  } catch (e) {
    showToast('Database Write Failed', e.message || 'Check permissions or directory path.', 'error');
  }
}

// Convert Uint8Array to base64 string
function uint8ArrayToBase64(arr) {
  let binary = '';
  const len = arr.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return window.btoa(binary);
}

// Helper to calculate final part dimension with shop clearance, rounding, and offcut rules
function calculateFinalDimension(netDim, rawMaxDim) {
  if (netDim <= 0) return 0;
  
  const overcutVal = state.settings ? state.settings.overcutOverage : 2.0;
  const offcutVal = state.settings ? state.settings.minOffcutDim : 6.0;
  
  // Calculate size with shop clearance added
  let recommended = netDim + overcutVal;
  
  // Always round up to nearest inch if not exactly .00
  const decimal = recommended % 1;
  if (decimal > 0.001) {
    recommended = Math.ceil(recommended);
  } else {
    recommended = Math.round(recommended);
  }
  
  // If within minOffcutDim of overall sheet dims, use full sheet size (no offcut)
  if (rawMaxDim - recommended <= offcutVal) {
    recommended = rawMaxDim;
  }
  
  // Enforce raw material limits as absolute ceilings
  if (recommended > rawMaxDim) {
    recommended = rawMaxDim;
  }
  
  return recommended;
}

// ==========================================
// Parsing Logic Implementation
// ==========================================

// Homag / Weeke Router (*.mpr) Parser
function parseMPR(content) {
  let raw_max_x = 0;
  let raw_max_y = 0;
  const xCoords = [];
  const yCoords = [];
  
  const lines = content.split(/\r?\n/);
  
  // Locate [001 header and parse l (length) and w (width)
  let inHeader = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '[001') {
      inHeader = true;
      continue;
    }
    if (inHeader && line.startsWith('[')) {
      inHeader = false; // Exited block
    }
    if (inHeader) {
      const matchL = line.match(/^l\s*=\s*"([\d.-]+)"/i);
      const matchW = line.match(/^w\s*=\s*"([\d.-]+)"/i);
      if (matchL) raw_max_x = parseFloat(matchL[1]) / 25.4;
      if (matchW) raw_max_y = parseFloat(matchW[1]) / 25.4;
    }
    
    // Parse coordinates (supports standard X=, Y=, XA=, YA= on standalone lines)
    const matchX = line.match(/^\s*(?:XA|X)\s*=\s*"*([\d.-]+)"*/i);
    const matchY = line.match(/^\s*(?:YA|Y)\s*=\s*"*([\d.-]+)"*/i);
    if (matchX) xCoords.push(parseFloat(matchX[1]) / 25.4);
    if (matchY) yCoords.push(parseFloat(matchY[1]) / 25.4);
  }
  
  const net_length = xCoords.length > 0 ? Math.max(...xCoords) - Math.min(...xCoords) : 0;
  const net_width = yCoords.length > 0 ? Math.max(...yCoords) - Math.min(...yCoords) : 0;
  
  const recLength = calculateFinalDimension(net_length, raw_max_x);
  const recWidth = calculateFinalDimension(net_width, raw_max_y);
  
  return {
    raw_max_x,
    raw_max_y,
    net_length,
    net_width,
    recommended_length: recLength,
    recommended_width: recWidth
  };
}

// Holzher Dynestic Router (*.hop) Parser
function parseHOP(content) {
  let raw_max_x = 0;
  let raw_max_y = 0;
  const xCoords = [];
  const yCoords = [];
  
  const lines = content.split(/\r?\n/);
  
  let isAfterStart = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Extract sheet dimensions (DX and DY) inside VARS
    const matchDX = line.match(/\bDX\s*:=\s*([\d.-]+)/i);
    const matchDY = line.match(/\bDY\s*:=\s*([\d.-]+)/i);
    if (matchDX) raw_max_x = parseFloat(matchDX[1]); // native inches
    if (matchDY) raw_max_y = parseFloat(matchDY[1]); // native inches
    
    if (line === 'START') {
      isAfterStart = true;
      continue;
    }
    
    // Scan geometry coordinates after START
    if (isAfterStart) {
      const matchGeo = line.match(/^(DRILLING|SP|G01|G02R)\s*\(\s*([\d.-]+)\s*,\s*([\d.-]+)/i);
      if (matchGeo) {
        xCoords.push(parseFloat(matchGeo[2]));
        yCoords.push(parseFloat(matchGeo[3]));
      }
    }
  }
  
  const net_length = xCoords.length > 0 ? Math.max(...xCoords) - Math.min(...xCoords) : 0;
  const net_width = yCoords.length > 0 ? Math.max(...yCoords) - Math.min(...yCoords) : 0;
  
  const recLength = calculateFinalDimension(net_length, raw_max_x);
  const recWidth = calculateFinalDimension(net_width, raw_max_y);
  
  return {
    raw_max_x,
    raw_max_y,
    net_length,
    net_width,
    recommended_length: recLength,
    recommended_width: recWidth
  };
}

// Holzher Beam Saw (*.cpout / *.cpl) Parser
function parseCPOUT(content) {
  let raw_max_x = 0;
  let raw_max_y = 0;
  let sheet_count = 1;
  
  const ordLengths = [];
  const ordWidths = [];
  
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const parts = line.split(',');
    
    if (parts[0] === 'INV1') {
      // 3rd part (0-indexed index 2) is number of sheets in run (e.g. INV1, 999, 10, ...)
      if (parts[2]) {
        const qty = parseInt(parts[2].trim());
        if (!isNaN(qty) && qty > 0) {
          sheet_count = qty;
        }
      }
      // 4th is RAW_MAX_Y, 5th is RAW_MAX_X (0-indexed 4 and 5)
      if (parts[4]) raw_max_y = parseFloat(parts[4]);
      if (parts[5]) raw_max_x = parseFloat(parts[5]);
    }
    
    if (parts[0] === 'ORD1') {
      // 3rd is Length, 4th is Width (0-indexed 3 and 4)
      if (parts[3]) ordLengths.push(parseFloat(parts[3]));
      if (parts[4]) ordWidths.push(parseFloat(parts[4]));
    }
  }
  
  const net_length = ordLengths.length > 0 ? Math.max(...ordLengths) : 0;
  // Cumulate width stacks for beam saw
  const net_width = ordWidths.reduce((a, b) => a + b, 0);
  
  const recLength = calculateFinalDimension(net_length, raw_max_x);
  const recWidth = calculateFinalDimension(net_width, raw_max_y);
  
  return {
    raw_max_x,
    raw_max_y,
    net_length,
    net_width,
    recommended_length: recLength,
    recommended_width: recWidth,
    sheet_count
  };
}

// Pull Sheet Parser (handles both specification stack block format and CNC Run CSV format)
function parsePullSheet(content) {
  const items = [];
  const lines = content.split(/\r?\n/);
  
  // 1. Check if it's a CNC Run CSV file
  const isCncRun = lines.some(l => l.trim().startsWith('^Job'));
  
  if (isCncRun) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('^')) continue;
      
      const parts = line.split(',');
      if (parts.length >= 6) {
        const fileName = parts[0].trim();
        const sheetTitle = parts[1].trim();
        const rawVal1 = parseFloat(parts[2]);
        const rawVal2 = parseFloat(parts[3]);
        const rawThick = parseFloat(parts[4]);
        
        // parts[2] is Board Width, parts[3] is Board Length
        const boardWidth = rawVal1 > 150 ? rawVal1 / 25.4 : rawVal1;
        const boardLength = rawVal2 > 150 ? rawVal2 / 25.4 : rawVal2;
        const thickness = rawThick > 10 ? rawThick / 25.4 : rawThick;
        const materialName = parts[5].trim();
        const layupRequired = parts[10] ? parseInt(parts[10].trim()) : 0;
        
        let face = materialName;
        let core = '';
        let backer = '';
        
        if (layupRequired === 1) {
          core = 'PB'; // Default substrate core
          if (materialName.includes('-')) {
            const matParts = materialName.split('-');
            // CNC Face Up (first part) is Back Veneer/Laminate
            backer = matParts[0].replace(/^[\d/.-]+\s+/, '').trim(); // Remove leading thickness
            // CNC Face Down (second part) is Face Veneer/Laminate
            face = matParts[1].replace(/\(.*?\)/, '').trim(); // Remove trailing parens
          } else if (materialName.toUpperCase().includes('2S')) {
            // E.g. "3/4 2S HPL (0.81250)" -> face and backer are the same (HPL)
            const cleanedMat = materialName.replace(/^[\d/.-]+\s+2S\s+/i, '').replace(/\(.*?\)/, '').trim();
            face = cleanedMat;
            backer = cleanedMat;
          } else {
            const cleanedMat = materialName.replace(/^[\d/.-]+\s+/, '').replace(/\(.*?\)/, '').trim();
            face = cleanedMat;
            backer = cleanedMat;
          }
        }
        
        const isBeamSaw = fileName.toUpperCase().startsWith('RY');
        const isHolzherCnc = fileName.toUpperCase().startsWith('RF') || fileName.toUpperCase().startsWith('RH');
        const dest = isBeamSaw ? 'Holzher Beam Saw' : (isHolzherCnc ? 'Holzher CNC' : 'Homag');
        
        items.push({
          routing_destination: dest,
          layup_required: layupRequired === 1,
          quantity: 1,
          dimensions: {
            nominal: `${Math.round(boardWidth)}x${Math.round(boardLength)}`,
            width_in: boardWidth,
            length_in: boardLength
          },
          stack_composition: {
            face: face,
            core: core,
            backer: backer
          },
          material_name: materialName
        });
      }
    }
    return items;
  }
  
  // 2. Otherwise, fall back to theoretical Spray Booth stack block format
  let currentDestination = 'Homag';
  let currentLayup = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Check routing category header
    if (line.includes('Spray Booth --> then Homag')) {
      currentDestination = 'Homag';
      currentLayup = true;
      continue;
    } else if (line.includes('Spray Booth --> then Beam Saw')) {
      currentDestination = 'Holzher Beam Saw';
      currentLayup = true;
      continue;
    } else if (line.includes('Homag') && !line.includes('Spray Booth')) {
      currentDestination = 'Homag';
      currentLayup = false;
      continue;
    } else if (line.includes('Beam Saw') && !line.includes('Spray Booth')) {
      currentDestination = 'Holzher Beam Saw';
      currentLayup = false;
      continue;
    }
    
    // Match Spray Booth stack configuration (3 lines contiguous)
    // Line 1: Quantity and Face Material
    const matchLine1 = line.match(/^\s*(?:\((\d+)\)|(\d+))\s+(.+)$/);
    if (currentLayup && matchLine1) {
      const qty = parseInt(matchLine1[1] || matchLine1[2]);
      const face = matchLine1[3].trim();
      
      // Look at next lines
      const line2 = lines[i + 1] ? lines[i + 1].trim() : '';
      const line3 = lines[i + 2] ? lines[i + 2].trim() : '';
      
      // Line 2: Core substrate and thickness/dimensions
      const matchLine2 = line2.match(/^([a-zA-Z0-9-/]+)\s+([\d/.-]+"?)\s*\(([^)]+)\)/);
      if (matchLine2) {
        const core = matchLine2[1].trim();
        const thickness = matchLine2[2].trim();
        const rawDims = matchLine2[3].trim();
        const backer = line3.trim();
        
        // Convert dimensions
        const dims = normalizeDimensions(rawDims);
        
        items.push({
          routing_destination: currentDestination,
          layup_required: true,
          quantity: qty,
          dimensions: {
            nominal: rawDims,
            length_in: dims.length,
            width_in: dims.width
          },
          stack_composition: {
            face: face,
            core: core,
            backer: backer
          }
        });
        
        i += 2; // Jump forward
        continue;
      }
    }
    
    // Match Category A Direct-to-Machine standard items
    // (Qty) Thickness Material Type (Dimensions)
    // E.g. (4) 3/4" Plywood (5x10)
    const matchDirect = line.match(/^\s*(?:\((\d+)\)|(\d+))\s+([\d/.-]+"?)\s+(.*?)\s+\(([^)]+)\)$/);
    if (!currentLayup && matchDirect) {
      const qty = parseInt(matchDirect[1] || matchDirect[2]);
      const thickness = matchDirect[3].trim();
      const materialType = matchDirect[4].trim();
      const rawDims = matchDirect[5].trim();
      
      const dims = normalizeDimensions(rawDims);
      
      items.push({
        routing_destination: currentDestination,
        layup_required: false,
        quantity: qty,
        dimensions: {
          nominal: rawDims,
          length_in: dims.length,
          width_in: dims.width
        },
        stack_composition: {
          face: materialType,
          core: '',
          backer: ''
        }
      });
    }
  }
  
  return items;
}

// Convert pull sheet sizes (nominal feet or explicit inches)
function normalizeDimensions(dimStr) {
  let length = 0;
  let width = 0;
  
  // Clean quotes/spaces
  const cleanStr = dimStr.replace(/"/g, '').trim();
  const parts = cleanStr.split(/[xX]/);
  
  if (parts.length === 2) {
    const val1 = parseFloat(parts[0]);
    const val2 = parseFloat(parts[1]);
    
    // Check if foot dimensions (e.g. 5x10, 4x8)
    if (val1 <= 12 && val2 <= 12) {
      if (val1 === 5 && val2 === 10) {
        length = 121.0;
        width = 61.0;
      } else if (val1 === 4 && val2 === 8) {
        length = 96.0;
        width = 48.0;
      } else {
        // General foot-to-inch multiplier
        length = Math.max(val1, val2) * 12.0;
        width = Math.min(val1, val2) * 12.0;
      }
    } else {
      // Custom inch boundaries (e.g. 46x79 or 50x37)
      length = Math.max(val1, val2);
      width = Math.min(val1, val2);
    }
  }
  
  return { length, width };
}

// Toast Notification System
function showToast(title, message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <div class="toast-content">
      <h5>${title}</h5>
      <p>${message}</p>
    </div>
  `;
  container.appendChild(toast);
  
  // Remove toast after animation
  setTimeout(() => {
    toast.style.animation = 'toastIn 0.3s reverse';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Render Printable Pull Sheet Report matching pull sheet example.pdf
function renderPullSheetReport() {
  const container = document.getElementById('pull-sheet-report-container');
  if (!container) return;

  const operatorName = state.metadata.operatorName || 'Sam H';
  const dateProcessed = state.metadata.dateProcessed || new Date().toLocaleDateString('en-US');
  const clientName = state.metadata.client ? state.metadata.client.trim() : '';
  const projectName = state.metadata.projectName || 'Untitled Project';
  const jobNumber = state.metadata.jobNumber || 'N/A';

  const projectSubheader = clientName ? `${clientName} - ${projectName}` : projectName;

  // Group materials by machine_type
  const machineGroups = {};
  if (state.materials) {
    Object.keys(state.materials).forEach(key => {
      const mat = state.materials[key];
      const mType = mat.machine_type || 'Homag';
      if (!machineGroups[mType]) {
        machineGroups[mType] = { direct: [], layup: [] };
      }
      if (mat.layup_required === 0) {
        machineGroups[mType].direct.push(mat);
      } else {
        machineGroups[mType].layup.push(mat);
      }
    });
  }

  // Helper to clean leading thickness fraction prefixes and trailing machine/nest parenthetical notes from material titles
  function cleanMaterialTitle(name) {
    if (!name) return '';
    let cleaned = name.replace(/\s*\([^)]*(beam\s*saw|cnc|nest|homag|holzher)[^)]*\)/i, '');
    // Remove leading thickness fraction/decimal prefixes while preserving 2S, 1S, S2S designations
    cleaned = cleaned.replace(/^(\d+[\s-]+\d+[-/]\d+(?![a-zA-Z])|\d+[-/]\d+(?![a-zA-Z])|\d+\.\d+|\d+["”']?)\s*/i, '').trim();
    cleaned = cleaned.replace(/^["”']\s*/, '').trim();
    return cleaned || name;
  }

  // Format thickness string helper (e.g. 0.75 -> 3/4", 1.125 -> 1-1/8", 0.5 -> 1/2")
  function formatThicknessStr(val) {
    if (Math.abs(val - 1.125) < 0.02) return '1-1/8"';
    if (Math.abs(val - 0.75) < 0.02) return '3/4"';
    if (Math.abs(val - 0.5) < 0.02) return '1/2"';
    if (Math.abs(val - 0.625) < 0.02) return '5/8"';
    if (Math.abs(val - 0.9375) < 0.02) return '15/16"';
    return `${val}"`;
  }

  // Format dimension bounds string (exact footage: (5x10), (5x9), (4x8); non-exact footage: explicit inches preserving orientation (e.g. 85"x74"))
  function formatBoundsStr(fLen, fWid) {
    const maxDim = Math.max(fLen || 0, fWid || 0);
    const minDim = Math.min(fLen || 0, fWid || 0);
    
    // Check if the calculated offcut size in material_summary is an exact full stock sheet (5x10, 5x9, or 4x8)
    const isFull5x10 = (Math.abs(maxDim - 121) <= 1.5 || Math.abs(maxDim - 120) <= 1.5) && 
                       (Math.abs(minDim - 61) <= 1.5 || Math.abs(minDim - 60) <= 1.5);
    const isFull5x9  = (Math.abs(maxDim - 109) <= 1.5 || Math.abs(maxDim - 108) <= 1.5) && 
                       (Math.abs(minDim - 61) <= 1.5 || Math.abs(minDim - 60) <= 1.5);
    const isFull4x8  = (Math.abs(maxDim - 96) <= 1.5) && (Math.abs(minDim - 48) <= 1.5);

    if (isFull5x10) return '(5x10)';
    if (isFull5x9)  return '(5x9)';
    if (isFull4x8)  return '(4x8)';
    
    // Custom / non-stock offcut sizes: preserve explicit dimension order (e.g. 85"x74" vs 74"x85")
    const renderLen = fLen ? Math.round(fLen) : 96;
    const renderWid = fWid ? Math.round(fWid) : 48;
    return `(${renderLen}"x${renderWid}")`;
  }

  let html = `
    <div class="ps-report-header">
      <div class="ps-header-top">
        <div style="display: flex; align-items: center; gap: 10px;">
          <img src="logo.png" alt="Corporate Interiors Logo" style="height: 32px; width: auto; object-fit: contain;">
          <span>Drawn by: ${operatorName}</span>
        </div>
        <h2 class="ps-header-title">Pull Sheet</h2>
        <span>${dateProcessed}</span>
      </div>
      <div class="ps-header-sub">
        <span>${projectSubheader}</span>
        <span>Job #: ${jobNumber}</span>
      </div>
    </div>
  `;

  // Render Machine Groups
  const machineKeys = Object.keys(machineGroups);
  if (machineKeys.length === 0) {
    html += `<p style="padding: 20px; text-align: center;">No materials configured in wizard.</p>`;
  } else {
    machineKeys.forEach(mType => {
      const group = machineGroups[mType];

      // Category A: Direct-to-Machine Items
      if (group.direct.length > 0) {
        html += `
          <div class="ps-section">
            <h3 class="ps-section-title">${mType}</h3>
        `;
        group.direct.forEach(mat => {
          const consolidatedRows = getConsolidatedMaterialRows().filter(r => r.material_name === mat.name && r.machine_type === mat.machine_type);
          const rowsToRender = consolidatedRows.length > 0 ? consolidatedRows : [{
            quantity: mat.sheets ? mat.sheets.length : 1,
            thickness: mat.thickness || 0.75,
            final_length: mat.final_length,
            final_width: mat.final_width,
            raw_max_x: mat.raw_max_x,
            raw_max_y: mat.raw_max_y
          }];

          const cleanTitle = cleanMaterialTitle(mat.name);

          rowsToRender.forEach(r => {
            const thickStr = formatThicknessStr(r.thickness || 0.75);
            const boundsStr = formatBoundsStr(r.final_length, r.final_width, r.raw_max_x, r.raw_max_y);
            const isCustomSize = !boundsStr.includes('(5x10)') && !boundsStr.includes('(5x9)') && !boundsStr.includes('(4x8)');
            const offcutNote = isCustomSize ? ' - If offcut is available' : '';

            html += `
              <div class="ps-direct-item">(${r.quantity}) ${thickStr} ${cleanTitle} ${boundsStr}${offcutNote}</div>
            `;
          });
        });
        html += `</div>`;
      }

      // Category B: Spray Booth Lay-Up Stacks
      if (group.layup.length > 0) {
        html += `
          <div class="ps-section">
            <h3 class="ps-section-title">Spray Booth --> then ${mType}</h3>
        `;
        group.layup.forEach(mat => {
          const consolidatedRows = getConsolidatedMaterialRows().filter(r => r.material_name === mat.name && r.machine_type === mat.machine_type);
          const rowsToRender = consolidatedRows.length > 0 ? consolidatedRows : [{
            quantity: mat.sheets ? mat.sheets.length : 1,
            faceUp_matl: mat.face_material || 'VENEER',
            core_substrate: mat.core_substrate || 'PB',
            faceDown_matl: mat.backer_material || 'BKR',
            thickness: mat.thickness || 0.75,
            grain_direction: mat.grain_direction || 'Horizontal',
            final_length: mat.final_length,
            final_width: mat.final_width,
            raw_max_x: mat.raw_max_x,
            raw_max_y: mat.raw_max_y
          }];

          rowsToRender.forEach(r => {
            const thickStr = formatThicknessStr(r.thickness || 0.75);
            const boundsStr = formatBoundsStr(r.final_length, r.final_width, r.raw_max_x, r.raw_max_y);
            const faceUp = r.faceUp_matl;
            const core = r.core_substrate || 'PB';
            const faceDown = r.faceDown_matl;
            const isMcpCore = (core === 'BMCP' || core === 'WMCP');
            
            let stackHtml = '';
            if (isMcpCore) {
              // 2-tier stack card for pre-bought 2-sided Black/White MCP core substrates
              let topLayer = '';
              let bottomLayer = '';
              
              if (faceUp && faceUp.trim() && faceUp.toUpperCase() !== core.toUpperCase()) {
                topLayer = faceUp;
                bottomLayer = (faceDown && faceDown.trim() && faceDown.toUpperCase() !== core.toUpperCase()) ? faceDown : core;
              } else if (faceDown && faceDown.trim() && faceDown.toUpperCase() !== core.toUpperCase()) {
                topLayer = core;
                bottomLayer = faceDown;
              } else {
                topLayer = faceUp || 'LAMINATE';
                bottomLayer = core;
              }
              
              stackHtml = `
                <div class="ps-layup-stack">
                  <div class="ps-stack-tier">${topLayer}</div>
                  <div class="ps-stack-divider"></div>
                  <div class="ps-stack-tier">${bottomLayer}</div>
                </div>
              `;
            } else {
              // Standard 3-tier stack card (Face Up / Core Substrate / Face Down)
              const displayFaceUp = faceUp || 'VENEER';
              const displayFaceDown = faceDown || 'BKR';
              stackHtml = `
                <div class="ps-layup-stack">
                  <div class="ps-stack-tier">${displayFaceUp}</div>
                  <div class="ps-stack-divider"></div>
                  <div class="ps-stack-tier">${core}</div>
                  <div class="ps-stack-divider"></div>
                  <div class="ps-stack-tier">${displayFaceDown}</div>
                </div>
              `;
            }

            const grainDisplay = r.grain_direction === 'No Grain' ? 'No Grain' : `${r.grain_direction || 'Horizontal'} Grain`;
            const isCustomSize = !boundsStr.includes('(5x10)') && !boundsStr.includes('(5x9)') && !boundsStr.includes('(4x8)');
            const offcutNoteHtml = isCustomSize ? `<div style="font-size: 11px; font-weight: normal; margin-top: 2px; color: #d32f2f; font-style: italic;">If offcut is available</div>` : '';

            html += `
              <div class="ps-layup-card">
                <div class="ps-layup-qty">(${r.quantity})</div>
                ${stackHtml}
                <div class="ps-layup-dims">
                  <div>${thickStr} ${boundsStr}</div>
                  ${offcutNoteHtml}
                  <div style="font-size: 12px; font-weight: normal; margin-top: 4px; color: #444;">${grainDisplay}</div>
                </div>
              </div>
            `;
          });
        });
        html += `</div>`;
      }
    });
  }

  container.innerHTML = html;
}

function handlePrintPullSheet() {
  renderPullSheetReport();
  
  const rawJobName = (state.metadata.projectName && state.metadata.projectName.trim())
    ? state.metadata.projectName.trim()
    : ((state.metadata.jobNumber && state.metadata.jobNumber.trim()) 
        ? state.metadata.jobNumber.trim() 
        : 'Project');
        
  // Clean any invalid filename characters so operating system save dialog handles it smoothly
  const cleanJobName = rawJobName.replace(/[/\\?%*:|"<>]/g, '-').trim();
  const targetTitle = `Pull Sheet - ${cleanJobName}`;
  const originalTitle = document.title;
  
  // Set document title dynamically so browser PDF export defaults to "Pull Sheet - $jobname.pdf"
  document.title = targetTitle;
  
  window.print();
  
  // Restore document title after print dialog
  setTimeout(() => {
    document.title = originalTitle;
  }, 1000);
}

// Cache session state so user input is preserved across navigation tabs and setting changes
function saveSessionCache() {
  try {
    const cacheData = {
      pastedPath: state.pastedPath,
      pastedPathsList: Array.from(document.querySelectorAll('.pasted-path-field')).map(el => el.value),
      metadata: state.metadata,
      settings: state.settings,
      materials: state.materials,
      files: state.files
    };
    sessionStorage.setItem('ps_wizard_session_cache', JSON.stringify(cacheData));
  } catch (e) {
    console.warn('Could not save session cache:', e);
  }
}

function restoreSessionCache() {
  try {
    const raw = sessionStorage.getItem('ps_wizard_session_cache');
    if (!raw) return false;
    const cacheData = JSON.parse(raw);
    if (!cacheData) return false;

    if (cacheData.metadata) {
      state.metadata = Object.assign(state.metadata, cacheData.metadata);
      if (document.getElementById('meta-job-number')) document.getElementById('meta-job-number').value = state.metadata.jobNumber || '';
      if (document.getElementById('meta-client')) document.getElementById('meta-client').value = state.metadata.client || '';
      if (document.getElementById('meta-project-name')) document.getElementById('meta-project-name').value = state.metadata.projectName || '';
      if (document.getElementById('meta-operator-name')) document.getElementById('meta-operator-name').value = state.metadata.operatorName || '';
      if (document.getElementById('meta-date-processed')) document.getElementById('meta-date-processed').value = state.metadata.dateProcessed || '';
    }

    if (cacheData.settings) {
      state.settings = Object.assign(state.settings, cacheData.settings);
      if (document.getElementById('settings-overcut')) document.getElementById('settings-overcut').value = state.settings.overcutOverage;
      if (document.getElementById('settings-offcut')) document.getElementById('settings-offcut').value = state.settings.minOffcutDim;
    }

    if (cacheData.pastedPathsList && Array.isArray(cacheData.pastedPathsList) && cacheData.pastedPathsList.length > 0) {
      const container = document.getElementById('paths-list-container');
      if (container) {
        container.innerHTML = '';
        cacheData.pastedPathsList.forEach((pathVal, idx) => {
          const row = document.createElement('div');
          row.className = 'path-input-row';
          row.style.display = 'flex';
          row.style.gap = '8px';
          row.style.alignItems = 'center';
          row.innerHTML = `
            <input type="text" class="pasted-path-field" placeholder="e.g. Z:\\Homag CNC\\Empire Office\\180577-1 Criteo Corp - Reception Desk" style="flex: 1;" value="${pathVal}">
            ${idx === 0 ? `
              <button id="btn-add-path-field" class="btn btn-secondary" style="padding: 10px 14px; font-weight: bold; height: auto;" title="Add another folder path">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
              </button>
            ` : `
              <button class="btn btn-secondary btn-remove-path-field" style="padding: 10px 14px; font-weight: bold; height: auto;" title="Remove this path">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            `}
          `;
          container.appendChild(row);
          if (idx === 0) {
            row.querySelector('#btn-add-path-field').addEventListener('click', () => {
              const newRow = document.createElement('div');
              newRow.className = 'path-input-row';
              newRow.style.display = 'flex';
              newRow.style.gap = '8px';
              newRow.style.alignItems = 'center';
              newRow.innerHTML = `
                <input type="text" class="pasted-path-field" placeholder="e.g. Z:\\Homag CNC\\Empire Office\\180577-1 Criteo Corp - Reception Desk" style="flex: 1;">
                <button class="btn btn-secondary btn-remove-path-field" style="padding: 10px 14px; font-weight: bold; height: auto;" title="Remove this path">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              `;
              container.appendChild(newRow);
              newRow.querySelector('.btn-remove-path-field').addEventListener('click', () => { newRow.remove(); saveSessionCache(); });
              saveSessionCache();
            });
          } else {
            row.querySelector('.btn-remove-path-field').addEventListener('click', () => { row.remove(); saveSessionCache(); });
          }
        });
      }
    }

    if (cacheData.files && Array.isArray(cacheData.files) && cacheData.files.length > 0) {
      state.files = cacheData.files;
    }

    if (cacheData.materials && Object.keys(cacheData.materials).length > 0) {
      state.materials = cacheData.materials;
      displayScanResults();
      buildWizard();
      updateDatabasePreview();

      if (document.getElementById('section-metadata')) document.getElementById('section-metadata').classList.remove('hidden');
      if (document.getElementById('section-wizard')) document.getElementById('section-wizard').classList.remove('hidden');
    }
    return true;
  } catch (e) {
    console.warn('Could not restore session cache:', e);
    return false;
  }
}
