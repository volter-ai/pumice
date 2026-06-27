# COMPAT-BUDGET.md — performance & fidelity budgets

The budgets the DoD perf/theme gates (#3, #16) enforce. Thresholds are **CI-safe**
(generous vs a real machine) so the gate catches regressions without flaking.

## Performance budgets (10k-note synthetic fixture)

Measured by `scripts/phase11-perf.mjs` with `process.hrtime`. Observed numbers (a recent
CI run) are well under budget:

| Operation | Budget | Observed |
|---|---|---|
| Vault fixture generation (10k) | 2000 ms | ~15 ms |
| Tag-index build (10k) | 3000 ms | ~69 ms |
| Graph data build (10k nodes / 20k links) | 3000 ms | ~24 ms |
| Search keystroke (text) | 1500 ms | ~36 ms |
| Search keystroke (fielded + task) | 2000 ms | ~30 ms |
| Backlinks lookup | 1500 ms | ~6 ms |

## Theme budgets

Measured by `scripts/phase7-themes.mjs`:

- Each theme must define the **required variable contract**: `--background-primary`,
  `--text-normal`, `--text-accent`, `--interactive-accent`, `--font-text-size`.
- Each theme's `:root` override set ≤ **200 vars** (cold-apply budget).
- ≥ **5 named themes** parse + apply + pass the contract.

## Fidelity (T5, future differential phase)

Perceptual-hash ≤ 2% and 0 structural class mismatches vs separately-installed Obsidian.
Not part of the v1 DoD gate (requires an installed-Obsidian baseline); tracked for the
differential-test phase.
