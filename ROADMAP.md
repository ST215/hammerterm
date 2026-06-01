# Hammer Terminal — Roadmap

Tracked work that is **not yet done**: things deferred during recent sessions, known gaps,
and changes that still need live verification. Loosely ordered by priority within each section.

Last updated: 2026-06-01 (after v15.17.0).

---

## 🔴 Needs live verification (built, not yet confirmed in a real game)

These shipped in v15.15.0–v15.17.0 but were validated by tests + static analysis only.
Use the **Flight Recorder test route** in `README.md` to confirm each.

- [ ] **Flight recording capture → export → inspect loop** — the whole route in the README is
      itself unverified on the current build. Confirm REC captures, export downloads, and the
      metrics below actually populate.
- [ ] **Replay throttle** — load a real match replay; confirm the tool stays responsive (no lag)
      and `hook/replay {isReplay:true}` shows in the recording. The 250ms coalesce + structural
      throttle are unverified under a real fast-forwarding replay.
- [ ] **No-self replay ingestion** — load a replay you were NOT in; confirm CIA/Summary populate
      from global transfer data and the card shows the "replay / ingesting" state (not stuck on
      "awaiting signal").
- [ ] **Automation pause in replay** — with auto-troops/gold on, load a replay and confirm
      `intentsBlockedReplay > 0` and no intents are actually sent.
- [ ] **Display-events pipeline** — confirm `displayEventsProcessed > 0` in a live match. (Old
      `recording_analysis_1` flagged "0 processed"; believed to be a readiness-gate timing issue,
      never reproduced on current code.)
- [ ] **Popups in every view mode** — verify each of the 4 popups renders on the game screen in
      disguised, revealed, AND hidden modes, and that the Settings **Test** buttons place them
      correctly at the chosen position/scale.
- [ ] **View-mode switching reliability** — the v15.16.0 rebuild (double-click = one window,
      close-via-Chrome restores in-game, refresh keeps settings, popup Reset recovers stuck state)
      is tested at the store level but needs a real two-monitor session.

---

## 🟡 Known gaps / deferred features

- [ ] **quick_chat per-recipient cooldown (OpenFront v0.32)** — the server now silently drops
      repeated quick_chat to the same recipient within ~3s (30 ticks). No automation currently
      spams quick_chat (broadcast uses emoji), so this was deliberately skipped. Revisit if a
      quick-chat automation is added.
- [ ] **`allianceReject` intent** — the schema defines it but the extension never sends it (alliance
      accept/betray go through the EventBus). Add a reject path if we want to decline incoming
      requests programmatically.
- [ ] **`disableClanTags` in public FFA** — clan grouping is derived from the `[TAG]` name prefix,
      so public-FFA tag stripping degrades gracefully (players fall into the untagged bucket). No
      action needed unless we want a UI note when tags are unavailable.
- [ ] **GrowthHUD requires "my player"** — it shows your own troop growth, so it stays hidden in a
      no-self replay. Fine for now; could add a "pick a player to track" mode later.
- [ ] **"Pick a player to view as" in replays** — currently no-self replays show global data with
      empty self-relative sections. A perspective selector (treat any player as "me") would make
      the self-relative views usable from a replay. (The standalone Replay Viewer already has a POV
      selector; the live tool does not.)

---

## 🟢 Code health / tech debt

- [ ] **Pre-existing typecheck errors in tests** (4, unrelated to recent work, present before these
      sessions): `tests/blink-regression.test.ts` (nullish-expression warnings),
      `tests/game-contract.test.ts:157` (template-literal key type from v0.32 `QuickChat.json`),
      `tests/message-processing.test.ts:95` (42 vs 99 comparison). Clean these up.
- [ ] **`processDisplayMessage()` is hard to unit-test** — coupled to global store, DOM functions,
      and CIA logic (`tests/message-processing.test.ts:7-15`). Extract a pure core to unlock real
      tests for the display-event pipeline.
- [ ] **44 `.todo()` DOM-dependent tests** (`tests/dom-dependent.test.ts`) — define contracts for
      hooks/overlay behavior but can't run in happy-dom. Either wire a jsdom/e2e harness or accept
      them as documentation.
- [ ] **`donorName` deprecation** (`src/store/slices/donation-toasts.ts`) — superseded by
      `playerName`; remove once no consumers remain.
- [ ] **Dead 2D canvas hook** — under WebGL2 the old `CanvasRenderingContext2D` `setTransform`/
      `drawImage` hook never fires (ALT+M now uses the game's TransformHandler). The 2D path is kept
      as a harmless fallback; consider removing if no pre-WebGL2 server remains.
- [ ] **OpenFront reference clone drift** — `OpenFrontIO/` is pinned at `v0.32.0-test-release3`.
      Re-pull periodically and re-run game-contract tests to catch protocol changes early.

---

## 💡 Ideas / nice-to-have

- [ ] Animate the analytics card / Growth HUD counters (anime.js) now that the disguised card is the
      default surface.
- [ ] Per-popup duration control in Settings (Reciprocate has `reciprocateNotifyDuration`; expose it).
- [ ] Surface replay status in the UI (a small "REPLAY" badge) so it's obvious automation is paused.
- [ ] Commit the three recent feature batches as separate tagged releases if a cleaner history is
      wanted (currently bundled).

---

## ✅ Recently shipped (for context)

- **v15.17.0** — replay support (detect/throttle/no-self ingest), popups in any view mode, Settings tab.
- **v15.16.0** — `inGameView` state machine, reliable external-window lifecycle, popup control center, persistence.
- **v15.15.0** — OpenFront v0.32 sync (PlayerUpdate delta merge, WebGL2 ALT+M, enum re-sync).
