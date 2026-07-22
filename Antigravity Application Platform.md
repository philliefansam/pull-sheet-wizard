# Antigravity Application Platform Architecture

## Objective
A local desktop application framework designed to scan project directories, orchestrate independent extraction modules (Pull Sheet and Toolpath Bounding Box parsers), handle user lamination routing workflows, and write structured records into a local SQLite database file[cite: 3, 5, 6, 7]. This data layer allows any workstation running LibreOffice Base via ODBC to pull real-time datasets for print report generation.

---

## 1. Directory Input & Scanning Engine
* **Pasted Target Directory:** The application UI exposes a simple text input element allowing the user to paste a folder path or network UNC path (e.g., `Z:\Homag CNC\Empire Office\180577-1 Criteo Corp - Reception Desk\`)[cite: 3].
* **Material Sequence Splitting:** The framework automatically indexes the directories, isolating files by subfolder configurations which represent unique material classifications (e.g., `3-4 2S Natural Recon`)[cite: 3, 9].
* **Modular Code Handoff:** For each subfolder discovered, the app pipelines the file payloads directly into the standalone parsing engines to gather raw part boundaries, machine targets, and textual pull sheet specifications[cite: 3, 5, 6, 7].

---

## 2. Interactive User Workflow Wizard
Once the backend parsing engines process the files, the application summarizes the findings and halts for user operational input:

* **The Lay-Up Validation Prompt:** For each unique material name discovered, the UI prompts the user to define the manufacturing path:
  * *"Is [Material Name] Pre-Laid Up (Stock Sheet) or In-House Lay-Up?"*
* **Dynamic Variable Assigments:**
  * **Pre-Laid Up (Stock):** Flagged as a direct-to-machine run. Spray booth material stack fields are omitted on the output dataset.
  * **In-House Lay-Up:** Flagged for spray booth processing. The app couples the core substrate with its respective face veneer and backer dimensions pulled from the sheet text[cite: 7].

---

## 3. SQLite Database Layer
To prevent file-locking corruption across multiple concurrent network workstations, the application bypasses embedded office databases and network servers by decoupling storage per project folder.

* **Database Generation Rule:** On initialization of a new project scan, the app builds a standalone SQLite database file named `project_data.db` directly inside the user's pasted folder path on the network drive.
* **Schema Blueprint:**

### Table 1: `project_metadata`
* `job_number` (TEXT, Primary Key)[cite: 7]
* `project_name` (TEXT)[cite: 7]
* `date_processed` (TEXT)
* `operator_name` (TEXT)

### Table 2: `material_summary`
* `id` (INTEGER, Primary Key Autoincrement)
* `material_name` (TEXT)[cite: 3, 4]
* `machine_type` (TEXT)[cite: 7]
* `layup_required` (INTEGER) (0 = False, 1 = True)
* `face_material` (TEXT, Nullable)[cite: 7]
* `core_substrate` (TEXT, Nullable)[cite: 7]
* `backer_material` (TEXT, Nullable)[cite: 7]
* `final_length` (REAL)[cite: 6]
* `final_width` (REAL)[cite: 6]
* `raw_max_x` (REAL)
* `raw_max_y` (REAL)

---

## 4. LibreOffice Base Report Connector
* **Workstation Ingestion Tool:** Individual shop workstations utilize their own local copy of LibreOffice to execute reports.
* **ODBC Pipeline:** The LibreOffice Base file (`.odb`) is configured under the option **"Connect to an existing database"** → **ODBC**, targeting the network directory's localized `project_data.db` database.
* **Report Generation:** Data fields from `material_summary` are bound to LibreOffice Report Builder templates, sorted and filtered dynamically by `machine_type` and `layup_required` to generate standardized pull sheets on-demand across any terminal[cite: 7].