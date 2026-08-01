# Accessibility and Usability Validation (Blueprint 13.6)

## Automated checks

`tests/e2e/accessibility.spec.ts` runs axe (WCAG 2.0/2.1 A + AA) against every
publicly renderable route and fails on any serious or critical violation. It
also verifies the skip link is the first tab stop and lands on main content.
Runs with `pnpm e2e` in CI.

### Findings fixed in this pass

- Base `clay` accent darkened `#c67139` → `#8c491a` (and hover `clay-600`
  to `#7a3f16`): button fills and accent text now clear 4.5:1 on sand,
  sand-deep, and sage chip backgrounds.
- Muted text (`text-ink/55`, `text-ink/60`, shadcn `--muted-foreground`)
  raised to 70% ink: small text on sand backgrounds now clears 4.5:1.
- Clerk widget secondary text darkened via `colorTextSecondary` /
  `colorMutedForeground`.

## Keyboard-only walkthroughs (manual, staged environment)

Authenticated flows need staged Clerk accounts, so they are validated
manually in staging with synthetic data before pilot. Each flow must be
completable without a mouse, with visible focus, labeled controls, and an
error summary that receives focus on failed submit:

1. Front desk: register a patient (duplicate warning included) and book an
   appointment.
2. Patient: activate account, complete profile, intake form, and consent.
3. Provider: start, save, resume, and sign an encounter; add an amendment.
4. Ketamine staff: pre-session checklist through session monitoring entries
   and discharge.
5. Administrator: invite a workforce user and change a role with reason.

Record pass/fail and defects per flow in the ops log; high-severity findings
block pilot (tracked in `docs/LAUNCH_READINESS.md`). Staff usability
walkthroughs use the same synthetic scenarios and capture confusion points
for label/help-text fixes.
