# CNC & Beam Saw Toolpath Bounding Box Extractor Specification

## Objective
To eliminate the manual "nest → check → resize → re-nest" workflow in design software. This logic parses raw Homag/Weeke (`.mpr`), Holzher (`.hop`), and Holzher Beam Saw (`.cpout`) files to dynamically extract the maximum footprint of nested parts[cite: 3, 5, 6]. It calculates and outputs the precise, minimum raw offcut size required by shop floor operators, eliminating unnecessary full-sheet breakdowns.

---

## 1. Global Setup & Variables
Define a configurable padding variable to ensure parts are not placed too close to raw material edges for clamping, squaring, saw-cuts, and tool clearances.
* `SHOP_CLEARANCE = 2.0` (Default value in inches)

---

## 2. File Parsing Logic by Machine Type

### Option A: Homag / Weeke Router (`.mpr`)
1. **Extract Raw Sheet Capacity (Ceiling):** 
   * Read the `[001` header block[cite: 3].
   * Capture `l="..."` (Length) and `w="..."` (Width)[cite: 3].
   * Convert values from millimeters to inches ($\text{mm} \div 25.4$) to establish `RAW_MAX_X` and `RAW_MAX_Y`[cite: 3].
2. **Track Toolpaths:**
   * Target the main routing block (typically `]2` preceding a `<105 \Konturfraesen\` definition)[cite: 3].
   * Scan all lines beginning with **`KL`**[cite: 3].
   * Parse and convert all **`X=...`** and **`Y=...`** coordinates from mm to inches[cite: 3].

### Option B: Holzher Dynestic Router (`.hop`)
1. **Extract Raw Sheet Capacity (Ceiling):**
   * Read the variables explicitly defined in the `VARS` block[cite: 5].
   * Capture `DX := ...` (Dimension X) and `DY := ...` (Dimension Y)[cite: 5]. 
   * These numbers are native in inches. Store them as `RAW_MAX_X` and `RAW_MAX_Y`[cite: 5].
2. **Track Toolpaths:**
   * Scan all geometry blocks starting after the `START` flag[cite: 5].
   * Extract coordinates from lines beginning with **`DRILLING`**, **`SP`**, and motion codes like **`G01`** or **`G02R`**[cite: 5].
   * Grab the first two comma-separated numbers inside the parentheses: index 1 is `X`, index 2 is `Y`[cite: 5].

### Option C: Holzher Beam Saw (`.cpout` / `.cpl`)
1. **Extract Raw Sheet Capacity (Ceiling):**
   * Scan lines beginning with **`INV1`** (Inventory Sheet Definition)[cite: 6].
   * Grab the 4th and 5th comma-separated values for the sheet boundaries: index 4 is `RAW_MAX_Y` (Width) and index 5 is `RAW_MAX_X` (Length)[cite: 6].
2. **Track Nested Parts:**
   * Scan lines beginning with **`ORD1`** (Order Part Requirements)[cite: 6].
   * Grab the 3rd and 4th comma-separated numbers: index 3 is `Length`, index 4 is `Width`[cite: 6].
3. **Determine Footprint Array:**
   * Because a beam saw rips completely through a sheet, the application must compute the total cumulative space required by the stacked part layout[cite: 6].
   * `Net Length = MAX(All ORD1 Lengths associated with that specific Sheet sequence)`[cite: 6]
   * `Net Width = SUM(All ORD1 Widths associated with that specific Sheet sequence)`[cite: 6]

---

## 3. Core Calculations & Clamping Rules

Once the absolute minimum and maximum values are established via file parsing, execute the sizing calculations[cite: 3, 5, 6]:

### Step 1: Find the Net Part Footprint
* **For Routers (`.mpr` / `.hop`):**[cite: 3, 5]
  $$\text{Net Length} = \max(X) - \min(X)$$
  $$\text{Net Width} = \max(Y) - \min(Y)$$
* **For Beam Saws (`.cpout`):**[cite: 6]
  $$\text{Net Length} = \text{Net Length extracted via ORD1}$$
  $$\text{Net Width} = \text{Net Width extracted via ORD1}$$

### Step 2: Apply Padding & Hard Boundary Clamping
To prevent the recommended size from exceeding the actual maximum material dimension (e.g., when a nest utilizes the full standard width of a sheet), wrap the final output in a clamp function[cite: 4, 5]:

```python
# Calculate size with shop clearance added
recommended_length = Net_Length + SHOP_CLEARANCE
recommended_width  = Net_Width + SHOP_CLEARANCE

# Enforce raw material limits as absolute maximum ceilings
if recommended_length > RAW_MAX_X:
    recommended_length = RAW_MAX_X

if recommended_width > RAW_MAX_Y:
    recommended_width = RAW_MAX_Y