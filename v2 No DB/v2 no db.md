# Corporate Interiors: Pull Sheet Generator

## Objective
A browser-based application served by a local PowerShell HTTP listener that scans project directories, parses CNC machine files (`.mpr`, `.hop`, `.cpout`), and aggregates material bounds. The application prompts the operator for lamination routing and natively generates a printable HTML/CSS Pull Sheet.

---

## 1. System Architecture
* **Backend:** A local PowerShell HTTP Listener Server. This server acts as the file system bridge, handling static file serving and directory traversal via the `/api/scan` endpoint[cite: 16].
* **Frontend:** A vanilla JavaScript, HTML, and CSS single-page application.
* **Network Strategy:** Users load the app in their browser via `http://localhost:9994/` (or the configured port) while the PowerShell script runs in the background[cite: 16].

---

## 2. Legacy SQLite Code Retention (Hidden State)
The existing SQLite WebAssembly integration and export logic must remain completely intact within the codebase to allow for future database migration, but it must be visually disabled in the UI.
* **Do Not Delete:** Retain the `sql-wasm.js` and `sql-wasm.wasm` auto-download logic in the server script[cite: 16]. Retain `loadSqlWasm()`, `handleExportSqlite()`, and all associated DB compilation math in `app.js`.
* **Retain Endpoints:** Keep the `/api/save-database` POST route active in the PowerShell server[cite: 16].
* **UI Action:** Apply CSS `.hidden` classes to the `#section-export` container, the database preview tabs, and the "Write project_data.db" button to remove them from the operator's view.

---

## 3. Pull Sheet Generation Pipeline (Browser-Native)
The application will utilize the browser's native rendering engine to format and output the final pull sheets, allowing the operator to print physical copies or "Save as PDF".

### Step 1: Data Aggregation
Upon completion of the interactive Lay-Up Wizard, the application extracts the finalized material array using the `getConsolidatedMaterialRows()` function. The data is sorted into two distinct reporting sections:
* **Direct-to-Machine:** Objects where `layup_required === 0`.
* **Spray Booth Lay-Up:** Objects where `layup_required === 1`, requiring the 3-tier visual text stack (Face Material, Core Substrate, Backer Material).

### Step 2: HTML/CSS Templating
Construct a dedicated HTML reporting layout that remains hidden during the scanning and wizard phases.
* Use JavaScript template literals (or a lightweight templating engine) to inject the consolidated material rows, Job Number, Operator Name, and Date into the HTML layout.
* Implement a `@media print` CSS block. When the print dialog is triggered, this CSS must force the sidebar, navigation, wizard cards, and background colors to `display: none`, ensuring only the formatted Pull Sheet data renders on the page.

### Step 3: Print & PDF Handoff
* Add a new primary action button at the end of the wizard: `"Print / Save Pull Sheet"`.
* When clicked, the application populates the hidden reporting layout with the live data and executes the native `window.print()` command.
* The operator utilizes the standard browser print dialog to print to the shop floor printer or save the output as a uniform PDF.