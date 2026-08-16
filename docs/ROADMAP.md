# Roadmap

This roadmap starts from the verified ExamEngine v2 baseline merged to `main` on 2026-08-16. Items below are **not implemented unless explicitly marked complete**.

## Baseline — v2 offline milestone

**Status: ✅ Complete**

Delivered:

- schema v2 and strict validation
- deterministic timers/scoring/shuffling
- legacy pack migration
- exam and study modes
- sections and learning metadata
- autosave/resume
- attempt history
- wrong-answer notebook
- topic analytics and weak-topic detection
- wrong/skipped retest
- adaptive retest request export
- source references
- result export
- modular source architecture
- offline single-file build
- core tests, validator tests and GitHub Actions CI

## P1 — Browser reliability and UX hardening

**Goal:** increase confidence in the complete browser workflow, not just the deterministic core.

- [ ] Add Playwright browser E2E tests
- [ ] Cover upload → exam → submit → analytics → retest workflow
- [ ] Test resume after reload during timed exams
- [ ] Test browser background/throttling timing behavior
- [ ] Add automated accessibility checks
- [ ] Improve keyboard/screen-reader semantics across palette, timers and modals
- [ ] Add corrupted/localStorage recovery behavior
- [ ] Add explicit session reset/data-management controls
- [ ] Add larger stress fixtures (hundreds/thousands of questions)
- [ ] Add performance budgets for startup, question navigation and result rendering

### Exit criteria

- critical browser workflows covered by E2E tests;
- no known timer/scoring regression across supported browsers;
- accessibility baseline documented and automatically checked.

## P2 — Richer adaptive learning

**Goal:** move from weak-topic reporting to a stronger learning system.

- [ ] Track repeated attempts by learning objective, not only topic
- [ ] Add spaced-repetition scheduling for wrong/weak concepts
- [ ] Add mastery/confidence trend over time
- [ ] Add configurable adaptive difficulty progression
- [ ] Add question exposure/repetition controls
- [ ] Generate targeted retest blueprints automatically from attempt history
- [ ] Add comparison of first-attempt vs retest performance
- [ ] Add explanation-quality feedback and “still unclear” tagging
- [ ] Add source-view navigation from `sourceRefs` when source assets are available

### Exit criteria

- learning history produces an actionable study queue;
- mastery is tracked consistently across attempts;
- retest selection balances weakness, recency and repetition.

## P3 — Pack authoring and content management

**Goal:** make packs easier to create, inspect and maintain without manually editing JSON.

- [ ] Add visual pack inspector/editor
- [ ] Add schema-aware question editing
- [ ] Add pack merge/split tools
- [ ] Add bulk topic/tag/section editing
- [ ] Add duplicate-question detection UI
- [ ] Add pack-level QA report
- [ ] Add import/export utilities for CSV and other simple formats
- [ ] Add stable pack IDs and revision metadata
- [ ] Add explicit schema migration CLI

## P4 — Optional hosted sync layer

**Goal:** preserve offline-first behavior while enabling account-backed synchronization.

- [ ] Define backend-neutral sync contract
- [ ] Add authentication
- [ ] Add encrypted cloud attempt/history storage
- [ ] Add cross-device session/history synchronization
- [ ] Resolve offline/online conflicts deterministically
- [ ] Add user data export/delete controls
- [ ] Add observability for sync failures

### Architecture constraint

The deterministic exam core must remain runnable offline. Network failures must not invalidate an active local exam session.

## P5 — Instructor/admin workflows

**Goal:** support managed exam distribution when/if ExamEngine expands beyond personal study.

- [ ] Exam assignment model
- [ ] Candidate roster and attempt status
- [ ] Controlled pack/version publishing
- [ ] Availability windows and attempt limits
- [ ] Central result collection
- [ ] Aggregate analytics
- [ ] Role-based permissions
- [ ] Audit log

This phase requires a backend and should not be mixed into the offline core prematurely.

## P6 — Security and assessment integrity

**Goal:** harden hosted/managed assessment use cases.

- [ ] Threat model for pack answer exposure
- [ ] Signed/encrypted assessment bundles where appropriate
- [ ] Secure hosted result submission
- [ ] Tamper-evident attempt metadata
- [ ] Content Security Policy for hosted distribution
- [ ] Dependency/security scanning if external dependencies are introduced
- [ ] Decide explicitly whether proctoring is in product scope

Remote proctoring is **not** currently implemented and should only be added after privacy, legal and product requirements are defined.

## P7 — Release engineering

- [ ] Introduce semantic release tags (`v2.x.x`)
- [ ] Add changelog/release notes automation
- [ ] Publish downloadable offline build as a GitHub release asset
- [ ] Add reproducible-build verification/hash
- [ ] Add supported-browser matrix
- [ ] Add release smoke-test checklist

## Suggested next implementation order

1. **P1 browser E2E + accessibility** — highest leverage for correctness confidence.
2. **P2 adaptive learning depth** — strongest product-value extension of the current architecture.
3. **P3 pack authoring tools** — reduces operational friction and improves content quality.
4. **P7 release engineering** — formalize distribution once browser workflows are hardened.
5. **P4/P5 hosted features** — only when multi-device or institutional use becomes a concrete requirement.

## Non-goals for the immediate next milestone

Unless requirements change, avoid prioritizing these before P1:

- remote proctoring;
- complex backend microservices;
- multi-tenant LMS functionality;
- real-time collaboration;
- large UI framework migration.

The current architecture already solves the core exam/study use case offline. The next milestone should first make that path exceptionally well-tested and robust.
