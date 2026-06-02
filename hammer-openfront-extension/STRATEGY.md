# OpenFront Game Strategy Reference

Formulas and constants derived from OpenFrontIO source code. All troop values are in **internal units** (10x display value) unless noted.

## Server Rate Limits

| Limit | Value | Consequence |
|-------|-------|-------------|
| Intents/second | 10 | Excess silently dropped |
| Intents/minute | 150 | Excess silently dropped |
| Intent size | 500 bytes | Instant kick |
| Cumulative bytes/session | 2 MB | Instant kick, can't rejoin game |

**Hammer caps at 8/sec and 120/min** to leave headroom for manual actions.

**Keyboard macro safe rate: 125ms interval (8/sec).** Don't hold for more than ~15 seconds straight (150/min limit). Burst, pause, burst.

## Troop Growth Formula

Source: `DefaultConfig.ts:troopIncreaseRate()`

```
growthPerTick = (10 + troops^0.73 / 4) * (1 - troops / maxTroops)
```

- 1 tick = 100ms (10 ticks/sec, 600 ticks/min)
- Growth has two competing forces:
  - **Base growth** `10 + troops^0.73/4` — increases with troop count
  - **Capacity damping** `1 - troops/maxTroops` — decreases as you approach cap
- **Peak regeneration occurs at 42% of max capacity**
- At 90% capacity, regen is only 10% of peak rate
- Bot modifier: 0.6x growth

### Growth rate examples (10,000 tiles, 5 city levels, max = 1.85M)

| Capacity | Troops/sec | Notes |
|----------|-----------|-------|
| 10% | 15,852 | Low base, high ratio |
| 20% | 23,319 | |
| 30% | 27,409 | |
| **42%** | **29,017** | **Peak regen** |
| 50% | 28,403 | |
| 60% | 25,952 | |
| 70% | 21,778 | |
| 80% | 16,003 | |
| 90% | 8,719 | |
| 95% | 4,535 | Very slow |

## Max Troop Capacity Formula

Source: `DefaultConfig.ts:maxTroops()`

```
maxTroops = 2 * (tiles^0.6 * 1000 + 50000) + sum(cityLevels) * 250,000
```

- Each city level adds a flat **250,000** to max capacity
- Tiles have diminishing returns (`tiles^0.6`)
- Bot max = base / 3
- Nation max = base * 0.5 (Easy) to 1.25 (Impossible)

| Tiles | Cities | Max Troops |
|-------|--------|-----------|
| 100 | 0 | 131K |
| 1,000 | 0 | 633K |
| 5,000 | 3 | 1.48M |
| 10,000 | 5 | 1.85M |
| 50,000 | 10 | 4.38M |

## Troop Sending / Donation

- **1:1 transfer** — no tax, no loss
- **Cooldown**: 10 seconds per target (configurable in Hammer)
- **Default game amount**: floor(troops / 3)

## Optimal Auto-Troops Settings

### Fixed Ratio Mode

**Best sustainable: 30% ratio at 50% threshold (10s cooldown)**

This is the maximum ratio where you fully recover to threshold within one cooldown cycle.

| Ratio | Threshold | Drop to | After 10s | Sustainable? |
|-------|-----------|---------|-----------|-------------|
| 20% | 50% | 40% | 55.4% | Yes (surplus) |
| 25% | 50% | 38% | 53.0% | Yes (surplus) |
| **30%** | **50%** | **35%** | **50.6%** | **Yes (barely)** |
| 33% | 50% | 34% | 49.0% | No (deficit) |
| 42% | 50% | 29% | 44.4% | No (falling behind) |
| 50% | 50% | 25% | 40.0% | No (significant deficit) |

### Palantir Mode (Recommended)

**Sends everything above 42% floor. Self-correcting oscillation.**

Cycle: 57% -> send to 42% -> wait 10s -> recover to 57% -> repeat

| Starting % | Sends | Effective Ratio | After 10s |
|------------|-------|----------------|-----------|
| 50% | 148K | 16% | 57.3% |
| 57% | 283K | 26% | 57.3% |
| 70% | 519K | 40% | 57.3% |
| 80% | 704K | 47% | 57.3% |
| 90% | 889K | 53% | 57.3% |

**Key property:** Always recovers to 57.3% regardless of starting point. Throughput: ~28,300 troops/sec.

### Multi-Target Behavior

Sends are **sequential with compounding reduction** (fixed ratio) or **evenly split** (Palantir).

**Fixed ratio (20%, 5 targets, starting 100K):**
```
Target 1: 20K  (20% of 100K)
Target 2: 16K  (20% of 80K)
Target 3: 12.8K (20% of 64K)
Target 4: 10.2K (20% of 51.2K)
Target 5: 8.2K  (20% of 41K)
Total: 67.2K — last target gets 2.4x less than first
```

**Palantir (5 targets, 57% of 1.85M max):**
```
Surplus above 42% = 283K
Each target: 56.5K (evenly split)
Total: 283K — all targets equal
```

Palantir is better for multi-target because it splits evenly. Fixed ratio favors whoever is first in the list.

### Cooldown Optimization

10 seconds IS optimal. Longer waits reduce throughput:

| Wait | Recover to | Throughput |
|------|-----------|-----------|
| **10s** | **57.3%** | **28,271/sec** |
| 15s | 64.2% | 27,406/sec (-3%) |
| 20s | 70.4% | 26,314/sec (-7%) |
| 30s | 80.5% | 23,755/sec (-16%) |

Longer waits spend more time in the slow-growth zone near capacity.

**Always send every 10s.** Even when backline and safe, the math doesn't change. Safe backline = more reason to dump troops to teammates who need them. Stockpiling wastes growth — every second above 42% is slower regen than it could be.

The only exception: if you're about to be attacked and need to stockpile for defense. That's a tactical decision, not a math one.

## Attack Mechanics

Source: `DefaultConfig.ts`

- **Attack deploys**: troops / 5 (humans), troops / 20 (bots)
- **Terrain modifier**: Plains 80, Highland 100, Mountain 120
- **Defense Post**: 5x defense magnitude, 3x speed
- **Large defender (>150K tiles)**: 0.7-1.0 debuff

### Attack ratio — how much to commit

When you attack, the game commits `troops = attackRatio × yourTroops` (the slider, or
T/Y keys). Per-tile attacker loss scales with `within(defenderTroops / committedTroops, 0.6, 2)`:

| Committed vs defender's army | Per-tile cost |
|---|---|
| **≥ 1.67×** their troops | **0.6** (cheapest — the floor) |
| ~1× | ~1.0 |
| **≤ 0.5×** | **2.0** (3.3× worse) |

Capture **speed** maxes at the same point (~1.67× their troops). So there's a sweet spot:
commit ≈ **1.7× the defender's current army in one burst** → cheapest tiles AND fastest
capture. More buys nothing but speed and ties up troops that can't defend; less makes every
tile up to 3.3× costlier.

Consequences:
- **Neutral land / nations (expansion):** no defender army, so no penalty — high ratio is just
  faster and retreat is free. Slam high.
- **A real player:** crack them with a calculated burst (~1.5–2× their army), not a dribble.
  Same-target land attacks auto-merge into one pool (no penalty), but the pool has to actually
  be large to be cheap, so constant low-% slams are *safe but per-tile expensive*.
- **Committed troops can't defend** and retreat costs 25% vs players (free vs neutral) — so
  keep a reserve if a counter-attack is possible.

## Attack-Ratio Governor

The governor (Attack Ratio tab) auto-tunes the slider against your live troops/regen while you
do the fighting. It writes the ratio client-side only (no server intent). It manages YOUR side
(stockpile, regen throughput, safety) — it can't see the defender, so burst-vs-nibble timing
stays your call. Modes:

- **Manual** — observe only; you drive the slider/T-Y, governor just shows telemetry.
- **Assist** — holds a constant ratio % you set, with floor + send cap guarding.
- **Break-even** — holds your army at a target % you set (varies the ratio): spends the surplus,
  eases off below target. Good for sustained pressure while keeping a reserve.
- **Peak 42%** — holds at the 42% regen peak for max troops-produced/min — best for continuous
  slamming of neutral/weak targets.

Safety rails (apply to assist/break-even/peak):
- **Floor reserve** — a *pre-emptive* wall: as troops approach the floor % the allowed ratio
  ramps toward 1%, so even rapid clicking can't drain through it. Your defensive reserve.
- **Send cap** — hard ceiling on any single attack (default 30%). Stops over-/full-sends.

In multiplayer, auto modes channel teammate donations into attacks automatically (bounded by
the send cap), while the floor preserves troops to defend a counter.

## Gold Generation

- **Humans**: 100 gold/tick = 6,000 gold/min
- **Bots**: 50 gold/tick = 3,000 gold/min
- Gold generation is flat (not affected by territory size)
