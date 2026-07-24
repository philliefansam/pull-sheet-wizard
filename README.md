# Pull Sheet Wizard

A web application served by a local PowerShell HTTP listener backend that recursively scans project directories, parses CNC and Beam Saw machine files (`.mpr`, `.hop`, `.cpout`), aggregates toolpath bounding dimensions, and interactively generates printable shop-floor **Pull Sheets** and **Lay-Up Specifications**.

---

## 🛠️ Key Features

* **Multi-Machine Toolpath & File Parser**:
  * **Homag / Weeke Router (`.mpr`)**: Parses header part dimensions (`l`, `w`), coordinates, and clearance calculations.
  * **Holzher CNC (`.hop`)**: Parses variable definitions (`DX`, `DY`) and contour bounding limits.
  * **Holzher Beam Saw (`.cpout` / `.cpl`)**: Parses `INV1` raw stock dimensions and `ORD1` cut part lengths and width stacks.
  * **Pull Sheet Text Files (`.txt` / `.pull`)**: Parses Spray Booth stack blocks and CNC Run CSV payload manifests.

* **Material Classification & Machine Segregation**:
  * Automatically isolates material subfolders (e.g. `3-4 2S Natural Recon`, `1-2 Raw MDF`, `1 1-8 BKR-Natural Recon`).
  * Segregates router jobs (`Homag`, `Holzher CNC`) and saw jobs (`Holzher Beam Saw`).
  * Automatically parses nominal material thickness from folder names (e.g. `1 1-8` $\rightarrow$ `1.125"`, `3-4` $\rightarrow$ `0.75"`).

* **Interactive Lay-Up Wizard**:
  * Customizable **Core Substrates** (`Particle Board (PB)`, `MDF`, `Plywood`).
  * Dynamic **Thickness (in)** overrides and **Grain Direction** selection (`Horizontal`, `Vertical`, `No Grain`).
  * Toggle for **Raw Materials (No Lay-Up)** vs. **Spray Booth Lay-Up** (Face Up / Face Down laminate assignment).
  * Auto-consolidates matching sheet sizes with quantity counters.

* **Browser-Native Printable Pull Sheet Reports**:
  * Produces formatted shop-floor pull sheets matching physical shop standards.
  * Direct-to-machine list items formatted as `(Quantity) Thickness Material Title (Dimensions)`.
  * Framed 3-tier Spray Booth layup cards displaying top face, core, and backer separated by divider lines, thickness, explicit inches offcut dimensions, and grain direction.
  * Native `@media print` CSS stylesheet for printing or saving as PDF via `window.print()`.

---

## 📁 Repository Structure

```
Pull Sheet Wizard/
├── run.bat                 # Helper execution script (launches server and opens default browser)
├── server.ps1              # Local PowerShell HTTP listener server (API routes & static file server)
├── README.md               # Project documentation & setup instructions
├── .gitignore              # Git ignore rules for OS and temporary files
├── public/                 # Root frontend single-page application assets
│   ├── index.html          # Application UI markup & layout
│   ├── style.css           # Premium dark mode theme & @media print styles
│   └── app.js              # Parser logic, wizard state, and print renderer
├── v2 No DB/               # Iterated v2 standalone release (Printable Report Generator)
│   ├── run.bat             # v2 launcher script
│   ├── server.ps1          # v2 PowerShell server
│   └── public/             # v2 frontend assets & report templates
├── demo-project/           # Sample test project folders (Homag, Holzher CNC, Holzher Beam Saw)
└── Change Requests/        # Technical change request documents (v1 to v7)
```

---

## 🚀 Quick Start & Local Execution

### Method 1: Using `run.bat` (Recommended)
Double-click `run.bat` (or `v2 No DB/run.bat`) to launch the server window and open the dashboard in your default browser automatically.

### Method 2: Manual PowerShell Launch
Open PowerShell in the project directory and execute:
```powershell
powershell -ExecutionPolicy Bypass -File server.ps1
```
Then navigate your browser to:
```
http://localhost:9990/
```

---
