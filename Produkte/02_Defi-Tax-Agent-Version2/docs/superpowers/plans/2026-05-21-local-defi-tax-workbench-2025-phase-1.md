# Local DeFi Tax Workbench 2025 Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local 2025 CoinTracking correction workbench that audits the available reports, persists correction work, explains findings, and generates placeholder-aware correction CSV drafts.

**Architecture:** Start a new FastAPI application in the current `02_Defi-Tax-Agent-Version2` workspace with a standard-library CSV audit core and SQLite persistence. Serve a focused static frontend from the same local backend so the first usable surface is the 2025 correction board; keep parser, audit, suggestion, persistence, and CoinTracking CSV draft responsibilities separated so the 2026 import work can reuse them.

**Tech Stack:** Python 3.12+, FastAPI, Pydantic, standard-library `csv` and `sqlite3`, pytest, FastAPI TestClient, vanilla HTML/CSS/JavaScript

---

## Scope Check

The approved design covers two working subsystems:

1. 2025 CoinTracking report correction and recheck.
2. 2026 DeFi source import through a Hybrid Inbox.

This plan implements the urgent first subsystem and only the reusable app foundation needed for it. The 2026 Hybrid Inbox, API connectors, and DeFi source profiles get a follow-up plan after the 2025 board can load the current reports and create correction drafts.

## File Structure

### Files to create

- `pyproject.toml`: local Python package metadata, dependencies, and pytest settings
- `.gitignore`: excludes local databases, runtime folders, secrets, and browser scratch state
- `app/__init__.py`: marks the backend package
- `app/main.py`: FastAPI app, static frontend routes, and 2025 API endpoints
- `app/models.py`: typed report, finding, note, suggestion, and CSV draft models
- `app/storage.py`: SQLite schema and CRUD for finding work state and correction drafts
- `app/services/__init__.py`: marks the focused backend service package
- `app/services/report_bundle.py`: report type detection and CoinTracking CSV parsing
- `app/services/audit_2025.py`: 2025 audit rules and finding generation
- `app/services/suggestions.py`: deterministic correction guidance for 2025 findings
- `app/services/correction_csv.py`: correction draft row creation and placeholder validation
- `app/static/index.html`: local 2025 workbench shell and year switcher placeholder
- `app/static/styles.css`: restrained work-console styling
- `app/static/app.js`: frontend state loading, finding detail editing, and draft preview
- `tests/conftest.py`: app and temporary database fixtures
- `tests/test_app_shell.py`: shell route and health endpoint coverage
- `tests/test_report_bundle.py`: report parsing and report type detection coverage
- `tests/test_audit_2025.py`: hard-finding and secondary-warning rule coverage
- `tests/test_storage.py`: local finding status and draft persistence coverage
- `tests/test_correction_csv.py`: suggestion and correction-draft placeholder coverage
- `tests/test_api_2025.py`: board API integration coverage
- `tests/test_real_2025_reports.py`: local verification against `CT Berichtsdaten 2025` when present

### Existing files to read during implementation

- `docs/superpowers/specs/2026-05-21-local-defi-tax-workbench-design.md`
- `CT Berichtsdaten 2025/CoinTracking - Capital Gains Report.csv`
- `CT Berichtsdaten 2025/CoinTracking - Closing Position Report.csv`
- `CT Berichtsdaten 2025/CoinTracking - Income Report.csv`
- `CT Berichtsdaten 2025/CoinTracking - Fee Report.csv`
- `../02_CoinTracking-Tax/TAX_RECHNER_WISSEN_FUER_STEUERBERATER.md`
- `../02_CoinTracking-Tax/docs/steuererklaerung-2025-pruefliste.md`

### Boundary choices

- `report_bundle.py` owns CSV/header handling. Audit rules do not read raw files.
- `audit_2025.py` owns findings. Frontend code does not infer report correctness.
- `storage.py` owns SQLite. API handlers do not inline SQL.
- `suggestions.py` explains findings without creating CSV text.
- `correction_csv.py` creates and validates CoinTracking correction drafts.
- `app/static` stays small and 2025-specific in this phase; 2026 can reuse the shell rather than force an early frontend framework.

## Task 1: Scaffold the Local FastAPI App and Shell

**Files:**
- Create: `.gitignore`
- Create: `pyproject.toml`
- Create: `app/__init__.py`
- Create: `app/main.py`
- Create: `app/static/index.html`
- Create: `app/static/styles.css`
- Create: `app/static/app.js`
- Create: `tests/conftest.py`
- Create: `tests/test_app_shell.py`

- [ ] **Step 1: Write the failing app-shell test**

```python
# tests/test_app_shell.py
def test_health_endpoint_reports_local_workbench(client):
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"ok": True, "app": "Local DeFi Tax Workbench"}


def test_index_serves_year_choice_shell(client):
    response = client.get("/")

    assert response.status_code == 200
    assert "2025 pruefen" in response.text
    assert "2026 importieren" in response.text
```

- [ ] **Step 2: Add the initial app fixture that imports the not-yet-created app**

```python
# tests/conftest.py
import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture()
def client(tmp_path):
    app = create_app(db_path=tmp_path / "workbench.sqlite3")
    return TestClient(app)
```

- [ ] **Step 3: Run the shell tests to verify they fail**

Run:

```powershell
python -m pytest tests/test_app_shell.py -v
```

Expected: FAIL because `app.main` does not exist yet.

- [ ] **Step 4: Add package metadata and pytest configuration**

```toml
# pyproject.toml
[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[project]
name = "local-defi-tax-workbench"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
  "fastapi>=0.115",
  "pydantic>=2.10",
  "python-multipart>=0.0.20",
  "uvicorn[standard]>=0.34",
]

[project.optional-dependencies]
dev = [
  "httpx>=0.28",
  "pytest>=8.3",
]

[tool.pytest.ini_options]
testpaths = ["tests"]
```

- [ ] **Step 5: Add local ignore rules before runtime files appear**

```gitignore
# .gitignore
.venv/
__pycache__/
.pytest_cache/
.superpowers/
local_data/
*.sqlite3
*.db
*.secrets.json
CT Berichtsdaten 2025/
```

- [ ] **Step 6: Install the local package with test dependencies**

Run:

```powershell
python -m pip install -e ".[dev]"
```

Expected: the local workbench package and pytest/FastAPI dependencies install in the active Python environment.

- [ ] **Step 7: Implement the minimal FastAPI shell**

```python
# app/main.py
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles


STATIC_DIR = Path(__file__).parent / "static"


def create_app(db_path: Path | None = None) -> FastAPI:
    app = FastAPI(title="Local DeFi Tax Workbench", version="0.1.0")
    app.state.db_path = db_path or Path("local_data/workbench.sqlite3")
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

    @app.get("/")
    def index():
        return FileResponse(STATIC_DIR / "index.html")

    @app.get("/api/health")
    def health():
        return {"ok": True, "app": "Local DeFi Tax Workbench"}

    return app


app = create_app()
```

```python
# app/__init__.py
"""Local DeFi tax workbench backend."""
```

- [ ] **Step 8: Add the smallest real year-choice page**

```html
<!-- app/static/index.html -->
<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Local DeFi Tax Workbench</title>
    <link rel="stylesheet" href="/static/styles.css">
  </head>
  <body>
    <main class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">Lokale Steuerarbeit</p>
          <h1>DeFi Tax Workbench</h1>
        </div>
        <span id="health" class="status">lokal</span>
      </header>
      <section class="year-switch" aria-label="Steuerjahr">
        <button id="year-2025" class="year-choice is-active">2025 pruefen</button>
        <button id="year-2026" class="year-choice">2026 importieren</button>
      </section>
      <section id="board" class="board" aria-live="polite"></section>
    </main>
    <script src="/static/app.js"></script>
  </body>
</html>
```

```css
/* app/static/styles.css */
:root {
  color-scheme: light;
  --bg: #f3f4f1;
  --ink: #152019;
  --muted: #5a675f;
  --line: #ccd4cd;
  --panel: #ffffff;
  --accent: #0f766e;
  --warn: #b45309;
  --danger: #b42318;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: Inter, "Segoe UI", Arial, sans-serif;
}

.shell { max-width: 1320px; margin: 0 auto; padding: 28px; }
.topbar, .year-switch { display: flex; justify-content: space-between; gap: 12px; }
.eyebrow { margin: 0; color: var(--accent); font-weight: 700; }
h1 { margin: 6px 0 0; font-size: 32px; letter-spacing: 0; }
.status, .year-choice {
  border: 1px solid var(--line);
  background: var(--panel);
  border-radius: 6px;
  padding: 10px 12px;
}
.year-switch { justify-content: flex-start; margin: 24px 0; }
.year-choice.is-active { border-color: var(--accent); color: var(--accent); }
.board {
  min-height: 360px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  padding: 20px;
}
```

```javascript
// app/static/app.js
const board = document.getElementById("board");
const health = document.getElementById("health");

board.innerHTML = "<h2>2025 Korrekturboard</h2><p>Reports laden wir im naechsten Schritt.</p>";

fetch("/api/health")
  .then((response) => response.json())
  .then((payload) => {
    health.textContent = payload.ok ? "bereit" : "offline";
  })
  .catch(() => {
    health.textContent = "offline";
  });
```

- [ ] **Step 9: Run the shell tests to verify they pass**

Run:

```powershell
python -m pytest tests/test_app_shell.py -v
```

Expected: PASS.

- [ ] **Step 10: Commit the scaffold**

```powershell
git add .gitignore pyproject.toml app tests
git commit -m "feat: scaffold local tax workbench"
```

## Task 2: Parse CoinTracking Report Bundles

**Files:**
- Create: `app/models.py`
- Create: `app/services/__init__.py`
- Create: `app/services/report_bundle.py`
- Create: `tests/test_report_bundle.py`

- [ ] **Step 1: Write failing report-bundle tests with small inline CSV samples**

```python
# tests/test_report_bundle.py
from app.services.report_bundle import parse_report_csv


CAPITAL = b"""Amount,Currency,Date Acquired,Date Sold,Short/Long,Buy /Input at,Sell /Output at,Type,Cost Basis in EUR,Proceeds in EUR,Gain/Loss in EUR
"0,00088291",ETH,05.04.2025,05.04.2025,Short (Warning),,S Transaction,Trade,"0,00000000","1,44248864","1,44248864"
"""

EMPTY_LOST = b"""Date of loss,Amount,Currency,Type,Lost at,Cost Basis Calculation,Cost Basis in EUR,Value at loss in EUR
"""


def test_parse_report_csv_detects_capital_gains_and_rows():
    report = parse_report_csv("CoinTracking - Capital Gains Report.csv", CAPITAL)

    assert report.report_type == "capital_gains"
    assert report.row_count == 1
    assert report.rows[0]["Short/Long"] == "Short (Warning)"


def test_parse_report_csv_treats_empty_special_report_as_valid():
    report = parse_report_csv("CoinTracking - Lost and Stolen Report.csv", EMPTY_LOST)

    assert report.report_type == "lost_and_stolen"
    assert report.row_count == 0
    assert report.headers[0] == "Date of loss"
```

- [ ] **Step 2: Run the parser tests to verify they fail**

Run:

```powershell
python -m pytest tests/test_report_bundle.py -v
```

Expected: FAIL because `app.services.report_bundle` does not exist.

- [ ] **Step 3: Define report and board-facing domain models**

```python
# app/models.py
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


ReportType = Literal[
    "capital_gains",
    "closing_position",
    "income",
    "fees",
    "gifts_and_donations",
    "lost_and_stolen",
    "unknown",
]


class ParsedReport(BaseModel):
    filename: str
    report_type: ReportType
    headers: list[str] = Field(default_factory=list)
    rows: list[dict[str, str]] = Field(default_factory=list)

    @property
    def row_count(self) -> int:
        return len(self.rows)


class ReportBundleSummary(BaseModel):
    reports: list[ParsedReport]

    def by_type(self, report_type: ReportType) -> ParsedReport | None:
        return next((report for report in self.reports if report.report_type == report_type), None)


class Finding(BaseModel):
    fingerprint: str
    severity: Literal["error", "warning", "info"]
    category: str
    title: str
    report_type: ReportType
    report_row: int | None = None
    data: dict[str, Any] = Field(default_factory=dict)


class FindingWorkState(BaseModel):
    fingerprint: str
    status: Literal["open", "corrected_in_cointracking", "documented", "recheck"] = "open"
    note: str = ""
    next_step: str = ""
    checked_at: datetime | None = None
    recheck_state: Literal["not_run", "still_present", "resolved"] = "not_run"
```

- [ ] **Step 4: Implement header cleanup and filename/header report detection**

```python
# app/services/__init__.py
"""Focused service modules for report audit and correction flows."""
```

```python
# app/services/report_bundle.py
from __future__ import annotations

import csv
from io import StringIO

from app.models import ParsedReport, ReportType


REPORT_NAME_HINTS: dict[str, ReportType] = {
    "capital gains": "capital_gains",
    "closing position": "closing_position",
    "income report": "income",
    "fee report": "fees",
    "gifts and donation": "gifts_and_donations",
    "lost and stolen": "lost_and_stolen",
}

REPORT_HEADER_HINTS: dict[str, ReportType] = {
    "short/long": "capital_gains",
    "year end value in eur": "closing_position",
    "value upon deposit in eur": "income",
    "trade id": "fees",
    "date of payout": "gifts_and_donations",
    "date of loss": "lost_and_stolen",
}


def parse_report_csv(filename: str, raw: bytes) -> ParsedReport:
    text = raw.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(StringIO(text))
    headers = [_clean_header(header) for header in (reader.fieldnames or [])]
    rows = [{_clean_header(key): value for key, value in row.items() if key is not None} for row in reader]
    report_type = detect_report_type(filename, headers)
    return ParsedReport(filename=filename, report_type=report_type, headers=headers, rows=rows)


def detect_report_type(filename: str, headers: list[str]) -> ReportType:
    lower_name = filename.lower()
    for hint, report_type in REPORT_NAME_HINTS.items():
        if hint in lower_name:
            return report_type
    normalized_headers = {header.lower() for header in headers}
    for hint, report_type in REPORT_HEADER_HINTS.items():
        if hint in normalized_headers:
            return report_type
    return "unknown"


def _clean_header(header: str) -> str:
    return header.replace("\u00a0", " ").strip()
```

- [ ] **Step 5: Run report-bundle tests to verify they pass**

Run:

```powershell
python -m pytest tests/test_report_bundle.py -v
```

Expected: PASS.

- [ ] **Step 6: Commit the report parser**

```powershell
git add app/models.py app/services/__init__.py app/services/report_bundle.py tests/test_report_bundle.py
git commit -m "feat: parse cointracking report bundles"
```

## Task 3: Audit 2025 Reports into Prioritized Findings

**Files:**
- Modify: `app/models.py`
- Create: `app/services/audit_2025.py`
- Create: `tests/test_audit_2025.py`

- [ ] **Step 1: Write failing audit tests for hard warnings and fee duplicate groups**

```python
# tests/test_audit_2025.py
from app.models import ParsedReport, ReportBundleSummary
from app.services.audit_2025 import audit_2025_bundle


def test_audit_prioritizes_short_warning_zero_cost_basis_rows():
    capital = ParsedReport(
        filename="CoinTracking - Capital Gains Report.csv",
        report_type="capital_gains",
        headers=[],
        rows=[{
            "Amount": "0,72153261",
            "Currency": "USDC",
            "Date Acquired": "10.10.2025",
            "Date Sold": "10.10.2025",
            "Short/Long": "Short (Warning)",
            "Sell /Output at": "Binance",
            "Type": "Trade",
            "Cost Basis in EUR": "0,00000000",
            "Proceeds in EUR": "0,62339358",
            "Gain/Loss in EUR": "0,62339358",
        }],
    )

    findings = audit_2025_bundle(ReportBundleSummary(reports=[capital]))

    assert findings[0].severity == "error"
    assert findings[0].category == "missing_cost_basis"
    assert findings[0].report_row == 2
    assert findings[0].data["currency"] == "USDC"


def test_audit_flags_similar_fee_groups_as_warning():
    fees = ParsedReport(
        filename="CoinTracking - Fee Report.csv",
        report_type="fees",
        headers=[],
        rows=[
            {"Fee date": "29.12.2025", "Amount": "2,43000000", "Currency": "ONDO", "Type": "Paid withdrawal fee of", "Transaction at": "Binance", "Trade ID": "a"},
            {"Fee date": "29.12.2025", "Amount": "2,43000000", "Currency": "ONDO", "Type": "Paid withdrawal fee of", "Transaction at": "Binance", "Trade ID": "b"},
        ],
    )

    findings = audit_2025_bundle(ReportBundleSummary(reports=[fees]))

    assert len(findings) == 1
    assert findings[0].severity == "warning"
    assert findings[0].category == "similar_fee_group"
```

- [ ] **Step 2: Run the audit tests to verify they fail**

Run:

```powershell
python -m pytest tests/test_audit_2025.py -v
```

Expected: FAIL because `audit_2025_bundle` does not exist.

- [ ] **Step 3: Add a board summary model**

```python
# append to app/models.py
class AuditSummary(BaseModel):
    report_counts: dict[str, int] = Field(default_factory=dict)
    findings: list[Finding] = Field(default_factory=list)
    error_count: int = 0
    warning_count: int = 0
```

- [ ] **Step 4: Implement the first audit rules**

```python
# app/services/audit_2025.py
from __future__ import annotations

from collections import defaultdict
from hashlib import sha1

from app.models import AuditSummary, Finding, ParsedReport, ReportBundleSummary


def build_2025_audit(bundle: ReportBundleSummary) -> AuditSummary:
    findings = audit_2025_bundle(bundle)
    report_counts = {report.report_type: report.row_count for report in bundle.reports}
    return AuditSummary(
        report_counts=report_counts,
        findings=findings,
        error_count=sum(finding.severity == "error" for finding in findings),
        warning_count=sum(finding.severity == "warning" for finding in findings),
    )


def audit_2025_bundle(bundle: ReportBundleSummary) -> list[Finding]:
    findings: list[Finding] = []
    capital = bundle.by_type("capital_gains")
    fees = bundle.by_type("fees")
    if capital:
        findings.extend(_capital_gains_findings(capital))
    if fees:
        findings.extend(_fee_findings(fees))
    severity_order = {"error": 0, "warning": 1, "info": 2}
    return sorted(findings, key=lambda finding: (severity_order[finding.severity], finding.report_row or 0))


def _capital_gains_findings(report: ParsedReport) -> list[Finding]:
    findings: list[Finding] = []
    for row_index, row in enumerate(report.rows, start=2):
        short_long = row.get("Short/Long", "")
        zero_cost = row.get("Cost Basis in EUR", "").strip() == "0,00000000"
        if "warning" not in short_long.lower() or not zero_cost:
            continue
        data = {
            "amount": row.get("Amount", ""),
            "currency": row.get("Currency", ""),
            "date_acquired": row.get("Date Acquired", ""),
            "date_sold": row.get("Date Sold", ""),
            "output_at": row.get("Sell /Output at", ""),
            "type": row.get("Type", ""),
            "cost_basis_eur": row.get("Cost Basis in EUR", ""),
            "proceeds_eur": row.get("Proceeds in EUR", ""),
            "gain_loss_eur": row.get("Gain/Loss in EUR", ""),
        }
        findings.append(
            Finding(
                fingerprint=_fingerprint("missing_cost_basis", row_index, data),
                severity="error",
                category="missing_cost_basis",
                title=f"Kostenbasis fehlt fuer {data['currency']} am {data['date_sold']}",
                report_type=report.report_type,
                report_row=row_index,
                data=data,
            )
        )
    return findings


def _fee_findings(report: ParsedReport) -> list[Finding]:
    grouped: dict[tuple[str, str, str, str, str], list[tuple[int, dict[str, str]]]] = defaultdict(list)
    for row_index, row in enumerate(report.rows, start=2):
        key = (
            row.get("Fee date", ""),
            row.get("Amount", ""),
            row.get("Currency", ""),
            row.get("Type", ""),
            row.get("Transaction at", ""),
        )
        grouped[key].append((row_index, row))

    findings: list[Finding] = []
    for key, rows in grouped.items():
        if len(rows) < 2:
            continue
        row_index, first = rows[0]
        data = {
            "fee_date": key[0],
            "amount": key[1],
            "currency": key[2],
            "type": key[3],
            "transaction_at": key[4],
            "trade_ids": [row.get("Trade ID", "") for _, row in rows],
            "count": len(rows),
        }
        findings.append(
            Finding(
                fingerprint=_fingerprint("similar_fee_group", row_index, data),
                severity="warning",
                category="similar_fee_group",
                title=f"{len(rows)} aehnliche Gebuehrenzeilen fuer {data['currency']}",
                report_type=report.report_type,
                report_row=row_index,
                data=data,
            )
        )
    return findings


def _fingerprint(category: str, row_index: int, data: dict) -> str:
    basis = f"{category}|{row_index}|{data}"
    return sha1(basis.encode("utf-8")).hexdigest()[:16]
```

- [ ] **Step 5: Run audit tests to verify they pass**

Run:

```powershell
python -m pytest tests/test_audit_2025.py -v
```

Expected: PASS.

- [ ] **Step 6: Add local-real-report regression coverage that does not commit private CSV data**

```python
# tests/test_real_2025_reports.py
from pathlib import Path

import pytest

from app.models import ReportBundleSummary
from app.services.audit_2025 import build_2025_audit
from app.services.report_bundle import parse_report_csv


REAL_REPORT_DIR = Path("CT Berichtsdaten 2025")
REAL_FILES = sorted(REAL_REPORT_DIR.glob("CoinTracking - *.csv"))

pytestmark = pytest.mark.skipif(not REAL_FILES, reason="local 2025 CoinTracking reports are not present")


def test_local_2025_reports_keep_expected_counts_and_hard_findings():
    reports = [parse_report_csv(path.name, path.read_bytes()) for path in REAL_FILES]
    audit = build_2025_audit(ReportBundleSummary(reports=reports))

    assert audit.report_counts["capital_gains"] == 164
    assert audit.report_counts["closing_position"] == 113
    assert audit.report_counts["income"] == 24
    assert audit.report_counts["fees"] == 89
    assert audit.report_counts["gifts_and_donations"] == 0
    assert audit.report_counts["lost_and_stolen"] == 0
    assert [finding for finding in audit.findings if finding.category == "missing_cost_basis"] == audit.findings[:5]
```

- [ ] **Step 7: Run the audit suite against inline and local reports**

Run:

```powershell
python -m pytest tests/test_audit_2025.py tests/test_real_2025_reports.py -v
```

Expected: PASS with the local report test active when `CT Berichtsdaten 2025` exists.

- [ ] **Step 8: Commit the 2025 audit rules**

```powershell
git add app/models.py app/services/audit_2025.py tests/test_audit_2025.py tests/test_real_2025_reports.py
git commit -m "feat: audit 2025 cointracking reports"
```

## Task 4: Persist Finding Work State in SQLite

**Files:**
- Create: `app/storage.py`
- Create: `tests/test_storage.py`
- Modify: `app/main.py`

- [ ] **Step 1: Write failing storage tests**

```python
# tests/test_storage.py
from datetime import datetime

from app.models import FindingWorkState
from app.storage import WorkbenchStore


def test_store_round_trips_finding_work_state(tmp_path):
    store = WorkbenchStore(tmp_path / "workbench.sqlite3")
    store.initialize()

    expected = FindingWorkState(
        fingerprint="abc123",
        status="documented",
        note="Transfer bewusst dokumentiert.",
        next_step="Neu exportieren",
        checked_at=datetime(2026, 5, 21, 10, 30),
        recheck_state="still_present",
    )

    store.save_work_state(expected)

    assert store.get_work_state("abc123") == expected


def test_store_returns_open_state_for_unknown_finding(tmp_path):
    store = WorkbenchStore(tmp_path / "workbench.sqlite3")
    store.initialize()

    state = store.get_work_state("new-finding")

    assert state.fingerprint == "new-finding"
    assert state.status == "open"
    assert state.recheck_state == "not_run"


def test_store_marks_recheck_results_against_current_fingerprints(tmp_path):
    store = WorkbenchStore(tmp_path / "workbench.sqlite3")
    store.initialize()
    store.save_work_state(FindingWorkState(fingerprint="still-here", status="recheck"))
    store.save_work_state(FindingWorkState(fingerprint="gone-now", status="recheck"))

    updated = store.mark_recheck_results({"still-here"})

    assert {state.fingerprint: state.recheck_state for state in updated} == {
        "still-here": "still_present",
        "gone-now": "resolved",
    }
```

- [ ] **Step 2: Run the storage tests to verify they fail**

Run:

```powershell
python -m pytest tests/test_storage.py -v
```

Expected: FAIL because `app.storage` does not exist.

- [ ] **Step 3: Implement the small SQLite work-state store**

```python
# app/storage.py
from __future__ import annotations

import sqlite3
from pathlib import Path

from app.models import FindingWorkState


class WorkbenchStore:
    def __init__(self, db_path: Path):
        self.db_path = Path(db_path)

    def initialize(self) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS finding_work_state (
                    fingerprint TEXT PRIMARY KEY,
                    status TEXT NOT NULL,
                    note TEXT NOT NULL,
                    next_step TEXT NOT NULL,
                    checked_at TEXT,
                    recheck_state TEXT NOT NULL
                )
                """
            )

    def get_work_state(self, fingerprint: str) -> FindingWorkState:
        with sqlite3.connect(self.db_path) as conn:
            row = conn.execute(
                """
                SELECT fingerprint, status, note, next_step, checked_at, recheck_state
                FROM finding_work_state
                WHERE fingerprint = ?
                """,
                (fingerprint,),
            ).fetchone()
        if row is None:
            return FindingWorkState(fingerprint=fingerprint)
        return FindingWorkState(
            fingerprint=row[0],
            status=row[1],
            note=row[2],
            next_step=row[3],
            checked_at=row[4],
            recheck_state=row[5],
        )

    def save_work_state(self, state: FindingWorkState) -> FindingWorkState:
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO finding_work_state (
                    fingerprint, status, note, next_step, checked_at, recheck_state
                ) VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(fingerprint) DO UPDATE SET
                    status = excluded.status,
                    note = excluded.note,
                    next_step = excluded.next_step,
                    checked_at = excluded.checked_at,
                    recheck_state = excluded.recheck_state
                """,
                (
                    state.fingerprint,
                    state.status,
                    state.note,
                    state.next_step,
                    state.checked_at.isoformat() if state.checked_at else None,
                    state.recheck_state,
                ),
            )
        return self.get_work_state(state.fingerprint)

    def mark_recheck_results(self, current_fingerprints: set[str]) -> list[FindingWorkState]:
        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute(
                "SELECT fingerprint FROM finding_work_state WHERE status = 'recheck'"
            ).fetchall()
            for (fingerprint,) in rows:
                recheck_state = "still_present" if fingerprint in current_fingerprints else "resolved"
                conn.execute(
                    "UPDATE finding_work_state SET recheck_state = ? WHERE fingerprint = ?",
                    (recheck_state, fingerprint),
                )
        return [self.get_work_state(fingerprint) for (fingerprint,) in rows]
```

- [ ] **Step 4: Initialize the store on app creation**

```python
# add inside create_app() in app/main.py
from app.storage import WorkbenchStore

store = WorkbenchStore(app.state.db_path)
store.initialize()
app.state.store = store
```

- [ ] **Step 5: Run storage and shell tests**

Run:

```powershell
python -m pytest tests/test_storage.py tests/test_app_shell.py -v
```

Expected: PASS.

- [ ] **Step 6: Commit local work-state persistence**

```powershell
git add app/main.py app/storage.py tests/test_storage.py
git commit -m "feat: persist correction work state"
```

## Task 5: Explain Findings and Generate Placeholder-Aware Correction Drafts

**Files:**
- Modify: `app/models.py`
- Modify: `app/storage.py`
- Create: `app/services/suggestions.py`
- Create: `app/services/correction_csv.py`
- Create: `tests/test_correction_csv.py`
- Modify: `tests/test_storage.py`

- [ ] **Step 1: Write failing tests for suggestions and draft CSV placeholders**

```python
# tests/test_correction_csv.py
from app.models import Finding
from app.services.correction_csv import build_missing_cost_basis_draft, draft_to_cointracking_csv
from app.services.suggestions import suggest_for_finding


def missing_basis_finding():
    return Finding(
        fingerprint="basis-eth",
        severity="error",
        category="missing_cost_basis",
        title="Kostenbasis fehlt fuer ETH",
        report_type="capital_gains",
        report_row=17,
        data={
            "amount": "0,00088291",
            "currency": "ETH",
            "date_sold": "05.04.2025",
            "output_at": "S Transaction",
        },
    )


def test_missing_cost_basis_suggestion_names_cointracking_checks():
    suggestion = suggest_for_finding(missing_basis_finding())

    assert suggestion.confidence == "medium"
    assert "Eingang" in suggestion.likely_cause
    assert any("CoinTracking" in step for step in suggestion.check_steps)


def test_missing_cost_basis_draft_is_not_import_ready_with_placeholders():
    draft = build_missing_cost_basis_draft(missing_basis_finding())
    csv_text = draft_to_cointracking_csv(draft)

    assert draft.import_ready is False
    assert "TODO_DATUM" in csv_text
    assert "TODO_KOSTENBASIS_HINWEIS" in csv_text
```

- [ ] **Step 2: Add the failing suggestion persistence test**

```python
# append to tests/test_storage.py
from app.models import Suggestion


def test_store_round_trips_saved_suggestion(tmp_path):
    store = WorkbenchStore(tmp_path / "workbench.sqlite3")
    store.initialize()
    expected = Suggestion(
        finding_fingerprint="basis-eth",
        confidence="medium",
        likely_cause="CoinTracking findet keinen Eingang.",
        check_steps=["Originalquelle pruefen."],
        needed_data=["Datum"],
        correction_kind="missing_inbound_context",
    )

    store.save_suggestion(expected)

    assert store.get_suggestion("basis-eth") == expected
```

- [ ] **Step 3: Run correction and storage tests to verify they fail**

Run:

```powershell
python -m pytest tests/test_correction_csv.py tests/test_storage.py -v
```

Expected: FAIL because suggestion/correction services and suggestion storage do not exist.

- [ ] **Step 4: Add suggestion and correction draft models**

```python
# append to app/models.py
class Suggestion(BaseModel):
    finding_fingerprint: str
    confidence: Literal["high", "medium", "low"]
    likely_cause: str
    check_steps: list[str] = Field(default_factory=list)
    needed_data: list[str] = Field(default_factory=list)
    correction_kind: str


class CorrectionDraftRow(BaseModel):
    type: str
    buy: str = ""
    buy_currency: str = ""
    sell: str = ""
    sell_currency: str = ""
    fee: str = ""
    fee_currency: str = ""
    exchange: str = ""
    group: str = ""
    comment: str = ""
    date: str = ""
    tx_id: str = ""


class CorrectionDraft(BaseModel):
    fingerprint: str
    rows: list[CorrectionDraftRow]
    import_ready: bool
    placeholders: list[str] = Field(default_factory=list)
```

- [ ] **Step 5: Implement deterministic missing-cost-basis guidance**

```python
# app/services/suggestions.py
from app.models import Finding, Suggestion


def suggest_for_finding(finding: Finding) -> Suggestion:
    if finding.category == "missing_cost_basis":
        currency = finding.data.get("currency", "Asset")
        sold_at = finding.data.get("output_at", "Ausgang")
        return Suggestion(
            finding_fingerprint=finding.fingerprint,
            confidence="medium",
            likely_cause=f"CoinTracking findet fuer {currency} vor dem Ausgang bei {sold_at} keinen passenden Eingang oder Kauf.",
            check_steps=[
                "In CoinTracking nach Asset und Verkaufsdatum filtern.",
                "Den fehlenden Eingang, Kauf oder Eigen-Transfer vor dem Ausgang suchen.",
                "Exchange, Datum, Menge und Tx-ID gegen Originalquelle abgleichen.",
            ],
            needed_data=["Ursprungsdatum", "Quelle/Exchange", "Eingangsart", "Tx-ID oder Dokumentationsnotiz"],
            correction_kind="missing_inbound_context",
        )
    return Suggestion(
        finding_fingerprint=finding.fingerprint,
        confidence="low",
        likely_cause="Auffaelligkeit braucht manuelle Pruefung.",
        check_steps=["Originalreport und CoinTracking-Detailansicht vergleichen."],
        needed_data=[],
        correction_kind="manual_review",
    )
```

- [ ] **Step 6: Implement correction draft CSV generation and placeholder validation**

```python
# app/services/correction_csv.py
from __future__ import annotations

import csv
from io import StringIO

from app.models import CorrectionDraft, CorrectionDraftRow, Finding


COINTRACKING_HEADER = ["Type", "Buy", "Cur.", "Sell", "Cur.", "Fee", "Cur.", "Exchange", "Group", "Comment", "Date", "Tx-ID"]


def build_missing_cost_basis_draft(finding: Finding) -> CorrectionDraft:
    row = CorrectionDraftRow(
        type="Deposit",
        buy=finding.data.get("amount", ""),
        buy_currency=finding.data.get("currency", ""),
        exchange="TODO_EXCHANGE",
        group="2025 correction draft",
        comment="TODO_KOSTENBASIS_HINWEIS - fehlenden Eingang gegen Originalquelle pruefen",
        date="TODO_DATUM",
        tx_id="TODO_TX_ID",
    )
    placeholders = find_placeholders([row])
    return CorrectionDraft(
        fingerprint=finding.fingerprint,
        rows=[row],
        import_ready=not placeholders,
        placeholders=placeholders,
    )


def find_placeholders(rows: list[CorrectionDraftRow]) -> list[str]:
    placeholders: set[str] = set()
    for row in rows:
        for value in row.model_dump().values():
            if isinstance(value, str) and value.startswith("TODO_"):
                placeholders.add(value.split(" ", 1)[0])
    return sorted(placeholders)


def draft_to_cointracking_csv(draft: CorrectionDraft) -> str:
    output = StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_ALL, lineterminator="\n")
    writer.writerow(COINTRACKING_HEADER)
    for row in draft.rows:
        writer.writerow([
            row.type,
            row.buy,
            row.buy_currency,
            row.sell,
            row.sell_currency,
            row.fee,
            row.fee_currency,
            row.exchange,
            row.group,
            row.comment,
            row.date,
            row.tx_id,
        ])
    return output.getvalue()
```

- [ ] **Step 7: Extend SQLite to store suggestions and correction drafts as JSON**

```python
# add to WorkbenchStore.initialize() in app/storage.py
conn.execute(
    """
    CREATE TABLE IF NOT EXISTS finding_suggestion (
        fingerprint TEXT PRIMARY KEY,
        payload_json TEXT NOT NULL
    )
    """
)
conn.execute(
    """
    CREATE TABLE IF NOT EXISTS correction_draft (
        fingerprint TEXT PRIMARY KEY,
        payload_json TEXT NOT NULL
    )
    """
)
```

```python
# add to WorkbenchStore in app/storage.py
from app.models import CorrectionDraft, Suggestion


def save_suggestion(self, suggestion: Suggestion) -> Suggestion:
    with sqlite3.connect(self.db_path) as conn:
        conn.execute(
            """
            INSERT INTO finding_suggestion (fingerprint, payload_json)
            VALUES (?, ?)
            ON CONFLICT(fingerprint) DO UPDATE SET payload_json = excluded.payload_json
            """,
            (suggestion.finding_fingerprint, suggestion.model_dump_json()),
        )
    return suggestion


def get_suggestion(self, fingerprint: str) -> Suggestion | None:
    with sqlite3.connect(self.db_path) as conn:
        row = conn.execute(
            "SELECT payload_json FROM finding_suggestion WHERE fingerprint = ?",
            (fingerprint,),
        ).fetchone()
    return Suggestion.model_validate_json(row[0]) if row else None


def save_draft(self, draft: CorrectionDraft) -> CorrectionDraft:
    with sqlite3.connect(self.db_path) as conn:
        conn.execute(
            """
            INSERT INTO correction_draft (fingerprint, payload_json)
            VALUES (?, ?)
            ON CONFLICT(fingerprint) DO UPDATE SET payload_json = excluded.payload_json
            """,
            (draft.fingerprint, draft.model_dump_json()),
        )
    return draft


def get_draft(self, fingerprint: str) -> CorrectionDraft | None:
    with sqlite3.connect(self.db_path) as conn:
        row = conn.execute(
            "SELECT payload_json FROM correction_draft WHERE fingerprint = ?",
            (fingerprint,),
        ).fetchone()
    return CorrectionDraft.model_validate_json(row[0]) if row else None
```

- [ ] **Step 8: Run correction and storage tests**

Run:

```powershell
python -m pytest tests/test_correction_csv.py tests/test_storage.py -v
```

Expected: PASS.

- [ ] **Step 9: Commit suggestions and draft CSV services**

```powershell
git add app/models.py app/storage.py app/services/suggestions.py app/services/correction_csv.py tests/test_correction_csv.py
git commit -m "feat: draft 2025 correction csvs"
```

## Task 6: Expose the 2025 Board API

**Files:**
- Modify: `app/main.py`
- Modify: `tests/conftest.py`
- Create: `tests/test_api_2025.py`

- [ ] **Step 1: Write failing API tests for report audit, state update, and draft creation**

```python
# tests/test_api_2025.py
from io import BytesIO


CAPITAL = b"""Amount,Currency,Date Acquired,Date Sold,Short/Long,Buy /Input at,Sell /Output at,Type,Cost Basis in EUR,Proceeds in EUR,Gain/Loss in EUR
"0,00088291",ETH,05.04.2025,05.04.2025,Short (Warning),,S Transaction,Trade,"0,00000000","1,44248864","1,44248864"
"""

CLEAN_CAPITAL = b"""Amount,Currency,Date Acquired,Date Sold,Short/Long,Buy /Input at,Sell /Output at,Type,Cost Basis in EUR,Proceeds in EUR,Gain/Loss in EUR
"0,00088291",ETH,05.04.2025,05.04.2025,Short,AETH Transaction,S Transaction,Trade,"1,44000000","1,44248864","0,00248864"
"""


def upload_capital(client):
    return client.post(
        "/api/2025/reports/audit",
        files=[("files", ("CoinTracking - Capital Gains Report.csv", BytesIO(CAPITAL), "text/csv"))],
    )


def test_audit_endpoint_returns_finding_and_work_state(client):
    payload = upload_capital(client).json()

    assert payload["error_count"] == 1
    assert payload["findings"][0]["state"]["status"] == "open"
    assert payload["findings"][0]["suggestion"]["correction_kind"] == "missing_inbound_context"


def test_state_and_draft_endpoints_update_same_finding(client):
    finding = upload_capital(client).json()["findings"][0]
    fingerprint = finding["fingerprint"]

    updated = client.put(
        f"/api/2025/findings/{fingerprint}/state",
        json={"status": "documented", "note": "Originalquelle pruefen", "next_step": "CoinTracking neu exportieren", "recheck_state": "not_run"},
    )
    draft = client.post(f"/api/2025/findings/{fingerprint}/draft", json=finding)

    assert updated.json()["status"] == "documented"
    assert draft.json()["draft"]["import_ready"] is False
    assert "TODO_DATUM" in draft.json()["csv"]


def test_reaudit_marks_recheck_finding_resolved_when_it_disappears(client):
    finding = upload_capital(client).json()["findings"][0]
    fingerprint = finding["fingerprint"]
    client.put(
        f"/api/2025/findings/{fingerprint}/state",
        json={"status": "recheck", "note": "", "next_step": "", "recheck_state": "not_run"},
    )

    response = client.post(
        "/api/2025/reports/audit",
        files=[("files", ("CoinTracking - Capital Gains Report.csv", BytesIO(CLEAN_CAPITAL), "text/csv"))],
    )

    assert response.json()["resolved_rechecks"] == 1
```

- [ ] **Step 2: Run API tests to verify they fail**

Run:

```powershell
python -m pytest tests/test_api_2025.py -v
```

Expected: FAIL because 2025 API routes do not exist.

- [ ] **Step 3: Add API response models that keep UI payloads typed**

```python
# append to app/models.py
class FindingCard(BaseModel):
    fingerprint: str
    severity: Literal["error", "warning", "info"]
    category: str
    title: str
    report_type: ReportType
    report_row: int | None = None
    data: dict[str, Any] = Field(default_factory=dict)
    state: FindingWorkState
    suggestion: Suggestion


class AuditBoardResponse(BaseModel):
    report_counts: dict[str, int]
    error_count: int
    warning_count: int
    resolved_rechecks: int = 0
    findings: list[FindingCard]
```

- [ ] **Step 4: Add report-audit and work-state endpoints**

```python
# add imports in app/main.py
from fastapi import File, UploadFile

from app.models import AuditBoardResponse, Finding, FindingCard, FindingWorkState, ReportBundleSummary
from app.services.audit_2025 import build_2025_audit
from app.services.correction_csv import build_missing_cost_basis_draft, draft_to_cointracking_csv
from app.services.report_bundle import parse_report_csv
from app.services.suggestions import suggest_for_finding
```

```python
# add inside create_app() in app/main.py
@app.post("/api/2025/reports/audit", response_model=AuditBoardResponse)
async def audit_2025_reports(files: list[UploadFile] = File(...)):
    reports = [parse_report_csv(file.filename or "report.csv", await file.read()) for file in files]
    audit = build_2025_audit(ReportBundleSummary(reports=reports))
    rechecks = app.state.store.mark_recheck_results({finding.fingerprint for finding in audit.findings})
    cards = []
    for finding in audit.findings:
        suggestion = suggest_for_finding(finding)
        app.state.store.save_suggestion(suggestion)
        cards.append(
            FindingCard(
                **finding.model_dump(),
                state=app.state.store.get_work_state(finding.fingerprint),
                suggestion=suggestion,
            )
        )
    return AuditBoardResponse(
        report_counts=audit.report_counts,
        error_count=audit.error_count,
        warning_count=audit.warning_count,
        resolved_rechecks=sum(state.recheck_state == "resolved" for state in rechecks),
        findings=cards,
    )


@app.put("/api/2025/findings/{fingerprint}/state", response_model=FindingWorkState)
def save_finding_state(fingerprint: str, state: FindingWorkState):
    normalized = state.model_copy(update={"fingerprint": fingerprint})
    return app.state.store.save_work_state(normalized)


@app.post("/api/2025/findings/{fingerprint}/draft")
def create_correction_draft(fingerprint: str, finding: Finding):
    normalized = finding.model_copy(update={"fingerprint": fingerprint})
    draft = build_missing_cost_basis_draft(normalized)
    app.state.store.save_draft(draft)
    return {"draft": draft.model_dump(), "csv": draft_to_cointracking_csv(draft)}
```

- [ ] **Step 5: Run API tests and full backend unit suite**

Run:

```powershell
python -m pytest tests/test_api_2025.py tests/test_app_shell.py tests/test_report_bundle.py tests/test_audit_2025.py tests/test_storage.py tests/test_correction_csv.py -v
```

Expected: PASS.

- [ ] **Step 6: Commit the 2025 API**

```powershell
git add app/main.py app/models.py tests/test_api_2025.py
git commit -m "feat: expose 2025 correction board api"
```

## Task 7: Build the 2025 Correction Board UI

**Files:**
- Modify: `app/static/index.html`
- Modify: `app/static/styles.css`
- Modify: `app/static/app.js`
- Modify: `tests/test_app_shell.py`

- [ ] **Step 1: Tighten shell test expectations for the correction board controls**

```python
# add to tests/test_app_shell.py
def test_index_exposes_2025_report_upload_controls(client):
    response = client.get("/")

    assert 'id="report-files"' in response.text
    assert 'id="audit-reports"' in response.text
    assert 'id="finding-list"' in response.text
    assert 'id="finding-detail"' in response.text
```

- [ ] **Step 2: Run the shell tests to verify the new controls are missing**

Run:

```powershell
python -m pytest tests/test_app_shell.py -v
```

Expected: FAIL on the new report-control assertions.

- [ ] **Step 3: Replace the board placeholder with upload, finding list, and detail panes**

```html
<!-- replace the board section in app/static/index.html -->
<section id="board" class="board" aria-live="polite">
  <section class="intake">
    <div>
      <h2>2025 Korrekturboard</h2>
      <p>CoinTracking Reports laden, harte Faelle zuerst bearbeiten, Korrekturentwuerfe pruefen.</p>
    </div>
    <label class="file-action">
      Reports
      <input id="report-files" type="file" accept=".csv" multiple>
    </label>
    <button id="audit-reports" class="primary">Reports pruefen</button>
  </section>
  <section id="board-summary" class="summary"></section>
  <section class="work-grid">
    <div>
      <h3>Findings</h3>
      <div id="finding-list" class="finding-list"></div>
    </div>
    <article id="finding-detail" class="finding-detail">
      <p class="muted">Waehle nach der Pruefung einen Fund.</p>
    </article>
  </section>
</section>
```

- [ ] **Step 4: Add focused console styling for priorities, detail editing, and CSV preview**

```css
/* append to app/static/styles.css */
.intake, .work-grid, .finding-row, .detail-head, .field-row {
  display: grid;
  gap: 12px;
}
.intake { grid-template-columns: 1fr auto auto; align-items: end; }
.primary, .file-action {
  min-height: 42px;
  border: 1px solid var(--accent);
  border-radius: 6px;
  padding: 10px 12px;
  background: var(--accent);
  color: #fff;
}
.file-action input { display: block; max-width: 210px; margin-top: 6px; }
.summary { display: flex; gap: 10px; margin: 18px 0; flex-wrap: wrap; }
.summary span { border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px; }
.work-grid { grid-template-columns: minmax(300px, 0.9fr) minmax(420px, 1.1fr); }
.finding-list { display: grid; gap: 8px; }
.finding-row {
  grid-template-columns: auto 1fr;
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #fff;
  color: var(--ink);
  padding: 12px;
  text-align: left;
}
.finding-row.error strong { color: var(--danger); }
.finding-row.warning strong { color: var(--warn); }
.finding-detail { border: 1px solid var(--line); border-radius: 8px; padding: 16px; min-width: 0; }
.field-row { grid-template-columns: 1fr 1fr; }
label, textarea, select, input { font: inherit; }
textarea, select, input[type="text"] {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 10px;
}
textarea { min-height: 96px; }
.csv-preview { width: 100%; min-height: 180px; font-family: Consolas, monospace; }
.muted { color: var(--muted); }
@media (max-width: 860px) {
  .shell { padding: 16px; }
  .topbar, .intake, .work-grid, .field-row { grid-template-columns: 1fr; display: grid; }
}
```

- [ ] **Step 5: Implement frontend audit loading, finding selection, state save, and draft preview**

```javascript
// replace app/static/app.js
const $ = (id) => document.getElementById(id);
const state = { findings: [], active: null };

fetch("/api/health")
  .then((response) => response.json())
  .then((payload) => { $("health").textContent = payload.ok ? "bereit" : "offline"; })
  .catch(() => { $("health").textContent = "offline"; });

$("audit-reports").addEventListener("click", auditReports);

async function auditReports() {
  const files = Array.from($("report-files").files || []);
  if (!files.length) return renderMessage("Bitte CoinTracking CSV-Reports auswaehlen.");
  const form = new FormData();
  files.forEach((file) => form.append("files", file));
  const response = await fetch("/api/2025/reports/audit", { method: "POST", body: form });
  const payload = await response.json();
  state.findings = payload.findings || [];
  renderSummary(payload);
  renderFindings();
  if (state.findings[0]) selectFinding(state.findings[0].fingerprint);
}

function renderSummary(payload) {
  $("board-summary").innerHTML = `
    <span>${payload.error_count} harte Faelle</span>
    <span>${payload.warning_count} Warnungen</span>
    ${payload.resolved_rechecks ? `<span>${payload.resolved_rechecks} Rechecks geloest</span>` : ""}
    ${Object.entries(payload.report_counts || {}).map(([type, count]) => `<span>${escapeHtml(type)}: ${count}</span>`).join("")}
  `;
}

function renderFindings() {
  $("finding-list").innerHTML = state.findings.map((finding) => `
    <button class="finding-row ${finding.severity}" data-fingerprint="${finding.fingerprint}">
      <strong>${finding.severity === "error" ? "P0" : "P1"}</strong>
      <span>${escapeHtml(finding.title)}<br><small>Reportzeile ${finding.report_row || "-"}</small></span>
    </button>
  `).join("");
  document.querySelectorAll("[data-fingerprint]").forEach((button) => {
    button.addEventListener("click", () => selectFinding(button.dataset.fingerprint));
  });
}

function selectFinding(fingerprint) {
  state.active = state.findings.find((finding) => finding.fingerprint === fingerprint);
  const finding = state.active;
  $("finding-detail").innerHTML = `
    <div class="detail-head">
      <div><h3>${escapeHtml(finding.title)}</h3><p class="muted">${escapeHtml(finding.suggestion.likely_cause)}</p></div>
      <button id="draft-btn" class="primary">Korrektur-CSV Entwurf</button>
    </div>
    <ol>${finding.suggestion.check_steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
    <div class="field-row">
      <label>Status<select id="finding-status">
        ${statusOptions(finding.state.status)}
      </select></label>
      <label>Naechster Schritt<input id="finding-next-step" type="text" value="${escapeAttr(finding.state.next_step || "")}"></label>
    </div>
    <label>Notiz<textarea id="finding-note">${escapeHtml(finding.state.note || "")}</textarea></label>
    <button id="save-state" class="primary">Status speichern</button>
    <label>CSV Entwurf<textarea id="draft-csv" class="csv-preview" readonly></textarea></label>
  `;
  $("save-state").addEventListener("click", saveFindingState);
  $("draft-btn").addEventListener("click", createDraft);
}

async function saveFindingState() {
  const payload = {
    fingerprint: state.active.fingerprint,
    status: $("finding-status").value,
    note: $("finding-note").value,
    next_step: $("finding-next-step").value,
    recheck_state: state.active.state.recheck_state || "not_run",
  };
  const response = await fetch(`/api/2025/findings/${state.active.fingerprint}/state`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  state.active.state = await response.json();
}

async function createDraft() {
  const response = await fetch(`/api/2025/findings/${state.active.fingerprint}/draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state.active),
  });
  const payload = await response.json();
  $("draft-csv").value = payload.csv;
}

function renderMessage(message) { $("finding-detail").innerHTML = `<p>${escapeHtml(message)}</p>`; }
function statusOptions(active) {
  return [
    ["open", "offen"],
    ["corrected_in_cointracking", "in CoinTracking korrigiert"],
    ["documented", "bewusst dokumentiert"],
    ["recheck", "erneut pruefen"],
  ].map(([value, label]) => `<option value="${value}" ${value === active ? "selected" : ""}>${label}</option>`).join("");
}
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char])); }
function escapeAttr(value) { return escapeHtml(value); }
```

- [ ] **Step 6: Run shell and API tests after frontend changes**

Run:

```powershell
python -m pytest tests/test_app_shell.py tests/test_api_2025.py -v
```

Expected: PASS.

- [ ] **Step 7: Commit the correction board UI**

```powershell
git add app/static tests/test_app_shell.py
git commit -m "feat: add 2025 correction board ui"
```

## Task 8: Verify the Local 2025 Workbench End to End

**Files:**
- Modify only if verification finds a defect in files already introduced above.

- [ ] **Step 1: Run the full test suite**

Run:

```powershell
python -m pytest -v
```

Expected: PASS, including `tests/test_real_2025_reports.py` when the local 2025 report folder remains present.

- [ ] **Step 2: Start the local dev server**

Run:

```powershell
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8765
```

Expected: Uvicorn serves the workbench at `http://127.0.0.1:8765`.

- [ ] **Step 3: Open the local page in Browser and audit the current 2025 CSV reports**

Use the Browser skill/tools to:

1. Open `http://127.0.0.1:8765`.
2. Select the CSV files from `CT Berichtsdaten 2025`.
3. Run `Reports pruefen`.
4. Confirm the summary shows five hard cases from the Capital Gains report.
5. Open the first ETH finding and create a correction CSV draft.
6. Confirm the preview visibly contains `TODO_DATUM`, `TODO_EXCHANGE`, `TODO_KOSTENBASIS_HINWEIS`, and `TODO_TX_ID`.

Expected: The UI stays readable at desktop width and the first hard finding can be edited without console errors.

- [ ] **Step 4: Check mobile layout for board legibility**

Use the Browser skill/tools at a narrow viewport around `390x844`.

Expected:

- upload controls stack without overlap
- finding list and detail pane stack
- CSV preview remains scrollable and text remains visible

- [ ] **Step 5: If verification required fixes, run the focused tests again**

Run the command that covers the changed surface, for example:

```powershell
python -m pytest tests/test_app_shell.py tests/test_api_2025.py -v
```

Expected: PASS.

- [ ] **Step 6: Commit any verification repairs**

```powershell
git add app tests
git commit -m "fix: polish local 2025 workbench verification"
```

Skip this commit when verification needs no repair.

## Follow-Up Plan After Phase 1

Create a second plan for `2026 Hybrid Inbox` after this phase is working. That plan should cover:

- source recognition and uploaded-file inbox
- CoinTracking transaction model reuse
- Variational, Nado, Paradex parser recovery or reimplementation
- Extended, GRVT, and AFX connector strategy
- external secrets-file reader
- generic mapping fallback for new DeFi sources
- pre-export review status and CoinTracking import CSV download
