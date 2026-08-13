# Reviewer frontend pattern states

This document records the accessibility and responsive contract for the
Beautiful UI adaptations implemented in subphase 9.2. The visual reference is
[Beautiful UI](https://www.beautifului.dev/); implementation is local and uses
the project token system in `frontend/src/styles/tokens.css`.

All interactive controls use a 2px focus outline, a 44px minimum target for
primary actions, and `--duration` that collapses under `prefers-reduced-motion`.

## Loading

Pending intake uses the primary button `aria-busy` state and Task Rows. Case
workspace pending uses a short `role="status"` line. The pixel-grid Loading
State pattern is not used.

## Task Rows

- Keyboard: each row is a button; Enter/Space activate `onSelect`.
- Screen reader: accessible name is `{label}, {status}` so status is not color
  alone. Icons are decorative.
- Reduced motion: no looping progress except the running icon, which is still
  accompanied by the `running` text.
- Narrow screen: label and status wrap; the status text stays visible.

## Approval Card

- Keyboard: Approve and Reject are adjacent buttons with equal target size.
  Confirmation uses `Dialog`, which traps focus via the modal dialog element.
- Screen reader: policy copy states that the action cannot run until approval.
  The dialog is named by its title. The close control is omitted while `busy`.
- Reduced motion: no celebratory animation on decision.
- Narrow screen: actions wrap; neither control is icon-only.

## Recommendation Card

- Keyboard: the card is informational in 9.2; later primary actions stay in
  the approval card rather than a hidden confidence widget.
- Screen reader: evidence strength, policy result, and uncertainty are text.
  There is no confidence meter and no authorization implied by a score.
- Reduced motion: static card.
- Narrow screen: monospace action preview wraps.

## Context Cards

- Keyboard: Copy source ID is a labeled button.
- Screen reader: source type, synthetic fixture badge, source ID, excerpt, and
  retrieval reason are all text. Missing `source_url` does not create a fake
  link.
- Reduced motion: no expand animation in 9.2; metadata stays visible.
- Narrow screen: header badges wrap; source ID remains readable in monospace.

## Filter Table

- Keyboard: category chips are toggle buttons (`aria-pressed`) in a toolbar.
- Screen reader: chip labels include counts (`Human 1`). The list order of
  remaining events is the original backend sequence; filtering only hides rows.
- Reduced motion: no reorder animation.
- Narrow screen: chips wrap; event rows stay a single column.

## Application shell

- Landmarks: `banner`, `navigation` named "Workspace", and `main`.
- `/dev/components` is the MVP component gallery. Storybook is not required.
