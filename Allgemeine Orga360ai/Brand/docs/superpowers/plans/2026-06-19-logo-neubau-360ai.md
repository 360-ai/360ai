# 360ai Logo Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new `Logo_Neubau_360ai/` folder containing a 1:1-near pure-vector 360ai SVG, a matching `ThreesixtyAI` wordmark proposal, PNG previews, and a comparison HTML file.

**Architecture:** Use the existing pure-vector 360ai source as the canonical 1:1 basis instead of retracing the raster PNG. Create the `ThreesixtyAI` proposal as a self-contained SVG wordmark with the same gradient family and rounded typography. Use Chrome Headless only for preview PNG generation; the source SVGs remain independent of Chrome.

**Tech Stack:** SVG, HTML/CSS, PowerShell, Chrome Headless for PNG previews, Git for scoped commits.

---

## File Structure

- Create: `Allgemeine Orga360ai/Brand/Logo_Neubau_360ai/360ai-logo-1zu1.svg`
  - Responsibility: pure-vector 360ai logo copied from the closest existing vector source.
- Create: `Allgemeine Orga360ai/Brand/Logo_Neubau_360ai/threesixtyai-logo-vorschlag.svg`
  - Responsibility: self-contained SVG wordmark proposal for `ThreesixtyAI`.
- Create: `Allgemeine Orga360ai/Brand/Logo_Neubau_360ai/preview.html`
  - Responsibility: visual side-by-side comparison of the original PNG, rebuilt 360ai SVG, and ThreesixtyAI proposal.
- Create: `Allgemeine Orga360ai/Brand/Logo_Neubau_360ai/README.md`
  - Responsibility: short usage and provenance notes.
- Generate: `Allgemeine Orga360ai/Brand/Logo_Neubau_360ai/360ai-logo-1zu1-preview.png`
  - Responsibility: quick bitmap preview of the rebuilt 360ai SVG.
- Generate: `Allgemeine Orga360ai/Brand/Logo_Neubau_360ai/threesixtyai-logo-vorschlag-preview.png`
  - Responsibility: quick bitmap preview of the ThreesixtyAI proposal.

## Task 1: Create Result Folder and 1:1 360ai Vector

**Files:**
- Create: `Allgemeine Orga360ai/Brand/Logo_Neubau_360ai/360ai-logo-1zu1.svg`
- Read: `Allgemeine Orga360ai/Brand/Rebranding/360ai_logo_vektor.svg`

- [ ] **Step 1: Create the output folder**

Run from `C:\Users\Ai Automations\Documents\360ai\Allgemeine Orga360ai\Brand`:

```powershell
New-Item -ItemType Directory -Force -Path 'Logo_Neubau_360ai'
```

Expected: the folder exists and no existing files under `Logo/` or `Rebranding/` are modified.

- [ ] **Step 2: Copy the closest pure-vector 360ai SVG**

Run:

```powershell
Copy-Item -LiteralPath 'Rebranding\360ai_logo_vektor.svg' -Destination 'Logo_Neubau_360ai\360ai-logo-1zu1.svg' -Force
```

Expected: `Logo_Neubau_360ai\360ai-logo-1zu1.svg` exists.

- [ ] **Step 3: Verify the copied SVG is not a raster wrapper**

Run:

```powershell
Select-String -LiteralPath 'Logo_Neubau_360ai\360ai-logo-1zu1.svg' -Pattern '<image|data:image|base64'
```

Expected: no matches.

- [ ] **Step 4: Commit the 360ai vector copy**

Run from `C:\Users\Ai Automations\Documents\360ai`:

```powershell
git add -- "Allgemeine Orga360ai/Brand/Logo_Neubau_360ai/360ai-logo-1zu1.svg"
git commit -m "feat: add rebuilt 360ai vector logo"
```

Expected: one new SVG file committed.

## Task 2: Add ThreesixtyAI Wordmark SVG

**Files:**
- Create: `Allgemeine Orga360ai/Brand/Logo_Neubau_360ai/threesixtyai-logo-vorschlag.svg`

- [ ] **Step 1: Create the wordmark SVG**

Create `Logo_Neubau_360ai/threesixtyai-logo-vorschlag.svg` with this content:

```svg
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="520" viewBox="0 0 2400 520" role="img" aria-labelledby="title desc">
  <title id="title">ThreesixtyAI logo proposal</title>
  <desc id="desc">Rounded wordmark in the 360ai lavender blue to mint teal gradient style.</desc>
  <defs>
    <linearGradient id="threesixtyGradient" x1="80" y1="0" x2="2320" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#B7B8E0"/>
      <stop offset="0.18" stop-color="#AAA8DA"/>
      <stop offset="0.36" stop-color="#8CB7D9"/>
      <stop offset="0.56" stop-color="#9EC5D7"/>
      <stop offset="0.76" stop-color="#7CCBC8"/>
      <stop offset="1" stop-color="#A5D5CC"/>
    </linearGradient>
    <linearGradient id="softHighlight" x1="0" y1="95" x2="0" y2="360" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.34"/>
      <stop offset="0.52" stop-color="#FFFFFF" stop-opacity="0.10"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
    <filter id="softShadow" x="-5%" y="-20%" width="110%" height="150%">
      <feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#7397A8" flood-opacity="0.12"/>
    </filter>
    <mask id="wordMask">
      <rect width="2400" height="520" fill="black"/>
      <text x="78" y="336"
            font-family="Segoe UI, Arial Rounded MT Bold, Nunito, Quicksand, Arial, sans-serif"
            font-size="286"
            font-weight="800"
            fill="white">Threesixty</text>
      <text x="1786" y="336"
            font-family="Segoe UI, Arial Rounded MT Bold, Nunito, Quicksand, Arial, sans-serif"
            font-size="286"
            font-weight="900"
            fill="white">AI</text>
    </mask>
  </defs>

  <g filter="url(#softShadow)">
    <rect x="0" y="0" width="2400" height="520" fill="url(#threesixtyGradient)" mask="url(#wordMask)"/>
    <rect x="0" y="0" width="2400" height="240" fill="url(#softHighlight)" mask="url(#wordMask)"/>
  </g>

  <path d="M2058 120 C2162 120 2240 198 2240 302 C2240 406 2162 484 2058 484 C1954 484 1876 406 1876 302 C1876 198 1954 120 2058 120 Z"
        fill="#7CCBC8" opacity="0.06"/>
  <path d="M78 390 C430 430 720 418 1008 386 C1296 354 1588 344 1910 386"
        fill="none" stroke="#FFFFFF" stroke-width="16" stroke-linecap="round" opacity="0.16"/>
</svg>
```

Expected: the file exists and renders as a single-line `ThreesixtyAI` wordmark.

- [ ] **Step 2: Verify the wordmark SVG is self-contained and has no embedded raster**

Run:

```powershell
Select-String -LiteralPath 'Logo_Neubau_360ai\threesixtyai-logo-vorschlag.svg' -Pattern '<image|data:image|base64'
```

Expected: no matches.

- [ ] **Step 3: Commit the wordmark SVG**

Run from `C:\Users\Ai Automations\Documents\360ai`:

```powershell
git add -- "Allgemeine Orga360ai/Brand/Logo_Neubau_360ai/threesixtyai-logo-vorschlag.svg"
git commit -m "feat: add ThreesixtyAI wordmark proposal"
```

Expected: one new SVG file committed.

## Task 3: Add Comparison HTML and README

**Files:**
- Create: `Allgemeine Orga360ai/Brand/Logo_Neubau_360ai/preview.html`
- Create: `Allgemeine Orga360ai/Brand/Logo_Neubau_360ai/README.md`

- [ ] **Step 1: Create `preview.html`**

Create `Logo_Neubau_360ai/preview.html` with this content:

```html
<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>360ai Logo Neubau Preview</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #1f2633;
      --muted: #687386;
      --line: #dbe3ea;
      --paper: #f7f8fb;
      --panel: #ffffff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--paper);
      color: var(--ink);
      font-family: Segoe UI, Arial, sans-serif;
    }
    main {
      width: min(1180px, calc(100% - 48px));
      margin: 0 auto;
      padding: 38px 0 56px;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 28px;
      font-weight: 760;
      letter-spacing: 0;
    }
    p {
      margin: 0;
      color: var(--muted);
      line-height: 1.55;
    }
    .grid {
      display: grid;
      gap: 18px;
      margin-top: 28px;
    }
    .row {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 18px;
    }
    .label {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 14px;
      color: var(--muted);
      font-size: 13px;
      font-weight: 650;
      text-transform: uppercase;
      letter-spacing: .04em;
    }
    .logo-stage {
      min-height: 180px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
      background:
        linear-gradient(45deg, rgba(31,38,51,.045) 25%, transparent 25%),
        linear-gradient(-45deg, rgba(31,38,51,.045) 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, rgba(31,38,51,.045) 75%),
        linear-gradient(-45deg, transparent 75%, rgba(31,38,51,.045) 75%);
      background-size: 22px 22px;
      background-position: 0 0, 0 11px, 11px -11px, -11px 0;
      overflow: hidden;
    }
    img, object {
      display: block;
      max-width: 100%;
      max-height: 220px;
    }
    .threesixty img {
      max-height: 170px;
    }
  </style>
</head>
<body>
  <main>
    <h1>360ai Logo-Neubau</h1>
    <p>Vergleich der PNG-Referenz, der 1:1-nahen SVG-Vektorversion und des neuen ThreesixtyAI-Wortmarken-Vorschlags.</p>

    <section class="grid" aria-label="Logo-Vergleich">
      <article class="row">
        <div class="label"><span>Referenz</span><span>Logo/LogoOhneHintergrund.png</span></div>
        <div class="logo-stage">
          <img src="../Logo/LogoOhneHintergrund.png" alt="360ai PNG Referenz">
        </div>
      </article>

      <article class="row">
        <div class="label"><span>Neubau</span><span>360ai-logo-1zu1.svg</span></div>
        <div class="logo-stage">
          <img src="360ai-logo-1zu1.svg" alt="360ai SVG Neubau">
        </div>
      </article>

      <article class="row threesixty">
        <div class="label"><span>Vorschlag</span><span>threesixtyai-logo-vorschlag.svg</span></div>
        <div class="logo-stage">
          <img src="threesixtyai-logo-vorschlag.svg" alt="ThreesixtyAI Wortmarke">
        </div>
      </article>
    </section>
  </main>
</body>
</html>
```

Expected: opening `Logo_Neubau_360ai/preview.html` shows all three logo rows.

- [ ] **Step 2: Create `README.md`**

Create `Logo_Neubau_360ai/README.md` with this content:

```markdown
# Logo_Neubau_360ai

Dieser Ordner enthaelt neue Logo-Artefakte fuer 360ai.

## Dateien

- `360ai-logo-1zu1.svg`: 1:1-nahe reine SVG-Vektorversion auf Basis von `Rebranding/360ai_logo_vektor.svg`.
- `360ai-logo-1zu1-preview.png`: schnelle PNG-Vorschau des SVGs.
- `threesixtyai-logo-vorschlag.svg`: Wortmarken-Vorschlag fuer `ThreesixtyAI` im 360ai-Stil.
- `threesixtyai-logo-vorschlag-preview.png`: schnelle PNG-Vorschau der Wortmarke.
- `preview.html`: Vergleichsansicht mit der PNG-Referenz und den neuen SVGs.

## Hinweise

Die finalen SVG-Dateien enthalten keine eingebetteten Rasterbilder als Hauptlogo. Die vorhandenen Dateien in `Logo/` und `Rebranding/` wurden nicht veraendert.
```

Expected: README documents provenance and usage.

- [ ] **Step 3: Commit preview HTML and README**

Run from `C:\Users\Ai Automations\Documents\360ai`:

```powershell
git add -- "Allgemeine Orga360ai/Brand/Logo_Neubau_360ai/preview.html" "Allgemeine Orga360ai/Brand/Logo_Neubau_360ai/README.md"
git commit -m "docs: add logo rebuild preview notes"
```

Expected: two text files committed.

## Task 4: Generate PNG Previews

**Files:**
- Generate: `Allgemeine Orga360ai/Brand/Logo_Neubau_360ai/360ai-logo-1zu1-preview.png`
- Generate: `Allgemeine Orga360ai/Brand/Logo_Neubau_360ai/threesixtyai-logo-vorschlag-preview.png`

- [ ] **Step 1: Render both SVGs with Chrome Headless**

Run from `C:\Users\Ai Automations\Documents\360ai\Allgemeine Orga360ai\Brand`:

```powershell
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$outDir = (Resolve-Path 'Logo_Neubau_360ai').Path
$logoSvg = (Resolve-Path 'Logo_Neubau_360ai\360ai-logo-1zu1.svg').Path.Replace('\','/')
$wordSvg = (Resolve-Path 'Logo_Neubau_360ai\threesixtyai-logo-vorschlag.svg').Path.Replace('\','/')
& $chrome --headless=new --disable-gpu --screenshot="$outDir\360ai-logo-1zu1-preview.png" --window-size=1600,620 "file:///$logoSvg"
& $chrome --headless=new --disable-gpu --screenshot="$outDir\threesixtyai-logo-vorschlag-preview.png" --window-size=1600,420 "file:///$wordSvg"
```

Expected: both commands exit with code `0`, and both PNG files are created in `Logo_Neubau_360ai/`.

- [ ] **Step 2: Verify PNG files are non-empty**

Run:

```powershell
Get-Item 'Logo_Neubau_360ai\360ai-logo-1zu1-preview.png','Logo_Neubau_360ai\threesixtyai-logo-vorschlag-preview.png' | Select-Object Name, Length
```

Expected: both files have `Length` greater than `10000`.

- [ ] **Step 3: Commit PNG previews**

Run from `C:\Users\Ai Automations\Documents\360ai`:

```powershell
git add -- "Allgemeine Orga360ai/Brand/Logo_Neubau_360ai/360ai-logo-1zu1-preview.png" "Allgemeine Orga360ai/Brand/Logo_Neubau_360ai/threesixtyai-logo-vorschlag-preview.png"
git commit -m "chore: add logo preview renders"
```

Expected: two PNG preview files committed.

## Task 5: Final Validation

**Files:**
- Validate: `Allgemeine Orga360ai/Brand/Logo_Neubau_360ai/360ai-logo-1zu1.svg`
- Validate: `Allgemeine Orga360ai/Brand/Logo_Neubau_360ai/threesixtyai-logo-vorschlag.svg`
- Validate: `Allgemeine Orga360ai/Brand/Logo_Neubau_360ai/preview.html`

- [ ] **Step 1: Verify no raster embedding in final SVGs**

Run from `C:\Users\Ai Automations\Documents\360ai\Allgemeine Orga360ai\Brand`:

```powershell
Select-String -LiteralPath 'Logo_Neubau_360ai\360ai-logo-1zu1.svg','Logo_Neubau_360ai\threesixtyai-logo-vorschlag.svg' -Pattern '<image|data:image|base64'
```

Expected: no matches.

- [ ] **Step 2: Verify expected files exist**

Run:

```powershell
Test-Path 'Logo_Neubau_360ai\360ai-logo-1zu1.svg','Logo_Neubau_360ai\360ai-logo-1zu1-preview.png','Logo_Neubau_360ai\threesixtyai-logo-vorschlag.svg','Logo_Neubau_360ai\threesixtyai-logo-vorschlag-preview.png','Logo_Neubau_360ai\preview.html','Logo_Neubau_360ai\README.md'
```

Expected: six `True` values.

- [ ] **Step 3: Verify original source folders were not modified**

Run from `C:\Users\Ai Automations\Documents\360ai`:

```powershell
git status --short -- "Allgemeine Orga360ai/Brand/Logo" "Allgemeine Orga360ai/Brand/Rebranding"
```

Expected: no changes caused by this implementation.

- [ ] **Step 4: Inspect the previews visually**

Open or view these files:

```text
C:\Users\Ai Automations\Documents\360ai\Allgemeine Orga360ai\Brand\Logo_Neubau_360ai\360ai-logo-1zu1-preview.png
C:\Users\Ai Automations\Documents\360ai\Allgemeine Orga360ai\Brand\Logo_Neubau_360ai\threesixtyai-logo-vorschlag-preview.png
C:\Users\Ai Automations\Documents\360ai\Allgemeine Orga360ai\Brand\Logo_Neubau_360ai\preview.html
```

Expected: the 360ai SVG is visually very close to the PNG reference, and the ThreesixtyAI mark clearly shares the same palette and rounded visual language.

- [ ] **Step 5: Final scoped status check**

Run from `C:\Users\Ai Automations\Documents\360ai`:

```powershell
git status --short -- "Allgemeine Orga360ai/Brand/Logo_Neubau_360ai" "Allgemeine Orga360ai/Brand/docs/superpowers/plans/2026-06-19-logo-neubau-360ai.md"
```

Expected: no unstaged or staged changes for the created artifact folder after commits, except this plan file if it has not been committed.

## Self-Review

- Spec coverage: The plan creates the requested result folder, a 1:1-near pure-vector 360ai SVG, a ThreesixtyAI wordmark proposal, PNG previews, and a comparison HTML file. It preserves `Logo/` and `Rebranding/`.
- Placeholder scan: The plan contains no unresolved placeholder markers.
- Consistency: File names match the approved spec and all commands use the same paths.
