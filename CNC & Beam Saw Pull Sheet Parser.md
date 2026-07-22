# CNC & Beam Saw Pull Sheet Parser Specification

## Objective
To parse raw textual Pull Sheet data and map it to specific material routing classifications (Direct to CNC vs. Spray Booth Lay-up). This logic tracks quantities, substrates, sizes, and machine destinations to systematically verify material counts against nested cut sheets.

---

## 1. Material Routing Classifications

The data stream is split into two primary structural categories determined by contextual block headers:

### Category A: Direct-to-Machine (Standard Materials)
These materials skip the spray booth entirely and go directly to a CNC router or beam saw for breakdown. They are typically listed at the top of a machine group block[cite: 7].
* **Data Pattern:** `(Quantity) Thickness Material Type (Dimensions)`[cite: 7]
* *Example:* `(4) 3/4" Plywood (5x10)`[cite: 7]

### Category B: Spray Booth Lay-Up Stacks
These materials represent raw assemblies requiring lamination or pressing prior to machining[cite: 7]. They are indicated by headers containing the string `Spray Booth --> then [Machine Name]`[cite: 7].
* **Data Pattern:** A multi-tier stack defining three elements[cite: 7]:
  1. **Top/Face Tier:** The face veneer or laminate matching the face requirement on the nested cut sheet[cite: 7].
  2. **Middle/Core Tier:** The substrate or core material (e.g., `PB` for Particle Board)[cite: 7].
  3. **Bottom/Backer Tier:** The balancing backer layer (e.g., `BKR` or a matching laminate face)[cite: 7].

---

## 2. Structural Parsing Matrix by Target Block

### 1. Header Isolation
Identify the machine routing envelope and processing method using categorical string matching[cite: 7]:
* `Homag` $\rightarrow$ Direct Homag CNC Processing[cite: 7]
* `Spray Booth --> then Homag` $\rightarrow$ Custom Lay-up processed on Homag Router[cite: 7]
* `Spray Booth --> then Beam Saw` $\rightarrow$ Custom Lay-up processed on Holzher Beam Saw[cite: 7]

### 2. Multi-Tier Lay-Up Stack Processing
When parsing within a `Spray Booth` category block, the tracking engine captures information across structural clusters[cite: 7]:

| Data Target | Extraction Target | Matching Rule | Example from Source |
| :--- | :--- | :--- | :--- |
| **Quantity** | Leftmost value parenthesized or solitary | Applied to the entire contiguous stack block | `(1)`[cite: 7] |
| **Thickness & Sheet Size** | Rightmost stacked text fields | Denotes required raw template footprint (Standard or Custom sizes) | `1-1/8" (5x10)` or `3/4" (46"x79")`[cite: 7] |
| **Face Material** | Top element of the laminate group | Must match the `Material:` tag on corresponding nested cut sheets | `WA NATURAL RECON/7996-38`[cite: 7] |
| **Substrate Core** | Middle element of the laminate group | Dictates structural core configuration | `PB` (Particle Board)[cite: 7] |
| **Backer Material** | Bottom element of the laminate group | Dictates balancing backer material layer | `BKR` or matching face code[cite: 7] |

---

## 3. Dimensions & Unit Standarization

To reconcile Pull Sheet sizing definitions with native `.mpr`, `.hop`, and `.cpout` machine limits, apply a normalization filter[cite: 3, 5, 6, 7]:

* **Foot-to-Inch Conversions:** Multipliers written as standard dimensional formats must be converted to nominal inches[cite: 7]:
  * `5x10` $\rightarrow$ `61" x 121"` or `60" x 120"` standard material bounds[cite: 7, 8, 10].
  * `4x8` $\rightarrow$ `48" x 96"` standard material bounds[cite: 7, 9, 10].
* **Explicit Inch Formatting:** Maintain custom boundary bounds explicitly when provided[cite: 7]:
  * `(46"x79")` $\rightarrow$ Map directly to custom size boundaries for offcut comparison[cite: 7].

---

## 4. Expected Data Object Output
For every parsed item inside a `Spray Booth` sequence, generate a structured payload[cite: 7]:

```json
{
  "routing_destination": "Beam Saw",
  "layup_required": true,
  "quantity": 1,
  "dimensions": {
    "nominal": "50x37",
    "length_in": 50.0,
    "width_in": 37.0
  },
  "stack_composition": {
    "face": "WA NATURAL RECON/7996-38",
    "core": "PB",
    "backer": "WA NATURAL RECON/7996-38"
  }
}