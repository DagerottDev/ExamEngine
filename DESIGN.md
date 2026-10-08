# Design

RecallForge keeps its incumbent blue, readable study identity. The interface should help a learner stay with a question, understand their next action, and trust what was saved. It uses the existing vanilla HTML/CSS structure and browser-native controls; appearance settings change presentation while preserving pack rules, routes/flows, timing, answers, history, and data safety.

## Visual foundation

The default light theme uses a soft gray page, white panels, dark navy text, blue actions, restrained borders, and small shadows. The dark theme preserves semantic contrast with lighter blue actions. Teal and violet are explicit accent preferences. Status colors retain meaning across themes; labels, borders, and state indicators accompany color.

| Token/setting | Current default |
| --- | --- |
| Page / panel | `#f3f5f8` / `#ffffff` |
| Text / secondary text | `#19263b` / `#53627a` |
| Primary blue / stronger blue | `#1958a4` / `#123e78` |
| Border | `#d5dce6` |
| Panel spacing | 24 px; compact 16 px, spacious 32 px |
| Interface / question font | System sans serif, independently configurable |
| Question reading | 18 px, 70 characters, 1.6 line height |
| Corners | Mostly 7–12 px; simple bordered controls/cards |

The source of truth for tokens is [`src/styles.css`](src/styles.css). Use CSS variables and existing components before adding a second style system.

## Reading and learner preferences

Offer focused/compact/spacious presets while retaining individual font, text-size, reading-width, line-height, timer-position, palette, theme, accent, motion, and dashboard-order controls. Preview preferences before applying; closing the preview should return to saved choices. Layout-only reset and complete appearance reset are distinct actions.

Bundle Source Sans 3, Lexend, Atkinson Hyperlegible, and Lora alongside the system option. Interface fonts prioritize clear controls; Lora is a question-reading option. Embedded fonts should remain available offline, with their OFL notices preserved. Allowed values are normalized by [`src/core/preferences.js`](src/core/preferences.js).

The timer remains visible for every active timed session, including phone layouts and a collapsed palette. Reading-width preferences must not create document-level horizontal overflow. PDF content can have its own scroll region.

## Hierarchy and interaction

- Home emphasizes the next study action and unfinished session, then due/recent/weak/notebook cards.
- Library separates reusable pack actions from question search, mock building, sources, drafts, and editing.
- Session pages give question/answers the largest reading area, with clear progress, marks, timer, palette, flags, and navigation.
- Result/progress pages show the score and context before detail. Topic percentages include sample counts; comparable first/retest information must identify the shared context/questions.
- Settings groups reading/layout preferences separately from data/backup actions. Backup preview should show readable counts and consequences before merge or replace.
- Source links show a file/page/excerpt context. Missing data is a visible error with a useful recovery path.

Use existing empty states and explicit save/error messages. Drafts may be incomplete; playable packs must validate. Avoid exposing hashing/encryption implementation details in routine learner flows except where they help a backup/password decision.

## Motion

Keep functional transitions within **150–250 ms**. The current button color/border transitions use 160 ms; dialog entrance and chart updates use 200 ms. Motion should help track a state change and should not slow question navigation or distract from reading. Avoid decorative looping effects.

Follow the device's reduced-motion setting by default. Explicit **Reduced** or **Off** disables nonessential animation/transitions. Respect changes to device preferences while the app remains open. Verify the resulting behavior in the browser; the presence of a media/preference branch is not acceptance evidence.

## Accessibility and responsiveness

Use native buttons/inputs/selects/dialogs, visible labels, predictable tab order, visible focus, and clear validation text. Interactive controls target approximately 44 px height. Confirmation dialogs focus a safe choice and support cancellation; opening/closing dialogs should preserve sensible focus. Home-card ordering needs keyboard move buttons in addition to drag interaction.

Question keyboard shortcuts must not fire while typing in a text field or changing a form control. Do not rely only on color, hover, or animation for answered/flagged/expired status. Check contrast in every theme/accent, not only the default blue.

Acceptance widths are 390, 768, and 1440 px, plus 200% zoom. Verify reading comfort, reachable actions, timer/footer visibility, palette behavior, dialog scrolling, source/PDF viewing, and save-message placement. Live appearance preview must not mutate exam deadlines or answers.

## Verification boundary

This file documents design direction and current tokens/controls. It does not claim screenshot, screen-reader, contrast, responsive, motion, or PDF/browser acceptance. Record completed checks and remaining limits in [E2E_REPORT](docs/E2E_REPORT.md), alongside [PROJECT_STATUS](docs/PROJECT_STATUS.md).
