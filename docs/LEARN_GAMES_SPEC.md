# Learn: Play section and game layer

Status: **implemented**. This describes what was built.

Main files:
- `apps/desktop/src/features/learn/games/`:
  - `GameShell.tsx`
  - `QuickGames.tsx`
  - `Speak.tsx`
  - `Play.tsx`
  - `content.ts`
- `features/learn/game.ts`
- `engine/podium_engine/learn.py`

| # | Feature | Kind | Where it lives |
|---|---|---|---|
| 9 | Claim Duel | quick game, no recording | Play |
| 10 | Spot the Hedge | quick game, listening (Piper) | Play |
| 11 | Signpost Sorter | quick game, drag and drop | Play |
| 12 | Evidence or Anecdote | quick game, swipe cards | Play |
| 5 | Pace Runner | recorded game, live pace | Play |
| 2 | Module Boss | recorded challenge, optional | Play, skill tree, module page |
| 14 | Rusty skills | progression | HUD, skill tree, module and skill pages, Play → Review |
| 16 | Unlockables | cosmetics | Play → Locker |

## Decisions

| | Decision | What it means in the build |
|---|---|---|
| D1 | The Setup screen may change **only** for Pace Runner and boss fights | `Setup.tsx` renders `SpeakGameCard` instead of `DrillCard` only when `drill.game` is set. A regular practice shows exactly the old card. Nothing else on the screen changed. |
| D2 | Bosses are **optional** and unlock the cosmetics | The skill tree still unlocks as before, from one Proficient skill in the prerequisite. A boss win pays XP and unlocks that module's title. Any first win unlocks the Violet accent, and all eight unlock Diamond. |
| D3 | Game content may be authored | About 150 items in `content.ts`, guarded by `content.test.ts`. |

## How the design teaches

- **Every answer explains itself.** Each round reveals why the right answer is right: the claim grader's flaw labels, the clean version of a hedged sentence, and the reason a card counts as evidence.
- **Easy first, then subtle.** Claim Duel orders rounds from obvious flaws (announcing a topic, fillers) to subtle ones (one hedge, off-prompt). Spot the Hedge includes "like" and "just" used correctly, as traps.
- **Misses lead somewhere.** The result screen lists what you missed and links the lesson for the rule.
- **Games lead to speaking.** Each skill page offers "Warm up first" with its game. Pace Runner and bosses use the real analysis, so practicing in a game moves the same numbers as a full talk.
- **Spaced review without nagging.** A mastered skill that slips in later full talks turns **rusty**. A single review practice polishes it, and the XP already earned is never taken away.
- **Mastery, not grinding.** Quick games pay XP for 3 plays per game per day. Speaking pays more. Cosmetics are earned by playing and are never bought.

## Placement

- **Path / Play switch.** It sits in the Learn header and is remembered per viewer in `localStorage` (`learn.tab`). `P` toggles it. A dot on Play means something is waiting: a rusty skill or a game you haven't played.
- **Play section:**
  - four quick-game cards, each showing best score, module and XP plays left today;
  - Pace Runner, with a history of runs and a 60 s or 90 s length;
  - Boss fights, eight tiles showing defeated, ready or not started;
  - Review, listing rusty skills with Lesson and Review buttons;
  - the Locker strip.
- **HUD.** It shows the equipped title next to the rank and a "N rusty" chip that opens Play.
- **Skill tree.** Each node has a boss diamond (outlined when ready, filled when beaten) and a rust dot.
- **Module page.** The boss card sits at the end of the skill path.
- **Skill page.** It shows a rust banner with "Review now" and "Warm up first" links to its quick games.

## Quick games (shared shell)

- The shell has three steps: an intro (rules and the skills it trains), play, then a result.
- The result shows the score, "New best!", the XP breakdown, up to 5 misses with reasons, Play again, a lesson link and Back.
- Keys: Enter starts or replays, and Esc leaves. Quitting saves nothing.
- Rounds are drawn with a seeded shuffle (`rng`, `shuffle`) for a fresh set every play.
- `learn.game {game, score, max}` appends to `learn.json.games`, keeping the last 50 per game. A play also counts toward the streak.
- XP per play:

  | Event | XP |
  |---|---|
  | Finished | +15 |
  | 80% or more right | +25 |
  | New personal best (beats an earlier play) | +20 |

  Only the first 3 plays per game per day earn XP (`gameXp`).
- Demo mode shows results but doesn't save.

| Game | Rounds | Scoring | Notes |
|---|---|---|---|
| Claim Duel | 9 pairs (one per prompt, easy → subtle) plus a "write your own" finisher | out of 10; the finisher scores 1 if `testClaim` says "Strong claim" | Keys `1`/`2`. The loser's flaws are labeled by the same grader the finisher uses. |
| Spot the Hedge | 8 lines (one is a trap with nothing to tap) | per round `max(0, hits − wrong) / targets`, out of 8 | Piper reads the line in the `weak` style before the words appear, and the clean version can be heard in `strong`. `R` replays once. Rounds are synthesized one at a time. If autoplay is blocked it shows a Play button; if the voice is missing it switches to reading mode. |
| Signpost Sorter | 3 speeches of 6 sentences into Claim / Point 1 / Point 2 / Conclusion | per round: 2★ right first try, 1★ after one fix, +1★ for tapping the signpost word; out of 9 | Drag and drop, or arrows plus `1`–`4`. Wrong sentences go back to the pool. A second miss reveals the answer. Signposts are highlighted only after the bonus. |
| Evidence or Anecdote | 8 sort cards (3 hard, 3 anecdote, 2 not support) plus 4 upgrades | out of 12 | Swipe, or `←` `→` `↓`, or buttons. "Not support" covers restating the claim, which the evidence check doesn't count. In an upgrade you pick which rewrite turns the anecdote into evidence. |

**Content** (`content.ts`):
- 36 claim pairs over 12 prompts;
- 30 hedge lines;
- 12 speeches;
- 36 evidence cards;
- 12 upgrade sets.

`content.test.ts` checks:
- every pair's strong claim grades "Strong" and its weak claim doesn't;
- hedge markup parses and the traps are present;
- every speech has all four lanes and its signposts;
- all ids are unique.

While writing the pairs, the claim grader turned out to miss stances like "is worth" and "are good". The `STANCE` pattern was widened, which also improves the existing Claim Tester.

## Pace Runner

- **Starting it.** A Play card starts it, with the length chosen on the card. It's a speed practice: `drill = {check: "target_pace", game: "paceRunner", title, instruction, target}` goes to Setup, which shows the game card (D1), then to Live.
- **Live overlay** (`PaceRunnerLive`):
  - a lane showing the target band (from the Setup speech type), the live `wpmEma` as the car, and a trail;
  - a status of "In the lane", "Speed up", "Slow down" or "Pause: fine";
  - time in band, the current streak, the best streak and the time left.
  - Pauses don't count, and the first 8 s are a warm-up.
  - It replaces the coach cue word, and the run stops by itself at the time limit.
- **Scoring is authoritative in the engine.** `learn.pace_runner(summary)` works from the saved `pacing.series`, skipping the warm-up and non-speech points. Finalize stores it as `summary.paceRunner`, and `learn.status()` returns the runs.
- **Result card.** It shows in-band %, the longest streak, the best before this run (or "first run"), and whether the speed practice passed.
- **XP.** The normal practice XP, plus +20 each time the best in-band % improves.

## Module bosses (optional)

- **Ready** once every skill in the module has been started (mastery ≥ 1). Demo mode makes every boss ready.
- **One run** of 120 s for argument modules or 90 s for delivery modules, on a module-specific prompt.
  - `drill = {game: "boss", boss, checks: <every check in the module>, title, instruction, target}`.
  - Setup shows the boss card with every target (D1).
  - Live shows a banner listing the boss's skills, and the run stops at the time limit.
- **Engine.**
  - `session.start` accepts `boss` (letters only) and `checks` (filtered to known checks).
  - Finalize writes `summary.boss = {module, results[], passed}`, which passes only if every check passes.
  - `status()` returns `bosses`.
  - Bosses are excluded from achievements, the average report and the "last 3 full runs" window.
- **Result card.** Each check shows hit or miss with its value and target, and a lesson link for each miss. A win says "Boss defeated!" and names the unlocked title.
- **Rewards.**
  - +150 XP on the first win.
  - +10 for each failed try, up to 3 per boss.
  - The module's title badge.
  - Violet after the first boss, Diamond after all eight.

## Rusty skills

- **The engine replays each skill's history in time order** (`learn._rust`):
  - A skill is mastered while a practice has passed and 2 of the last 3 full runs pass.
  - Once mastered, a full run that fails it and drops it below that makes it **rusty**. That run is `rustySince`.
  - A passed practice afterwards (a review) clears the rust, and so does getting back to 2 of 3. Each clear adds 1 to `rustCleared`.
  - Each check then carries `everMastered`, `rusty`, `rustySince` and `rustCleared`.
- **The app.**
  - A rusty skill shows as Proficient, with a rust dot, tag and banner.
  - A cleared skill shows as Mastered.
  - Mastered XP is paid for `everMastered`, so **total XP never drops**.
  - Each cleared rust is +60 XP.
- **Demo mode** shows two rusty skills: Hold eye contact and Steady pace.

## Unlockables (Locker)

| Slot | Items and how they unlock |
|---|---|
| Accent | Ember (default) · Signal Blue at LV 02 · Mint at LV 04 · Violet for any boss win · Gold at LV 06 · Diamond for all 8 bosses |
| Ring style | Solid (default) · Dual track at LV 03 · Bright ticks for 80%+ in band in Pace Runner · Pulse for a 7-day streak |
| XP bar | Classic (default) · Spark for playing every quick game once · Plasma for clearing a rusty skill |
| Title | None (default) · one per boss: Architect, Evidence Hunter, Straight Talker, Analyst, Steady, Clean Speaker, Room Reader, Dynamo |

How it works:
- Unlocks are computed from existing data (`UNLOCKABLES` in `game.ts`).
- `learn.equip {slot, item}` stores the choice. An item that isn't unlocked falls back to the default.
- The accent drives `--learn-accent` across Learn, including the recommended orb and the XP bar gradient. Ring and XP bar styles are classes on the Learn view.
- New unlocks show a toast once, tracked by `learn.seen`.
- Demo mode unlocks everything and equips for the session only.

The planned "coach voice" slot was dropped: the only Listen buttons are the weak and strong examples, whose styles are the lesson, so a voice skin had nowhere meaningful to apply.

## Engine and API

| Command or field | Purpose |
|---|---|
| `learn.game {game, score, max}` | record a quick game |
| `learn.equip {slot, item}` | equip a cosmetic |
| `learn.seen {ids}` | mark unlock toasts as shown |
| `session.start` + `game: "paceRunner"`, `boss`, `checks` | the speaking games |
| `summary.paceRunner`, `summary.boss` | results, written at finalize |
| `learn.status()` + `bosses`, `paceRunner`, `games`, `equipped`, `seenUnlocks`, and per check `everMastered`, `rusty`, `rustySince`, `rustCleared` | everything the Play section reads |

All new fields are optional, so older sessions and an empty `learn.json` still render.

## Tests

- **Engine** (`tests/test_learn.py`):
  - rust appearing, being cleared by a review, and coming back;
  - a skill never mastered is never rusty;
  - per-check boss results, and bosses kept out of the full-run window;
  - Pace Runner scoring, including the warm-up, pauses and an out-of-band point;
  - Pace Runner runs counting as speed practices;
  - game storage capped at 50, equip, seen, and invalid input.
- **App:**
  - `play.test.ts`: the XP daily cap and bonuses, rust keeping XP, boss XP and titles without changing unlocks, Locker fallback, longest streak, demo data, and the seeded shuffle;
  - `content.test.ts`: the content checks above.
