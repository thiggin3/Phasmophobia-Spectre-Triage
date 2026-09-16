/**
 * ghosts.js — Phasmophobia ghost database.
 *
 * Data reflects the live game as of v0.19.0.2 (16 Sep 2026): the 24 legacy
 * ghosts plus Dayan, Obambo, Gallu (v0.15.1 Winter's Jest), Kormos, Aswang
 * (v0.17.x) and Deildegast (v0.18.0). Evidence names use the in-game journal
 * terms ("Ultraviolet", not "Fingerprints"; "Incense", not "Smudge Sticks").
 *
 * Every speed is in metres per second. `los` marks whether the ghost gains
 * the standard line-of-sight acceleration (up to ~1.65× base after sustained
 * LoS). `hunt` thresholds are AVERAGE team sanity unless noted.
 *
 * This module is shared by the Node test-suite (ESM import) and the browser
 * bundle (the build step strips the `export` line).
 */

/** Canonical evidence list. `id` is used everywhere in code; `label` in UI. */
const EVIDENCE = [
  { id: 'emf',      label: 'EMF Level 5',        short: 'EMF 5' },
  { id: 'uv',       label: 'Ultraviolet',        short: 'UV' },
  { id: 'writing',  label: 'Ghost Writing',      short: 'Writing' },
  { id: 'freezing', label: 'Freezing Temps',     short: 'Freezing' },
  { id: 'dots',     label: 'D.O.T.S. Projector', short: 'DOTS' },
  { id: 'orbs',     label: 'Ghost Orbs',         short: 'Orbs' },
  { id: 'spiritbox',label: 'Spirit Box',         short: 'Spirit Box' },
];

/** Standard LoS multiplier applied to ghosts with `speed.los === true`. */
const LOS_MULTIPLIER = 1.65;

/** Global timers that are NOT ghost-specific (seconds). */
const TIMERS = {
  incenseBlockDefault: 90,   // incense outside a hunt blocks hunts for 90 s
  incenseBlindDefault: 5,    // incense during a hunt blinds the ghost for 5 s
  huntCooldownDefault: 25,   // minimum gap between hunts
  uvPrintLifetime: 120,      // fingerprints fade after 120 s
  playerWalk: 1.6,           // m/s
  playerSprint: 3.0,         // m/s for 3 s, then 5 s cooldown
  playerSprintAverage: 2.125 // effective sustained sprint/walk average
};

const GHOSTS = [
  {
    id: 'spirit', name: 'Spirit',
    evidence: ['emf', 'spiritbox', 'writing'],
    hunt: { base: 50, min: 50, max: 50, note: 'Standard 50% average sanity.' },
    speed: { base: 1.7, los: true, min: 1.7, max: 1.7 * LOS_MULTIPLIER, note: 'Standard 1.7 m/s, LoS speed-up.' },
    incenseBlock: 180,
    tells: [
      'Incense blocks hunts for 180 s instead of 90 s — the only reliable tell.',
      'No unique behaviour otherwise; identify by elimination.'
    ],
    strengths: 'None.',
    weaknesses: 'Incense stops it hunting for twice as long (180 s).',
  },
  {
    id: 'wraith', name: 'Wraith',
    evidence: ['emf', 'spiritbox', 'dots'],
    hunt: { base: 50, min: 50, max: 50, note: 'Standard 50%.' },
    speed: { base: 1.7, los: true, min: 1.7, max: 1.7 * LOS_MULTIPLIER, note: 'Standard 1.7 m/s, LoS speed-up.' },
    tells: [
      'Never steps in salt (no footprints, no salt disturbed) — Gallu also refuses salt while Enraged, so combine with a second tell.',
      'Teleports to a random player, leaving an EMF 2 (or EMF 5) reading far from the ghost room.'
    ],
    strengths: 'Rarely leaves UV footprints; can teleport to players.',
    weaknesses: 'Will not step in salt.',
  },
  {
    id: 'phantom', name: 'Phantom',
    evidence: ['spiritbox', 'uv', 'dots'],
    hunt: { base: 50, min: 50, max: 50, note: 'Standard 50%.' },
    speed: { base: 1.7, los: true, min: 1.7, max: 1.7 * LOS_MULTIPLIER, note: 'Standard 1.7 m/s, LoS speed-up.' },
    tells: [
      'Taking a photo during a ghost event makes it vanish; the photo shows NO ghost.',
      'During hunts it is visible less often (visible ~1 s, invisible ~1–2 s) — flickers far less than an Oni.',
      'Looking at it drains extra sanity (~0.5%/s).',
      'Roams to a random player\'s location.'
    ],
    strengths: 'Looking at it drains sanity quickly.',
    weaknesses: 'Disappears when photographed (photo has no ghost).',
  },
  {
    id: 'poltergeist', name: 'Poltergeist',
    evidence: ['spiritbox', 'uv', 'writing'],
    hunt: { base: 50, min: 50, max: 50, note: 'Standard 50%.' },
    speed: { base: 1.7, los: true, min: 1.7, max: 1.7 * LOS_MULTIPLIER, note: 'Standard 1.7 m/s, LoS speed-up.' },
    tells: [
      '"Explosion" ability throws several objects at once, draining 2% sanity per object to nearby players.',
      'Throws objects farther and more often than any other ghost; throws during hunts.',
      'Barely does anything in a room with no throwables.'
    ],
    strengths: 'Throws many objects at once with great force.',
    weaknesses: 'Nearly powerless in an empty room.',
  },
  {
    id: 'banshee', name: 'Banshee',
    evidence: ['orbs', 'uv', 'dots'],
    hunt: { base: 50, min: 50, max: 50, targetSanity: true, note: '50% of its TARGET\'s sanity, not the team average. Can hunt while team average is high.' },
    speed: { base: 1.7, los: true, min: 1.7, max: 1.7 * LOS_MULTIPLIER, note: 'Standard 1.7 m/s, LoS speed-up.' },
    tells: [
      'Fixates on one player; hunts head straight to that target and ignore others.',
      'Parabolic microphone: ~33% of its paranormal sounds are a unique Banshee scream.',
      'Prefers singing ghost events; roams toward its target even if they are outside.'
    ],
    strengths: 'Hunts based on a single target\'s sanity.',
    weaknesses: 'Unique scream on the parabolic mic; only its target matters.',
  },
  {
    id: 'jinn', name: 'Jinn',
    evidence: ['emf', 'uv', 'freezing'],
    hunt: { base: 50, min: 50, max: 50, note: 'Standard 50%.' },
    speed: { base: 1.7, los: true, min: 1.7, max: 2.5, note: '2.5 m/s with breaker ON, LoS, and player > 3 m away; 1.7 m/s otherwise. Drops to normal within 3 m.',
      variants: [{ label: 'Breaker on, LoS, >3 m', mps: 2.5 }, { label: 'Breaker off / within 3 m', mps: 1.7 }] },
    tells: [
      'Fast (2.5 m/s) approach with breaker on, then normal speed for the last 3 m.',
      'Ability: drains 25% sanity from players within 3 m and gives EMF 2/5 at the fuse box — needs breaker on.',
      'Cannot turn the breaker OFF directly (can still overload it by turning on too many lights).'
    ],
    strengths: 'Fast at range with breaker on; sanity-drain burst.',
    weaknesses: 'Loses all abilities with the breaker off; never turns the breaker off.',
  },
  {
    id: 'mare', name: 'Mare',
    evidence: ['spiritbox', 'orbs', 'writing'],
    hunt: { base: 50, min: 40, max: 60, note: '60% if the ghost is in a DARK room; 40% if its room is LIT.' },
    speed: { base: 1.7, los: true, min: 1.7, max: 1.7 * LOS_MULTIPLIER, note: 'Standard 1.7 m/s, LoS speed-up.' },
    tells: [
      'Never turns a light ON; may turn one off immediately after you switch it on.',
      'Prefers dark rooms to roam to and hunts early (60%) in the dark.',
      'More light-shatter / bulb-break ghost events.'
    ],
    strengths: 'Hunts early in darkness (60%).',
    weaknesses: 'Light on in its room drops threshold to 40%; will never turn on lights.',
  },
  {
    id: 'revenant', name: 'Revenant',
    evidence: ['writing', 'orbs', 'freezing'],
    hunt: { base: 50, min: 50, max: 50, note: 'Standard 50%.' },
    speed: { base: 1.0, los: false, min: 1.0, max: 3.0, note: '1.0 m/s while searching; instantly 3.0 m/s once it detects a player (no gradual LoS ramp). Slows back to 1.0 shortly after losing you.',
      variants: [{ label: 'Searching / no target', mps: 1.0 }, { label: 'Player detected', mps: 3.0 }] },
    tells: [
      'Footsteps: painfully slow (1.0 m/s) until it sees you, then very fast (3.0 m/s).',
      'Hides and stays hidden — it cannot be looped.'
    ],
    strengths: 'Extremely fast once a player is detected.',
    weaknesses: 'Very slow when no player is detected.',
  },
  {
    id: 'shade', name: 'Shade',
    evidence: ['emf', 'writing', 'freezing'],
    hunt: { base: 35, min: 35, max: 35, note: '35% — lowest fixed threshold. Will NOT hunt while any player is in its room.' },
    speed: { base: 1.7, los: true, min: 1.7, max: 1.7 * LOS_MULTIPLIER, note: 'Standard 1.7 m/s, LoS speed-up.' },
    tells: [
      'No hunt until team average is below 35%.',
      'Never hunts or does ghost events while a player is in its current room.',
      'Very low activity with several players nearby; more shadow-form events.'
    ],
    strengths: 'Shy — hard to find evidence with people nearby.',
    weaknesses: 'Cannot hunt with a player in its room; hunts only below 35%.',
  },
  {
    id: 'demon', name: 'Demon',
    evidence: ['uv', 'writing', 'freezing'],
    hunt: { base: 70, min: 70, max: 100, note: '70% normally; rare ability lets it hunt at ANY sanity. Hunt cooldown 20 s (others 25 s).' },
    speed: { base: 1.7, los: true, min: 1.7, max: 1.7 * LOS_MULTIPLIER, note: 'Standard 1.7 m/s, LoS speed-up.' },
    incenseBlock: 60,
    huntCooldown: 20,
    tells: [
      'Hunts above 70% average sanity — even at 100%.',
      'Incense blocks hunts for only 60 s.',
      'Crucifix has 50% larger range against it (Tier 3: 7.5 m instead of 5 m).'
    ],
    strengths: 'Hunts very early and very often.',
    weaknesses: 'Crucifix works from further away.',
  },
  {
    id: 'yurei', name: 'Yurei',
    evidence: ['orbs', 'freezing', 'dots'],
    hunt: { base: 50, min: 50, max: 50, note: 'Standard 50%.' },
    speed: { base: 1.7, los: true, min: 1.7, max: 1.7 * LOS_MULTIPLIER, note: 'Standard 1.7 m/s, LoS speed-up.' },
    tells: [
      'Only ghost that fully CLOSES a door outside of hunts (its ability), draining 15% sanity from players within 7.5 m.',
      'Incense traps it in its current room (stops roaming) for 90 s.'
    ],
    strengths: 'Door-slam ability drains sanity.',
    weaknesses: 'Incense stops it wandering for 90 s.',
  },
  {
    id: 'oni', name: 'Oni',
    evidence: ['emf', 'freezing', 'dots'],
    hunt: { base: 50, min: 50, max: 50, note: 'Standard 50%.' },
    speed: { base: 1.7, los: true, min: 1.7, max: 1.7 * LOS_MULTIPLIER, note: 'Standard 1.7 m/s, LoS speed-up.' },
    tells: [
      'Never does the "airball" (mist) ghost event.',
      'Ghost events drain 20% sanity instead of 10%.',
      'During hunts it flickers less — visible for longer, easier to see.',
      'More active when players are nearby.'
    ],
    strengths: 'Very active with players near; heavy sanity drain from events.',
    weaknesses: 'Very visible during hunts; no mist events.',
  },
  {
    id: 'yokai', name: 'Yokai',
    evidence: ['spiritbox', 'orbs', 'dots'],
    hunt: { base: 50, min: 50, max: 80, note: '80% if players are talking near it; 50% otherwise.' },
    speed: { base: 1.7, los: true, min: 1.7, max: 1.7 * LOS_MULTIPLIER, note: 'Standard 1.7 m/s, LoS speed-up.' },
    tells: [
      'During hunts it only hears voices and electronics within 2.5 m — talk from 3+ m and it ignores you.',
      'Talking near it raises activity and lets it hunt at up to 80%.',
      'Music box: hears it from a much shorter range than other ghosts.'
    ],
    strengths: 'Talking near it makes it more active and hunt early.',
    weaknesses: 'Can only hear you within 2.5 m during hunts.',
  },
  {
    id: 'hantu', name: 'Hantu',
    evidence: ['uv', 'orbs', 'freezing'],
    hunt: { base: 50, min: 50, max: 50, note: 'Standard 50%.' },
    speed: { base: 1.4, los: false, min: 1.4, max: 2.7, note: 'No LoS speed-up. Speed is set by the temperature of the room it is in.',
      variants: [
        { label: '≥ 15 °C', mps: 1.4 }, { label: '12–15 °C', mps: 1.75 }, { label: '9–12 °C', mps: 2.1 },
        { label: '6–9 °C', mps: 2.3 }, { label: '3–6 °C', mps: 2.5 }, { label: '< 3 °C', mps: 2.7 }
      ] },
    tells: [
      'Speed changes room to room with temperature; fastest in cold, no speed-up from seeing you.',
      'Visible freezing breath during hunts when the breaker is OFF.',
      'Never turns the breaker ON; more likely to turn it off.'
    ],
    strengths: 'Very fast in cold areas.',
    weaknesses: 'Slow in warm rooms; will not turn the breaker on.',
  },
  {
    id: 'goryo', name: 'Goryo',
    evidence: ['emf', 'uv', 'dots'],
    hunt: { base: 50, min: 50, max: 50, note: 'Standard 50%.' },
    speed: { base: 1.7, los: true, min: 1.7, max: 1.7 * LOS_MULTIPLIER, note: 'Standard 1.7 m/s, LoS speed-up.' },
    tells: [
      'D.O.T.S. silhouette only shows through a video camera, and only when no player is in the room.',
      'Rarely roams far from its room; cannot change favourite room (except via Monkey Paw).'
    ],
    strengths: 'DOTS only visible on camera.',
    weaknesses: 'Stays close to its room.',
  },
  {
    id: 'myling', name: 'Myling',
    evidence: ['emf', 'uv', 'writing'],
    hunt: { base: 50, min: 50, max: 50, note: 'Standard 50%.' },
    speed: { base: 1.7, los: true, min: 1.7, max: 1.7 * LOS_MULTIPLIER, note: 'Standard 1.7 m/s, LoS speed-up.' },
    tells: [
      'Hunt footsteps are audible only within ~12 m (others ~20 m) — you hear steps only once equipment is already glitching.',
      'More frequent paranormal sounds on the parabolic microphone.'
    ],
    strengths: 'Quiet footsteps during hunts.',
    weaknesses: 'Chatty on the parabolic mic.',
  },
  {
    id: 'onryo', name: 'Onryo',
    evidence: ['spiritbox', 'orbs', 'freezing'],
    hunt: { base: 60, min: 60, max: 100, note: '60% average sanity, OR every 3rd flame it blows out triggers a hunt attempt at any sanity. A lit flame within 4 m blocks hunts like a crucifix.' },
    speed: { base: 1.7, los: true, min: 1.7, max: 1.7 * LOS_MULTIPLIER, note: 'Standard 1.7 m/s, LoS speed-up.' },
    tells: [
      'Blows out candles/lighters far more often; every 3rd extinguished flame can start a hunt.',
      'Hunt attempt right after a flame goes out while a crucifix is far away.',
      'Won\'t hunt while a lit flame is within 4 m (it snuffs the flame instead — 3 flames = 3 "crucifix" uses).'
    ],
    strengths: 'Blowing out flames can trigger hunts regardless of sanity.',
    weaknesses: 'Lit flames act as crucifixes.',
  },
  {
    id: 'twins', name: 'The Twins',
    evidence: ['emf', 'spiritbox', 'freezing'],
    hunt: { base: 50, min: 50, max: 50, note: 'Standard 50%.' },
    speed: { base: 1.7, los: true, min: 1.53, max: 1.87 * LOS_MULTIPLIER, note: 'Two hunt speeds: 1.53 m/s (−10%) for the main twin, 1.87 m/s (+10%) for the decoy. Both gain LoS speed-up.',
      variants: [{ label: 'Main twin', mps: 1.53 }, { label: 'Decoy twin', mps: 1.87 }] },
    tells: [
      'Two interactions at once in different places (up to ~16 m apart); EMF pings in two spots.',
      'Hunts can start from the decoy — away from the ghost room — and speeds alternate between slightly slow and slightly fast.'
    ],
    strengths: 'Either twin can start a hunt; interacts in two places.',
    weaknesses: 'Simultaneous interactions give it away.',
  },
  {
    id: 'raiju', name: 'Raiju',
    evidence: ['emf', 'orbs', 'dots'],
    hunt: { base: 50, min: 50, max: 65, note: '65% when near ACTIVE electronics; 50% otherwise.' },
    speed: { base: 1.7, los: true, min: 1.7, max: 2.5, note: '2.5 m/s (flat) when within range of active electronics: 6 m small / 8 m medium / 10 m large maps. 1.7 m/s with LoS ramp otherwise.',
      variants: [{ label: 'Near active electronics', mps: 2.5 }, { label: 'No electronics nearby', mps: 1.7 }] },
    tells: [
      'Electronics glitch from ~15 m during hunts (others 10 m).',
      'Fast (2.5 m/s) around any switched-on equipment — drop electronics to slow it.',
      'Hunts at 65% with equipment on nearby.'
    ],
    strengths: 'Speed boost from active electronics; hunts early near them.',
    weaknesses: 'Interferes with electronics from further away, giving early warning.',
  },
  {
    id: 'obake', name: 'Obake',
    evidence: ['emf', 'uv', 'orbs'],
    hunt: { base: 50, min: 50, max: 50, note: 'Standard 50%.' },
    speed: { base: 1.7, los: true, min: 1.7, max: 1.7 * LOS_MULTIPLIER, note: 'Standard 1.7 m/s, LoS speed-up.' },
    tells: [
      'Unique prints: 6-fingered handprint or a 2-finger print on light switches (~1 in 6 of its prints).',
      'Only 75% chance to leave UV evidence when interacting (others 100%).',
      'Shapeshifts into another ghost model for one flicker during a hunt.'
    ],
    strengths: 'Sometimes leaves no UV evidence.',
    weaknesses: 'Six-fingered / two-finger prints betray it.',
  },
  {
    id: 'mimic', name: 'The Mimic',
    evidence: ['spiritbox', 'uv', 'freezing'],
    fakeEvidence: 'orbs',
    hunt: { base: 50, min: 0, max: 100, note: 'Copies the current mimicked ghost\'s threshold — can be anything.' },
    speed: { base: 1.7, los: true, min: 0.4, max: 3.71, note: 'Copies the mimicked ghost\'s speed rules; changes every 30 s – 2 min.' },
    tells: [
      'ALWAYS shows Ghost Orbs in addition to its real evidence (so 4 evidences on a 3-evidence difficulty).',
      'Behaviour changes over time — a speed or threshold that stops matching one ghost.',
      'Copies abilities too (e.g. Wraith salt avoidance, Revenant speed, Obake prints).'
    ],
    strengths: 'Mimics another ghost\'s behaviour, switching every 30 s – 2 min.',
    weaknesses: 'Always presents fake Ghost Orbs.',
  },
  {
    id: 'moroi', name: 'Moroi',
    evidence: ['spiritbox', 'writing', 'freezing'],
    hunt: { base: 50, min: 50, max: 50, note: 'Standard 50%.' },
    speed: { base: 1.5, los: true, min: 1.5, max: 2.25 * LOS_MULTIPLIER, note: '1.5 m/s at ≥ 45% average sanity, scaling linearly to 2.25 m/s at 0%. LoS ramp applies on top (max ≈ 3.71 m/s).',
      variants: [{ label: '≥ 45% sanity', mps: 1.5 }, { label: '≈ 22% sanity', mps: 1.875 }, { label: '0% sanity', mps: 2.25 }] },
    incenseBlind: 7.5,
    tells: [
      'Gets faster as the team\'s sanity drops.',
      'Curses the player who gets a Spirit Box response or hears it on the parabolic — cursed sanity drain is doubled until pills are taken.',
      'Incense during a hunt blinds it for 7.5 s (others 5 s).'
    ],
    strengths: 'Faster the lower your sanity; curses via Spirit Box.',
    weaknesses: 'Incense blinds it longer.',
  },
  {
    id: 'deogen', name: 'Deogen',
    evidence: ['spiritbox', 'writing', 'dots'],
    hunt: { base: 40, min: 40, max: 40, note: '40% average sanity.' },
    speed: { base: 3.0, los: false, min: 0.4, max: 3.0, note: 'No LoS ramp. 3.0 m/s when > 6 m from its target, slowing linearly to 0.4 m/s within 2.5 m.',
      variants: [{ label: '> 6 m away', mps: 3.0 }, { label: 'Within 2.5 m', mps: 0.4 }] },
    tells: [
      'Always knows where you are — hiding is useless — but crawls to 0.4 m/s once it reaches you. Walk backwards around it.',
      'Spirit Box within 1 m gives a unique heavy-breathing response.',
      'Hunts at 40%.'
    ],
    strengths: 'Always knows your location.',
    weaknesses: 'Very slow when close; unique Spirit Box breathing.',
  },
  {
    id: 'thaye', name: 'Thaye',
    evidence: ['writing', 'orbs', 'dots'],
    hunt: { base: 75, min: 15, max: 75, note: 'Starts at 75%; drops 6% per age (max 10 ages) down to 15%.' },
    speed: { base: 2.75, los: false, min: 1.0, max: 2.75, note: 'No LoS ramp. Starts 2.75 m/s; each age (every 1–2 min with a player nearby) removes 0.175 m/s, down to 1.0 m/s at age 10.',
      variants: [{ label: 'Age 0', mps: 2.75 }, { label: 'Age 5', mps: 1.875 }, { label: 'Age 10', mps: 1.0 }] },
    tells: [
      'Hyper-active and fast early in the contract; becomes slow and passive as time passes near players.',
      'Ouija board "How old are you?" returns a number that increases over the match.'
    ],
    strengths: 'Very fast and aggressive at the start.',
    weaknesses: 'Ages into a slow, quiet ghost.',
  },
  // ───────────── Winter's Jest v0.15.1 (Dec 2025) ─────────────
  {
    id: 'dayan', name: 'Dayan',
    evidence: ['emf', 'orbs', 'spiritbox'],
    hunt: { base: 50, min: 45, max: 65, note: '65% if a player within 10 m is MOVING; 45% if players within 10 m are STILL; 50% with nobody within 10 m.' },
    speed: { base: 1.7, los: true, min: 1.2, max: 2.25, note: 'Within 10 m of a player: 2.25 m/s if that player is moving, 1.2 m/s if they stand still. 1.7 m/s (with LoS ramp) when no player is within 10 m.',
      variants: [{ label: 'Player moving within 10 m', mps: 2.25 }, { label: 'Player still within 10 m', mps: 1.2 }, { label: 'Nobody within 10 m', mps: 1.7 }] },
    tells: [
      'Stand-still test: freeze during a hunt and its footsteps slow right down; run and it speeds up sharply.',
      'Always presents as a female ghost model/voice.',
      'Hunts early (65%) if you keep moving near it.'
    ],
    strengths: 'Grows stronger when players move near it.',
    weaknesses: 'Weakens when nearby players stand still.',
  },
  {
    id: 'obambo', name: 'Obambo',
    evidence: ['writing', 'uv', 'dots'],
    hunt: { base: 50, min: 10, max: 65, note: 'Two states on a fixed clock: CALM hunts at 10%, AGGRESSIVE at 65%. Starts Calm; first switch 1 min after the exit door opens, then every 2 min.' },
    speed: { base: 1.7, los: true, min: 1.445, max: 1.955 * LOS_MULTIPLIER, note: 'Calm 1.445 m/s; Aggressive 1.955 m/s. LoS ramp applies. State can flip mid-hunt.',
      variants: [{ label: 'Calm state', mps: 1.445 }, { label: 'Aggressive state', mps: 1.955 }] },
    tells: [
      'Hunts started in the Aggressive state are 20% shorter.',
      'Alternates slightly-slow / slightly-fast on a two-minute cycle; a hunt at 65% followed by none until ~10%.',
      'Activity level does NOT indicate state — trust the timer.'
    ],
    strengths: 'Quick to start hunting while Aggressive.',
    weaknesses: 'Slow to hunt and easy to track while Calm.',
  },
  {
    id: 'gallu', name: 'Gallu',
    evidence: ['emf', 'uv', 'spiritbox'],
    hunt: { base: 50, min: 40, max: 60, note: 'Normal 50%; ENRAGED 60%; WEAKENED 40%. Protective items (crucifix, salt, incense) push it toward Enraged; being Enraged exhausts it into Weakened.' },
    speed: { base: 1.7, los: true, min: 1.36, max: 1.955 * LOS_MULTIPLIER, note: 'Normal 1.7 m/s; Enraged 1.955 m/s (+15%); Weakened 1.36 m/s (−20%). LoS ramp applies.',
      variants: [{ label: 'Normal', mps: 1.7 }, { label: 'Enraged', mps: 1.955 }, { label: 'Weakened', mps: 1.36 }] },
    tells: [
      'Enraged: will NOT step in salt (Wraith-like), crucifix range is reduced, hunts are shorter and faster.',
      'Weakened: slower, hunts later (40%), protective items work better.',
      'Rhythm of "worse then better" after you use crucifix/salt/incense.'
    ],
    strengths: 'Protective equipment provokes it and weakens that equipment.',
    weaknesses: 'Being Enraged exhausts it, making protective gear more effective afterwards.',
  },
  // ───────────── v0.17.x (May 2026) ─────────────
  {
    id: 'kormos', name: 'Kormos',
    evidence: ['orbs', 'spiritbox', 'uv'],
    hunt: { base: 50, min: 50, max: 70, note: '50% normally; 70% if a player is SPRINTING near it.' },
    speed: { base: 1.7, los: true, min: 1.7, max: 2.21, note: '1.7 m/s roaming; 2.21 m/s when travelling toward a sound it heard. Detects by hearing: sprint 30 m, walk 15 m, crouch 10 m. Only "sees" within 5 m unobstructed.',
      variants: [{ label: 'Travelling to a sound', mps: 2.21 }, { label: 'Wandering', mps: 1.7 }] },
    tells: [
      'Blind: stand still and silent (mic muted, equipment off) during a hunt and it walks past you.',
      'Sprinting anywhere near it lets it hunt at 70%.',
      'Sprint → it beelines toward you from up to 30 m.'
    ],
    strengths: 'Exceptional hearing; hunts early when players sprint nearby.',
    weaknesses: 'Blind — cannot find silent, stationary players.',
  },
  {
    id: 'aswang', name: 'Aswang',
    evidence: ['freezing', 'writing', 'dots'],
    hunt: { base: 50, min: 50, max: 50, note: 'Standard 50%.' },
    speed: { base: 1.53, los: true, min: 1.53, max: 2.53, note: '1.53 m/s base (−10%) but reaches full LoS speed (≈2.53 m/s) in ~17 s instead of ~26 s.',
      variants: [{ label: 'Base', mps: 1.53 }, { label: 'Max LoS chase', mps: 2.53 }] },
    tells: [
      'A hunt ENDS immediately when it reaches an official hiding spot (locker/closet) that a detected player is inside — it cannot kill you there.',
      'Slightly slow start, then accelerates unusually fast once it has you in sight.',
      'Prefers chasing over searching.'
    ],
    strengths: 'Accelerates faster than any other ghost once it spots you.',
    weaknesses: 'Cannot kill players in official hiding spots.',
  },
  // ───────────── v0.18.0 (Jul 2026) ─────────────
  {
    id: 'deildegast', name: 'Deildegast',
    evidence: ['emf', 'writing', 'dots'],
    hunt: { base: 50, min: 50, max: 50, note: 'Standard 50%.' },
    speed: { base: 3.0, los: false, min: 0.4, max: 3.0, note: 'No LoS ramp. Starts at a flat 3.0 m/s; every unique non-equipment item players pick up/move lowers it by 0.1 m/s, down to 0.4 m/s (26 items).',
      variants: [{ label: '0 items moved', mps: 3.0 }, { label: '9 items', mps: 2.1 }, { label: '13 items', mps: 1.7 }, { label: '26+ items', mps: 0.4 }] },
    tells: [
      'Fast (3.0 m/s) from the first hunt with NO speed-up when it sees you — unlike a Revenant.',
      'Moves house items on its own, and rarely touches doors/switches (~10% vs 25%).',
      '"Tidy the house": pick up 10–15 different props and the next hunt is noticeably slower.'
    ],
    strengths: 'Highest base hunt speed in the game.',
    weaknesses: 'Every unique object players move slows it down.',
  },
];

export { EVIDENCE, GHOSTS, TIMERS, LOS_MULTIPLIER };
