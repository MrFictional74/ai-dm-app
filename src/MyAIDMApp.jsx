import React, { useState, useEffect, useRef, useCallback } from "react";

// ─── FONTS ────────────────────────────────────────────────────────────────────
// Inject Google Fonts + font-face fallback stack into the document head
(function injectFonts() {
  try {
    if (!document || !document.head) return;
    if (document.getElementById("dnd-fonts")) return;
    const link = document.createElement("link");
    link.id = "dnd-fonts";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=Cinzel+Decorative:wght@700&family=Cormorant+SC:wght@400;600&family=EB+Garamond:ital,wght@0,400;0,500;1,400&family=Lato:wght@400;700&display=swap";
    document.head.appendChild(link);
    const style = document.createElement("style");
    style.textContent = `
      :root {
        --font-display:  'Modesto Condensed', 'Cinzel Decorative', 'Cinzel', Georgia, serif;
        --font-smallcap: 'Mrs Eaves', 'Cormorant SC', 'Palatino Linotype', serif;
        --font-body:     'Bookmania', 'EB Garamond', 'Palatino Linotype', Georgia, serif;
        --font-ui:       'Scala Sans', 'FF Scala Sans', 'Lato', 'Gill Sans', sans-serif;
      }
      * { box-sizing: border-box; }
      select option { font-family: var(--font-ui); }
    `;
    document.head.appendChild(style);
  } catch(e) {}
})();

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const CONDITIONS = ["Blinded","Charmed","Deafened","Exhausted","Frightened","Grappled","Incapacitated","Invisible","Paralyzed","Petrified","Poisoned","Prone","Restrained","Stunned","Unconscious"];
const SPELL_SLOT_LEVELS = [1,2,3,4,5,6,7,8,9];

const STORAGE_KEYS = {
  WORLD: "dnd_world_state",
  PARTY: "dnd_party",
  MESSAGES: "dnd_messages",
  LOCATION: "dnd_location",
  SETUP_DONE: "dnd_setup_done",
  INITIATIVE: "dnd_initiative",
  ACTIVE_PLAYER: "dnd_active_player",
  NOTES: "dnd_notes",
  DM_PERSONALITY: "dnd_dm_personality",
  XP: "dnd_xp",
  SESSION_LOG: "dnd_session_log",
};

const defaultLocation = {
  name: "Unknown",
  environment: "...",
  weather: "Clear",
  timeOfDay: "Dawn",
};

const emptyCharacter = () => ({
  id: Date.now() + Math.random(),
  name: "",
  race: "",
  classLevel: "",
  hpCurrent: "",
  hpMax: "",
  ac: "",
  speed: "",
  initiative: "",
  passivePerception: "",
  spellSlots: { 1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0,9:0 },
  spellSlotsUsed: { 1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0,9:0 },
  conditions: [],
  deathSaves: { successes: 0, failures: 0 },
  inspiration: false,
});

const VAULT_KEY = "dnd_character_vault"; // global, not per-slot

// Full 5e character sheet model
const emptySheet = () => ({
  id: Date.now() + Math.random(),
  // Header
  name: "", classLevel: "", background: "", race: "", alignment: "", xp: "",
  // Ability scores
  str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
  // Proficiency bonus
  profBonus: 2,
  // Saving throws (proficient = true)
  savingThrows: { str:false, dex:false, con:false, int:false, wis:false, cha:false },
  // Skills
  skills: {
    acrobatics:false, animalHandling:false, arcana:false, athletics:false,
    deception:false, history:false, insight:false, intimidation:false,
    investigation:false, medicine:false, nature:false, perception:false,
    performance:false, persuasion:false, religion:false, sleightOfHand:false,
    stealth:false, survival:false,
  },
  // Combat
  ac: "", initiative: "", speed: "", hpMax: "", hpCurrent: "", hpTemp: "",
  hitDice: "", hitDiceUsed: "",
  deathSaves: { successes: 0, failures: 0 },
  // Attacks
  attacks: [
    { name:"", atkBonus:"", damage:"", type:"" },
    { name:"", atkBonus:"", damage:"", type:"" },
    { name:"", atkBonus:"", damage:"", type:"" },
  ],
  // Equipment & Currency
  cp:"", sp:"", ep:"", gp:"", pp:"",
  equipment: "",
  // Personality
  personalityTraits: "", ideals: "", bonds: "", flaws: "",
  // Features
  featuresTraits: "",
  // Other proficiencies & languages
  otherProficiencies: "",
  // Passive perception
  passivePerception: "",
  // Inventory
  inventory: "",
  gold: "",
  sheetNotes: "",
  // Spells
  spellcastingClass:"", spellcastingAbility:"", spellSaveDC:"", spellAtkBonus:"",
  spellSlots:     { 1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0,9:0 },
  spellSlotsUsed: { 1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0,9:0 },
  // spells: array of spell entries per level (0=cantrips, 1-9=leveled)
  spells: {
    0:[], 1:[], 2:[], 3:[], 4:[], 5:[], 6:[], 7:[], 8:[], 9:[]
  },
  // Conditions & inspiration (mirrored to game panel)
  conditions: [],
  inspiration: false,
});

const ABILITY_KEYS = ["str","dex","con","int","wis","cha"];
const SKILL_MAP = {
  acrobatics:"dex", animalHandling:"wis", arcana:"int", athletics:"str",
  deception:"cha", history:"int", insight:"wis", intimidation:"cha",
  investigation:"int", medicine:"wis", nature:"int", perception:"wis",
  performance:"cha", persuasion:"cha", religion:"int", sleightOfHand:"dex",
  stealth:"dex", survival:"wis",
};
const abilityMod = (score) => Math.floor((Number(score) - 10) / 2);
const fmtMod = (n) => (n >= 0 ? "+" : "") + n;

const emptySpell = () => ({
  name: "", prepared: false,
  castingTime: "", range: "", duration: "", concentration: false,
  components: { v: false, s: false, m: false }, materials: "",
  description: "",
});

function loadVault() {
  try { const v = localStorage.getItem(VAULT_KEY); return v ? JSON.parse(v) : []; } catch { return []; }
}
function saveVault(chars) {
  try { localStorage.setItem(VAULT_KEY, JSON.stringify(chars)); } catch {}
}

// Convert a full sheet to the compact game-panel character format
function sheetToGameChar(sheet) {
  const dexMod = abilityMod(sheet.dex);
  return {
    id: sheet.id,
    name: sheet.name,
    race: sheet.race,
    classLevel: sheet.classLevel,
    hpCurrent: sheet.hpCurrent,
    hpMax: sheet.hpMax,
    ac: sheet.ac,
    speed: sheet.speed,
    initiative: sheet.initiative || fmtMod(dexMod),
    passivePerception: sheet.passivePerception || String(10 + abilityMod(sheet.wis) + (sheet.skills.perception ? sheet.profBonus : 0)),
    spellSlots: sheet.spellSlots,
    spellSlotsUsed: sheet.spellSlotsUsed,
    conditions: sheet.conditions || [],
    deathSaves: sheet.deathSaves,
    inspiration: sheet.inspiration,
    sheetId: sheet.id, // link back to vault
  };
}

// Merge game-panel updates back into a vault sheet
function mergeGameIntoSheet(sheet, gameChar) {
  return {
    ...sheet,
    hpCurrent: gameChar.hpCurrent,
    hpMax: gameChar.hpMax,
    ac: gameChar.ac,
    speed: gameChar.speed,
    initiative: gameChar.initiative,
    passivePerception: gameChar.passivePerception,
    spellSlots: gameChar.spellSlots,
    spellSlotsUsed: gameChar.spellSlotsUsed,
    conditions: gameChar.conditions,
    deathSaves: gameChar.deathSaves,
    inspiration: gameChar.inspiration,
  };
}

const DEFAULT_PERSONALITY = {
  seriousness:   50, // 0=comedic  100=dead serious
  warmth:        50, // 0=harsh    100=warm/encouraging
  sarcasm:       30, // 0=sincere  100=dripping sarcasm
  combat:        50, // 0=story    100=combat
  darkness:      50, // 0=heroic   100=gritty/dark
  verbosity:     30, // 0=terse    100=verbose
  ruleStrictness:60, // 0=rule of cool 100=strict RAW
  lethality:     50, // 0=forgiving 100=deadly
  mystery:       50, // 0=transparent 100=cryptic/mysterious
  xpGenerosity:  50, // 0=stingy   100=very generous
};

// ─── COLOR THEMES ─────────────────────────────────────────────────────────────
const THEMES = {
  standard: {
    name: "Standard",
    // Parchment / PHB book colors
    bg:          "#f0e8d8",
    bgPanel:     "#f5ede0",
    bgCard:      "#fdf6ea",
    bgStripe:    "#e8d8c0",
    border:      "#c8a870",
    borderStrong:"#8a1a10",
    accent:      "#58150d",
    accentLight: "#8a1a10",
    gold:        "#f0d090",
    textPrimary: "#1a0a00",
    textSecondary:"#6a4020",
    textMuted:   "#8a6040",
    headerBg:    "#58150d",
    msgBg:       "#fdf6ea",
    inputBg:     "#fdf6ea",
    dmLabelColor:"#58150d",
    playerLabelColor:"#2a5a2a",
  },
  dark: {
    name: "Dark",
    // Dark dungeon — deep blacks, blood red accents, dim gold
    bg:          "#0e0a06",
    bgPanel:     "#120d08",
    bgCard:      "#1a1208",
    bgStripe:    "#160e06",
    border:      "#3a2a14",
    borderStrong:"#6a1a10",
    accent:      "#8a1a10",
    accentLight: "#c84a20",
    gold:        "#c8962a",
    textPrimary: "#d4b896",
    textSecondary:"#8a6840",
    textMuted:   "#5a4030",
    headerBg:    "#0a0604",
    msgBg:       "#14100a",
    inputBg:     "#14100a",
    dmLabelColor:"#c8962a",
    playerLabelColor:"#4a8a4a",
  },
  monochrome: {
    name: "Black & White",
    bg:          "#f2f2f2",
    bgPanel:     "#ffffff",
    bgCard:      "#ffffff",
    bgStripe:    "#e8e8e8",
    border:      "#bbbbbb",
    borderStrong:"#333333",
    accent:      "#2c2c2c",
    accentLight: "#555555",
    gold:        "#ffffff",
    textPrimary: "#1a1a1a",
    textSecondary:"#444444",
    textMuted:   "#888888",
    headerBg:    "#2c2c2c",
    msgBg:       "#ffffff",
    inputBg:     "#ffffff",
    dmLabelColor:"#2c2c2c",
    playerLabelColor:"#555555",
  },
};

const THEME_STORAGE_KEY = "dnd_color_theme";

// ─── UTILITY ─────────────────────────────────────────────────────────────────
function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// ─── SPEECH INPUT ─────────────────────────────────────────────────────────────
const HAS_STT = (() => { try { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); } catch(e) { return false; } })();
// ─── DM SYSTEM PROMPT ────────────────────────────────────────────────────────
function buildSystemPrompt(worldState, party, location, initiativeOrder, activePlayer, personality, sessionLog) {
  const inCombat = initiativeOrder && initiativeOrder.length > 0;
  const p = personality || DEFAULT_PERSONALITY;
  const partyInfo = party.map(c => ({
    name: c.name, race: c.race, classLevel: c.classLevel,
    hp: c.hpCurrent + "/" + c.hpMax, ac: c.ac,
    speed: c.speed, initiative: c.initiative,
    passivePerception: c.passivePerception,
    conditions: c.conditions, inspiration: c.inspiration,
  }));
  const activeName = activePlayer === "__PARTY__"
    ? "The Whole Party (all characters acting together)"
    : (activePlayer || (party[0] && party[0].name));
  const combatLine = inCombat
    ? "COMBAT ACTIVE — INITIATIVE ORDER: " + initiativeOrder.map((e,i) => (i+1) + ". " + e.name + " (" + e.initiative + ")").join(", ") + "\nCURRENT TURN: " + activeName
    : "ACTIVE PLAYER: " + activeName;

  // Build personality description from sliders
  const personalityDesc = [
    p.seriousness > 70 ? "You are dead serious — no jokes, no levity." : p.seriousness < 30 ? "You have a comedic streak — light, fun, occasionally silly." : "You balance drama with moments of levity.",
    p.warmth > 70 ? "You are warm and encouraging — celebrate player victories, soften failures." : p.warmth < 30 ? "You are harsh and unsympathetic — the world is brutal, don't coddle." : "You are fair but not soft.",
    p.sarcasm > 60 ? "You deploy dry wit and sarcasm frequently — NPCs, descriptions, reactions." : p.sarcasm < 20 ? "You are completely sincere — no irony or sarcasm." : "You use sarcasm sparingly for effect.",
    p.combat > 70 ? "You prioritize combat encounters, tactics, and action. Push toward conflict." : p.combat < 30 ? "You prioritize story, roleplay, and character moments over combat." : "You balance combat and story equally.",
    p.darkness > 70 ? "The world is gritty, dark, and dangerous. Consequences are severe. Death is real." : p.darkness < 30 ? "The world is heroic and hopeful. Triumph is possible. Tone is adventurous." : "The world has darkness but hope persists.",
    p.verbosity > 60 ? "Be descriptive and atmospheric — paint vivid scenes." : p.verbosity < 25 ? "Be extremely terse. One or two sentences max unless something is truly important." : "Keep descriptions tight but evocative.",
    p.ruleStrictness > 70 ? "Enforce D&D 5e rules strictly and precisely. Call out rule violations." : p.ruleStrictness < 30 ? "Rule of Cool applies — if it's dramatic and fun, allow it even if it bends rules." : "Follow rules but allow creative interpretations.",
    p.lethality > 70 ? "This is a deadly campaign — enemies are dangerous, mistakes have grave consequences." : p.lethality < 30 ? "Be forgiving — players should feel heroic, near-death escapes are dramatic not fatal." : "Danger is real but survivable with good play.",
    p.mystery > 70 ? "Be cryptic and mysterious — hint at deeper truths, never reveal everything." : p.mystery < 30 ? "Be transparent — players can understand the world around them clearly." : "Sprinkle mystery but don't leave players confused.",
    p.xpGenerosity > 70 ? "Be very generous with XP — award it frequently for almost any positive action, good roleplay, or creative thinking." : p.xpGenerosity < 30 ? "Be stingy with XP — only award it for significant accomplishments." : "Award XP fairly — meaningful accomplishments earn meaningful rewards.",
  ].join(" ");

  return `You are an expert Dungeon Master for a D&D 5th Edition (2024 rules) campaign.

DM PERSONALITY: ${personalityDesc}

WORLD STATE:
${JSON.stringify(worldState, null, 2)}

CURRENT PARTY (these stats are player-managed — treat them as authoritative):
${JSON.stringify(partyInfo, null, 2)}

CURRENT LOCATION:
${JSON.stringify(location, null, 2)}

${combatLine}

PLAYER STATS RULES:
- The party info above reflects what players have entered on their character sheets. Always use these values for HP, AC, Speed, Initiative, and Passive Perception — never invent or override them.
- NEVER auto-update player HP, AC, speed, or any other stat in your JSON. Players update their own stats. You may only output hpUpdate JSON to SUGGEST what HP should be after damage/healing — but narrate it as a consequence ("You take 7 damage") not as a system update.
- When asking for initiative rolls, reference the player's initiative bonus from their sheet above.
- When movement is used, reference their Speed from the sheet.
- If a stat is blank or missing, ask the player to provide it rather than guessing.

XP TRACKING:
- Award XP for: defeating enemies (use CR-based values), resolving encounters creatively, completing quests/objectives, strong roleplay, clever skill use, discovering secrets, major story moments.
- Whenever XP is earned, output an xpAward JSON block with the amount and a short reason. Be generous — award XP frequently for good play.
- Standard CR XP values: CR0=10, CR¼=50, CR½=100, CR1=200, CR2=450, CR3=700, CR4=1100, CR5=1800, CR6=2300, CR8=3900, CR10=5900.
- Also output a sessionLogEntry JSON block for significant events (combats won, major decisions, deaths, discoveries, notable achievements) — keep entries brief (1 sentence max).
- Reference the session log provided in world state to maintain story continuity and recall past events naturally in narration.

SESSION LOG (use this for story continuity — reference past events naturally):
${JSON.stringify((sessionLog || []).slice(-20).map(e => e.text), null, 2)}

YOUR RULES — GENERAL:
- DEFAULT: Ultra brief. 1-3 sentences only. State what happens, what the players perceive, done.
- Only expand for truly dramatic moments: first encounter with a major villain, entering a legendary location, a character's death, a world-changing event.
- Never describe what the player already knows. No restating the obvious.
- SKILL CHECKS: Use them liberally — sneaking, persuading, noticing, recalling lore, climbing, lying, intimidating, picking locks. In social encounters use Persuasion, Deception, Insight, Intimidation frequently.
- For player rolls: "Roll [Skill/Attack] — give me your total with all modifiers." Wait for their result.
- For enemy/NPC rolls, roll yourself and state in one line (e.g. "Goblin swings — 14 to hit vs your AC. Hits. 5 damage.").

YOUR RULES — COMBAT (D&D 5e 2024):
- ACTION ECONOMY per turn: 1 Action, 1 Bonus Action, 1 Reaction, Movement up to Speed. Track strictly.
- STANDARD ACTIONS: Attack, Cast a Spell, Dash, Disengage, Dodge, Help, Hide, Ready, Search, Use an Object, Grapple, Shove, Improvise.
- BONUS ACTIONS: Class features, off-hand light weapon attack, some spells.
- ATTACKS: Ask player to roll to hit (d20 + attack modifier, give total). Compare to TARGET AC. Announce hit/miss explicitly. Enemy attacks: roll d20 + bonus vs player AC.
- DISTANCE & POSITIONING: Track distances at all times. State at combat start. Enforce range rules: melee=5ft (reach=10ft), ranged weapons have normal/long range, spells have set ranges. If out of range, say so and suggest alternatives.
- CRITICAL HITS: Natural 20 = crit (double dice). Natural 1 = auto miss.
- ADVANTAGE/DISADVANTAGE: Two d20s, take higher/lower. State when it applies.
- CONCENTRATION: Remind players, track breaks (CON save DC 10 or half damage).
- DEATH: 0 HP = unconscious, death saves each turn. 3 successes = stable, 3 failures = dead.
- TURN MANAGEMENT: After every player turn ends (End Turn or all actions used), immediately advance to the next combatant in initiative order and output {"activePlayer": "NextCharacterName"} so the UI updates. Always state clearly whose turn it is at the start of each turn: "It's [Name]'s turn."
- ACTIVE PLAYER VERIFICATION: Before resolving ANY player action or input, always verify it is that player's turn in initiative order. If a player who is NOT the current turn submits an action during combat, gently correct them: "It's actually [CurrentPlayer]'s turn right now — [WrongPlayer], you'll be up in [X] turns." If you are ever unsure whose turn it is, or if something about the action or situation is unclear, ALWAYS ASK rather than assume. When in doubt, ask.
- OUT OF TURN ACTIONS: Reactions (opportunity attacks, Shield spell, Counterspell, etc.) are the only actions allowed outside a player's turn. If a player declares a reaction at the appropriate trigger, resolve it immediately and note it as a reaction.
- NEVER advance the turn or resolve an action unless you are certain which player is acting. If a message is ambiguous about who is acting, ask: "Just to confirm — is this [PlayerName] acting, or [OtherPlayer]?"
- PRE-COMBAT SETUP: Before any initiative is rolled, the DM must establish the following:
  1. POSITIONS: State the starting position and distance of every combatant — players and enemies. E.g. "The two goblins are 30ft ahead on the road. The hobgoblin sergeant is 50ft back near the tree line. The party is clustered at the path entrance." Be specific enough that range and movement decisions are meaningful.
  2. STATE OF READINESS: Describe whether combatants are surprised, alert, in cover, mounted, prone, flanking, etc. E.g. "The goblins haven't spotted you yet — they are surprised this round." or "The bandits are ready and have weapons drawn."
  3. SURPRISE: Determine if any side is surprised (no actions on first turn). If the party was stealthy, call for a group Stealth check vs enemy Passive Perception. If ruleStrictness is high (above 60), always resolve this formally. If ruleStrictness is low (below 40), use narrative judgment and only ask if genuinely ambiguous.
  4. ENVIRONMENT: Briefly note any terrain features relevant to combat — cover, elevation, obstacles, lighting, difficult terrain.
  Only after establishing all of the above, ask for initiative rolls.
- INITIATIVE: Ask ALL players to roll simultaneously in one message listing every player name. E.g. "Everyone roll initiative — d20 + your DEX modifier, give me your total. Waiting on: [every player name]." Roll for all enemies yourself at the same time and note their results. Wait until EVERY player has reported before outputting initiativeOrder JSON. If only some players have rolled, ask remaining players by name. Do NOT output initiativeOrder until all rolls are in.
- Combat end: output initiativeOrder JSON with empty array.
- After each player turn: output actionEconomy JSON.
- ALWAYS end with suggestions JSON. During combat: relevant combat actions for current player.

OUTPUT JSON — append after narrative:
HP (narrate consequence, player updates sheet): \`\`\`json
{"hpUpdate": [{"name": "CharacterName", "hpCurrent": 15}]}
\`\`\`
Location: \`\`\`json
{"locationUpdate": {"name": "...", "environment": "...", "weather": "...", "timeOfDay": "..."}}
\`\`\`
World lore: \`\`\`json
{"worldUpdate": {"key": "value"}}
\`\`\`
Initiative: \`\`\`json
{"initiativeOrder": [{"name": "Name", "initiative": 18}]}
\`\`\`
Turn change: \`\`\`json
{"activePlayer": "CharacterName"}
\`\`\`
Action economy: \`\`\`json
{"actionEconomy": {"action": true, "bonusAction": false, "movement": true, "movementUsed": 20, "movementMax": 30}}
\`\`\`
Distances: \`\`\`json
{"distanceUpdate": [{"name": "Goblin", "distance": 15}]}
\`\`\`
XP award (output whenever XP is earned): \`\`\`json
{"xpAward": {"amount": 200, "reason": "Defeated the goblin patrol"}}
\`\`\`
Session log entry (significant events only, 1 sentence): \`\`\`json
{"sessionLogEntry": "The party defeated a goblin patrol near the Ashwood border."}
\`\`\`
Suggestions (ALWAYS last): \`\`\`json
{"suggestions": ["Action one", "Action two", "Action three", "More Details"]}
\`\`\`
Never break character. D&D 5e 2024 rules apply.`;
}

// ─── SAVE SLOT SYSTEM ────────────────────────────────────────────────────────
const NUM_SLOTS = 6;
const ACTIVE_SLOT_KEY = "dnd_active_slot";

function slotKey(slot, key) { return "slot" + slot + "_" + key; }

function saveSlot(slot, data) {
  try {
    Object.entries(data).forEach(([k, v]) => localStorage.setItem(slotKey(slot, k), JSON.stringify(v)));
  } catch {}
}

function loadSlot(slot) {
  const keys = ["world","party","messages","location","setup_done","initiative","active_player","notes","dm_personality","xp","session_log"];
  const out = {};
  keys.forEach(k => {
    try { const v = localStorage.getItem(slotKey(slot, k)); out[k] = v ? JSON.parse(v) : null; } catch { out[k] = null; }
  });
  return out;
}

function clearSlot(slot) {
  const keys = ["world","party","messages","location","setup_done","initiative","active_player","notes","dm_personality","xp","session_log"];
  keys.forEach(k => localStorage.removeItem(slotKey(slot, k)));
}

function getSlotMeta(slot) {
  try {
    const world = localStorage.getItem(slotKey(slot, "world"));
    const msgs = localStorage.getItem(slotKey(slot, "messages"));
    if (!world) return null;
    const w = JSON.parse(world);
    const m = msgs ? JSON.parse(msgs) : [];
    return { partyName: w.partyName || "Unknown", worldTone: w.worldTone || "", msgCount: m.length };
  } catch { return null; }
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [activeSlot, setActiveSlot] = useState(() => {
    try { const s = localStorage.getItem(ACTIVE_SLOT_KEY); return s ? parseInt(s) : 0; } catch { return 0; }
  });
  const [showSlotModal, setShowSlotModal] = useState(false);
  const [confirmResetSlot, setConfirmResetSlot] = useState(null); // slot index pending reset

  // Helper to load from current slot
  const loadFromSlot = (slot) => {
    const d = loadSlot(slot);
    return {
      setupDone: d.setup_done || false,
      messages: d.messages || [],
      party: d.party || [],
      location: d.location || defaultLocation,
      worldState: d.world || {},
      initiativeOrder: d.initiative || [],
      activePlayer: d.active_player || null,
      notes: d.notes || "",
      dmPersonality: d.dm_personality || DEFAULT_PERSONALITY,
      xp: d.xp || 0,
      sessionLog: d.session_log || [],
    };
  };

  const initial = loadFromSlot(activeSlot);

  // Setup
  const [setupDone, setSetupDone] = useState(initial.setupDone);
  const [setupStep, setSetupStep] = useState(0);
  const [setupData, setSetupData] = useState({ partyName: "", worldTone: "", startingRegion: "" });
  const [setupParty, setSetupParty] = useState([emptyCharacter()]);

  // Game state
  const [messages, setMessages] = useState(initial.messages);
  const [party, setParty] = useState(initial.party);
  const [location, setLocation] = useState(initial.location);
  const [worldState, setWorldState] = useState(initial.worldState);
  const [initiativeOrder, setInitiativeOrder] = useState(initial.initiativeOrder);
  const [activePlayer, setActivePlayer] = useState(initial.activePlayer);
  const [notes, setNotes] = useState(initial.notes);
  const [dmPersonality, setDmPersonality] = useState(initial.dmPersonality);
  const [xp, setXp] = useState(initial.xp);
  const [sessionLog, setSessionLog] = useState(initial.sessionLog);

  // UI state
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [activeCharTab, setActiveCharTab] = useState(0); // setup screen only
  const [viewCharIdx, setViewCharIdx] = useState(0);     // sidebar viewing tab — never affects turn
  const [actionEconomy, setActionEconomy] = useState({ action: false, bonusAction: false, movement: false, movementUsed: 0, movementMax: 0 });
  const [distances, setDistances] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [vault, setVault] = useState(() => loadVault());
  const [openSheetId, setOpenSheetId] = useState(null);
  const [showEndSession, setShowEndSession] = useState(false);
  const [showRecap, setShowRecap] = useState(false);
  const [sessionSummary, setSessionSummary] = useState(null);
  const [endingSession, setEndingSession] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showStartScreen, setShowStartScreen] = useState(() => {
    // Show start screen on first load; skip it if already in an active game
    try { return !localStorage.getItem(ACTIVE_SLOT_KEY); } catch { return true; }
  });
  const [showVaultViewer, setShowVaultViewer] = useState(false);
  const [colorTheme, setColorTheme] = useState(() => {
    try { return localStorage.getItem(THEME_STORAGE_KEY) || "standard"; } catch { return "standard"; }
  });
  const t = THEMES[colorTheme] || THEMES.standard;
  useEffect(() => { try { localStorage.setItem(THEME_STORAGE_KEY, colorTheme); } catch {} }, [colorTheme]);

  // Apply theme CSS variables to document
  useEffect(() => {
    try {
      let el = document.getElementById("dnd-theme");
      if (!el) { el = document.createElement("style"); el.id = "dnd-theme"; document.head.appendChild(el); }
      el.textContent = `:root {
        --t-bg: ${t.bg};
        --t-panel: ${t.bgPanel};
        --t-card: ${t.bgCard};
        --t-stripe: ${t.bgStripe};
        --t-border: ${t.border};
        --t-border-strong: ${t.borderStrong};
        --t-accent: ${t.accent};
        --t-accent-light: ${t.accentLight};
        --t-gold: ${t.gold};
        --t-text: ${t.textPrimary};
        --t-text-sec: ${t.textSecondary};
        --t-text-muted: ${t.textMuted};
        --t-header: ${t.headerBg};
        --t-msg: ${t.msgBg};
        --t-input: ${t.inputBg};
      }`;
    } catch {}
  }, [colorTheme, t]); // which sheet is open in modal

  // Persist vault globally (not per slot)
  useEffect(() => { saveVault(vault); }, [vault]); // [{name, distance}]

  const chatRef = useRef(null);
  const recognitionRef = useRef(null);
  const inputRef = useRef(null);

  // Persist to active slot
  useEffect(() => { saveSlot(activeSlot, { messages: messages.slice(-80) }); }, [messages, activeSlot]);
  useEffect(() => { saveSlot(activeSlot, { party }); }, [party, activeSlot]);
  useEffect(() => { saveSlot(activeSlot, { location }); }, [location, activeSlot]);
  useEffect(() => { saveSlot(activeSlot, { world: worldState }); }, [worldState, activeSlot]);
  useEffect(() => { saveSlot(activeSlot, { setup_done: setupDone }); }, [setupDone, activeSlot]);
  useEffect(() => { saveSlot(activeSlot, { initiative: initiativeOrder }); }, [initiativeOrder, activeSlot]);
  useEffect(() => { saveSlot(activeSlot, { active_player: activePlayer }); }, [activePlayer, activeSlot]);
  useEffect(() => { saveSlot(activeSlot, { notes }); }, [notes, activeSlot]);
  useEffect(() => { saveSlot(activeSlot, { dm_personality: dmPersonality }); }, [dmPersonality, activeSlot]);
  useEffect(() => { saveSlot(activeSlot, { xp }); }, [xp, activeSlot]);
  useEffect(() => { saveSlot(activeSlot, { session_log: sessionLog }); }, [sessionLog, activeSlot]);

  // Scroll chat
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, loading]);

  // On load: if resuming an existing session with log entries, post a short recap after a brief delay
  const hasPostedRecapRef = useRef(false);
  useEffect(() => {
    if (!setupDone || !sessionLog.length || hasPostedRecapRef.current || messages.length === 0) return;
    hasPostedRecapRef.current = true;
    const recentLog = sessionLog.slice(-10).map(e => e.text).join("\n");
    const resumePrompt = `The players are resuming the campaign. Give a very brief "Previously..." recap in 2-3 sentences based on these recent events:\n${recentLog}\n\nThen ask what the party does next. Keep it short and atmospheric.`;
    setTimeout(() => {
      setLoading(true);
      fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: buildSystemPrompt(worldState, party, location, [], activePlayer, dmPersonality, sessionLog),
          messages: [{ role: "user", content: resumePrompt }],
        }),
      }).then(r => r.json()).then(data => {
        const raw = data.content?.map(b => b.text || "").join("") || "";
        let narrative = raw;
        const jsonBlocks = [...raw.matchAll(/```json\s*([\s\S]*?)```/g)];
        for (const match of jsonBlocks) { narrative = narrative.replace(match[0], "").trim(); }
        setMessages(prev => [{ role: "assistant", content: "📖 *Previously on your adventure...*\n\n" + narrative.trim() }, ...prev]);
        setLoading(false);
      }).catch(() => setLoading(false));
    }, 800);
  }, [setupDone]);


  // ── Send message to Claude ────────────────────────────────────────────────
  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || loading) return;
    const playerLabel = activePlayer === "__PARTY__" ? "PARTY" : (activePlayer || "YOU");
    // During combat, prefix free-text with the acting character's name so DM always knows who's acting
    const prefixedText = (initiativeOrder.length > 0 && activePlayer && activePlayer !== "__PARTY__")
      ? activePlayer + ": " + text.trim()
      : text.trim();
    const userMsg = { role: "user", content: prefixedText, player: playerLabel };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setSuggestions([]);

    try {
      const systemPrompt = buildSystemPrompt(worldState, party, location, initiativeOrder, activePlayer, dmPersonality, sessionLog);
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: systemPrompt,
          messages: newMessages.slice(-20).map(m => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await response.json();
      const raw = data.content?.map(b => b.text || "").join("") || "The Dungeon Master is silent...";

      // Parse JSON blocks
      let narrative = raw;
      const jsonBlocks = [...raw.matchAll(/```json\s*([\s\S]*?)```/g)];
      for (const match of jsonBlocks) {
        narrative = narrative.replace(match[0], "").trim();
        try {
          const parsed = JSON.parse(match[1]);
          if (parsed.hpUpdate) {
            setParty(prev => prev.map(c => {
              const upd = parsed.hpUpdate.find(u => u.name.toLowerCase() === c.name.toLowerCase());
              return upd ? { ...c, hpCurrent: upd.hpCurrent } : c;
            }));
          }
          if (parsed.locationUpdate) setLocation(parsed.locationUpdate);
          if (parsed.worldUpdate) setWorldState(prev => ({ ...prev, ...parsed.worldUpdate }));
          if (parsed.suggestions) setSuggestions(parsed.suggestions);
          if (parsed.initiativeOrder !== undefined) {
            setInitiativeOrder(parsed.initiativeOrder);
            if (parsed.initiativeOrder.length === 0) setDistances([]);
          }
          if (parsed.activePlayer) {
            setActivePlayer(parsed.activePlayer);
            setActionEconomy({ action: false, bonusAction: false, movement: false, movementUsed: 0, movementMax: 0 });
            // Auto-switch sidebar to the now-active character
            const idx = party.findIndex(c => c.name === parsed.activePlayer);
            if (idx >= 0) { setActiveCharTab(idx); setViewCharIdx(idx); }
          }
          if (parsed.actionEconomy) setActionEconomy(parsed.actionEconomy);
          if (parsed.distanceUpdate) setDistances(parsed.distanceUpdate);
          if (parsed.xpAward) setXp(prev => prev + (parsed.xpAward.amount || 0));
          if (parsed.sessionLogEntry) setSessionLog(prev => [...prev.slice(-99), { text: parsed.sessionLogEntry, time: Date.now() }]);
        } catch {}
      }

      setMessages(prev => [...prev, { role: "assistant", content: narrative }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: "assistant", content: "*(The DM's voice falters... A connection error occurred.)*" }]);
    }
    setLoading(false);
  }, [messages, worldState, party, location, loading]);

  // ── Voice recognition ─────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    if (!HAS_STT) return; // button is hidden on Firefox anyway
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      sendMessage(transcript);
    };
    rec.onend = () => setListening(false);
    rec.onerror = (e) => { console.warn("STT error:", e.error); setListening(false); };
    recognitionRef.current = rec;
    try { rec.start(); setListening(true); } catch(e) { setListening(false); }
  }, [sendMessage]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  // ── Setup completion ───────────────────────────────────────────────────────
  const completeSetup = async () => {
    const validParty = setupParty.filter(c => c.name.trim());
    if (!validParty.length) return;
    setParty(validParty);
    setSetupDone(true);
    setActivePlayer(validParty[0]?.name || null);

    // Initial DM message
    const intro = `Party Name: ${setupData.partyName || "The Adventurers"}\nWorld Tone: ${setupData.worldTone || "High Fantasy"}\nStarting Region: ${setupData.startingRegion || "A mysterious land"}\n\nBegin the adventure. Set the scene vividly. Introduce the world, the starting location, and an immediate hook that draws the party in. Ask the players what they do.`;
    const ws = { partyName: setupData.partyName, worldTone: setupData.worldTone, startingRegion: setupData.startingRegion, npcsEncountered: [], placesVisited: [], lore: [] };
    setWorldState(ws);
    setMessages([]);

    setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1000,
            system: buildSystemPrompt(ws, validParty, defaultLocation, [], null, dmPersonality, sessionLog),
            messages: [{ role: "user", content: intro }],
          }),
        });
        const data = await res.json();
        const raw = data.content?.map(b => b.text || "").join("") || "";
        let narrative = raw;
        const jsonBlocks = [...raw.matchAll(/```json\s*([\s\S]*?)```/g)];
        for (const match of jsonBlocks) {
          narrative = narrative.replace(match[0], "").trim();
          try {
            const parsed = JSON.parse(match[1]);
            if (parsed.locationUpdate) setLocation(parsed.locationUpdate);
            if (parsed.worldUpdate) setWorldState(prev => ({ ...prev, ...parsed.worldUpdate }));
            if (parsed.suggestions) setSuggestions(parsed.suggestions);
          } catch {}
        }
        setMessages([{ role: "assistant", content: narrative }]);
      } catch {}
      setLoading(false);
    }, 100);
  };

  const switchToSlot = (slot) => {
    const d = loadFromSlot(slot);
    setActiveSlot(slot);
    try { localStorage.setItem(ACTIVE_SLOT_KEY, String(slot)); } catch {}
    setSetupDone(d.setupDone);
    setMessages(d.messages);
    setParty(d.party);
    setLocation(d.location);
    setWorldState(d.worldState);
    setInitiativeOrder(d.initiativeOrder);
    setActivePlayer(d.activePlayer);
    setNotes(d.notes);
    setDmPersonality(d.dmPersonality);
    setXp(d.xp);
    setSessionLog(d.sessionLog);
    setSuggestions([]);
    setSetupStep(0);
    setSetupData({ partyName: "", worldTone: "", startingRegion: "" });
    setSetupParty([emptyCharacter()]);
    setShowSlotModal(false);
  };

  const newCampaignInSlot = (slot) => {
    clearSlot(slot);
    switchToSlot(slot);
  };

  // ── Character helpers ──────────────────────────────────────────────────────
  const updateChar = (id, field, value) => {
    setParty(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  };
  const updateSetupChar = (id, field, value) => {
    setSetupParty(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  };
  const toggleCondition = (charId, cond) => {
    setParty(prev => prev.map(c => {
      if (c.id !== charId) return c;
      const has = c.conditions.includes(cond);
      return { ...c, conditions: has ? c.conditions.filter(x => x !== cond) : [...c.conditions, cond] };
    }));
  };

  // ── Vault management ──────────────────────────────────────────────────────
  const upsertSheet = (sheet) => {
    setVault(prev => {
      const idx = prev.findIndex(s => s.id === sheet.id);
      if (idx >= 0) { const n = [...prev]; n[idx] = sheet; return n; }
      return [...prev, sheet];
    });
  };

  const deleteSheet = (id) => setVault(prev => prev.filter(s => s.id !== id));

  const createCharacterInVault = () => {
    const newSheet = emptySheet();
    upsertSheet(newSheet);
    setOpenSheetId(newSheet.id);
    setShowVaultViewer(false);
    setShowStartScreen(false);
  };

  // When game panel stat changes, sync to vault sheet if linked
  const updateCharAndSync = (id, field, value) => {
    setParty(prev => {
      const updated = prev.map(c => c.id === id ? { ...c, [field]: value } : c);
      // Sync back to vault
      const gameChar = updated.find(c => c.id === id);
      if (gameChar && gameChar.sheetId) {
        setVault(v => v.map(s => s.id === gameChar.sheetId ? mergeGameIntoSheet(s, gameChar) : s));
      }
      return updated;
    });
  };

  // Open sheet modal for a character (find by sheetId or id)
  const openSheet = (gameChar) => {
    const sid = gameChar.sheetId || gameChar.id;
    const sheet = vault.find(s => s.id === sid);
    if (sheet) { setOpenSheetId(sid); return; }
    // No sheet in vault — prompt to create
    const newSheet = { ...emptySheet(), id: sid,
      name: gameChar.name, race: gameChar.race, classLevel: gameChar.classLevel,
      hpCurrent: gameChar.hpCurrent, hpMax: gameChar.hpMax, ac: gameChar.ac,
      speed: gameChar.speed, initiative: gameChar.initiative,
      passivePerception: gameChar.passivePerception,
      spellSlots: gameChar.spellSlots, spellSlotsUsed: gameChar.spellSlotsUsed,
      conditions: gameChar.conditions, deathSaves: gameChar.deathSaves,
    };
    upsertSheet(newSheet);
    setOpenSheetId(sid);
  };

  // When sheet modal saves, sync stats back to game panel
  const onSheetSave = (sheet) => {
    upsertSheet(sheet);
    setParty(prev => prev.map(c =>
      (c.sheetId === sheet.id || c.id === sheet.id) ? { ...sheetToGameChar(sheet), id: c.id, sheetId: sheet.id } : c
    ));
    setOpenSheetId(null);
  };
  // ── End Session ───────────────────────────────────────────────────────────
  const avgLevel = () => {
    const levels = party.map(c => {
      const m = c.classLevel && c.classLevel.match(/\d+/);
      return m ? parseInt(m[0]) : 1;
    });
    return levels.length ? Math.round(levels.reduce((a,b) => a+b, 0) / levels.length) : 1;
  };

  const endSession = async () => {
    setEndingSession(true);
    const lvl = avgLevel();
    // XP multiplier scales with level
    const xpMultiplier = Math.max(1, Math.round(lvl * 0.5));
    const recentLog = sessionLog.slice(-20).map(e => e.text).join("\n");
    const prompt = `SESSION ENDED. Average party level: ${lvl}. Total XP this session: ${xp}. XP multiplier: x${xpMultiplier}.

Recent session events:
${recentLog || "No events logged."}

Write a brief session summary (3-5 sentences max) that:
1. Recaps the key events of this session in an exciting way
2. States the total XP awarded: ${xp} XP (x${xpMultiplier} level multiplier = ${xp * xpMultiplier} adjusted XP)
3. Gives out 3-4 fun awards from categories like: "Best Kill", "Most Violent Kill", "Coolest Action", "Best Use of a Skill", "Best Roleplay Moment", "Most Creative Solution", "Biggest Blunder", "Luckiest Roll", "MVP of the Session", "Most Dramatic Death Save" — pick the ones that fit the session best, award them to specific players by name if possible
4. End with a tantalizing hint at what might come next

Keep it punchy, celebratory, and fun. This is a victory lap.`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: buildSystemPrompt(worldState, party, location, [], null, dmPersonality, sessionLog),
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await res.json();
      const summary = data.content?.map(b => b.text || "").join("") || "The session comes to a close.";
      setSessionSummary({ text: summary, xp, adjustedXp: xp * xpMultiplier, multiplier: xpMultiplier });
      setShowEndSession(true);
      // Add session end to log
      setSessionLog(prev => [...prev, { text: `[SESSION END] XP awarded: ${xp * xpMultiplier}`, time: Date.now() }]);
      setXp(0); // reset session XP
    } catch(e) {
      setSessionSummary({ text: "The session ends. Well played, adventurers.", xp, adjustedXp: xp, multiplier: 1 });
      setShowEndSession(true);
    }
    setEndingSession(false);
  };

  // ── Session Resume Recap ──────────────────────────────────────────────────
  const generateRecap = async () => {
    if (!sessionLog.length) return;
    setShowRecap(true);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // START SCREEN
  // ─────────────────────────────────────────────────────────────────────────────
  if (showStartScreen) {
    return (
      <div style={{display:"flex", flexDirection:"column", justifyContent:"center", alignItems:"center", minHeight:"100vh", background:"var(--t-header)", fontFamily:"var(--font-body)"}}>

        {/* Title block */}
        <div style={{textAlign:"center", display:"flex", flexDirection:"column", alignItems:"center", gap:"12px", padding:"0 24px 32px"}}>
          <div style={{fontSize:"13px", letterSpacing:"6px", color:"var(--t-gold)", fontFamily:"var(--font-smallcap)", opacity:0.7}}>WELCOME TO</div>
          <div style={{fontSize:"clamp(32px,6vw,56px)", fontWeight:"bold", color:"var(--t-gold)", fontFamily:"var(--font-display)", letterSpacing:"4px", textTransform:"uppercase", lineHeight:1.1, textShadow:"0 2px 24px rgba(0,0,0,0.6)"}}>
            AI Dungeon Master
          </div>
          <div style={{fontSize:"14px", color:"var(--t-gold)", fontFamily:"var(--font-body)", fontStyle:"italic", opacity:0.65, marginTop:"2px"}}>
            A 5th Edition AI-Powered Adventure
          </div>
          <div style={{width:"140px", height:"1px", background:"var(--t-gold)", opacity:0.25, margin:"6px 0"}} />
          <div style={{fontSize:"11px", letterSpacing:"2px", color:"var(--t-gold)", fontFamily:"var(--font-ui)", opacity:0.45}}>
            Created by MrFictional &nbsp;·&nbsp; Beta
          </div>
        </div>

        {/* Action buttons */}
        <div style={{display:"flex", flexDirection:"column", alignItems:"center", gap:"12px", width:"100%", maxWidth:"340px", padding:"0 24px"}}>
          <button style={{...styles.setupBtn, width:"100%", fontSize:"16px", padding:"16px", letterSpacing:"3px"}}
            onClick={() => { setShowStartScreen(false); setShowSlotModal(true); }}>
            ⚔ Campaigns
          </button>
          <button style={{...styles.setupBtn, width:"100%", background:"transparent", border:"1px solid var(--t-gold)", opacity:0.8}}
            onClick={() => { setShowStartScreen(false); setShowVaultViewer(true); }}>
            📋 Character Vault
          </button>
          <button style={{...styles.setupBtn, width:"100%", background:"transparent", border:"1px solid var(--t-gold)", opacity:0.8}}
            onClick={() => { setShowStartScreen(false); setShowInstructions(true); }}>
            📖 How To Play
          </button>
        </div>

        {/* Footer */}
        <div style={{textAlign:"center", marginTop:"32px", display:"flex", flexDirection:"column", alignItems:"center", gap:"10px"}}>
          <a href="https://buymeacoffee.com/mrfictional" target="_blank" rel="noreferrer"
            style={{display:"inline-flex", alignItems:"center", gap:"8px", padding:"10px 20px", background:"#FFDD00", borderRadius:"8px", textDecoration:"none", color:"#000000", fontFamily:"var(--font-ui)", fontWeight:"700", fontSize:"13px", boxShadow:"0 2px 8px rgba(0,0,0,0.3)", transition:"opacity 0.2s"}}>
            ☕ Buy Me a Coffee
          </a>
          <div style={{fontSize:"11px", color:"var(--t-gold)", fontFamily:"var(--font-body)", fontStyle:"italic", opacity:0.5, maxWidth:"280px", lineHeight:"1.5", textAlign:"center"}}>
            If you enjoy this and want to support further development, a coffee goes a long way!
          </div>
          <div style={{maxWidth:"320px", marginTop:"8px", padding:"10px 14px", border:"1px solid var(--t-gold)", borderRadius:"4px", opacity:0.45, textAlign:"center"}}>
            <div style={{fontSize:"10px", color:"var(--t-gold)", fontFamily:"var(--font-ui)", letterSpacing:"1px", lineHeight:"1.6"}}>
              ⚠ Game data is stored in your browser's local cache. Clearing your browser history or cache will erase all campaigns and characters. Data does not sync across devices or browsers.
            </div>
          </div>
          <div style={{fontSize:"10px", letterSpacing:"2px", color:"var(--t-gold)", fontFamily:"var(--font-ui)", opacity:0.25, marginTop:"4px"}}>
            © 2026 MrFictional. All rights reserved.
          </div>
        </div>

        {/* Vault viewer modal on start screen */}
        {showVaultViewer && <VaultViewerModal vault={vault} onClose={() => { setShowVaultViewer(false); setShowStartScreen(true); }} onOpenSheet={(id) => { setOpenSheetId(id); setShowVaultViewer(false); setShowStartScreen(false); }} onCreateCharacter={createCharacterInVault} onDeleteCharacter={deleteSheet} />}
        {showInstructions && (
          <div style={styles.modalOverlay} onClick={() => { setShowInstructions(false); setShowStartScreen(true); }}>
            <div style={{...styles.modalBox, maxWidth:"720px", maxHeight:"88vh", overflowY:"auto", padding:0}} onClick={e => e.stopPropagation()}>
              <div style={{background:"var(--t-accent)", padding:"16px 24px", borderBottom:"3px solid var(--t-border-strong)", display:"flex", justifyContent:"space-between", alignItems:"center", position:"sticky", top:0, zIndex:1}}>
                <span style={{fontSize:"18px", fontWeight:"bold", letterSpacing:"3px", color:"var(--t-gold)", fontFamily:"var(--font-display)"}}>📖 HOW TO PLAY</span>
                <button style={{padding:"6px 12px", background:"transparent", border:"1px solid var(--t-gold)", borderRadius:"3px", color:"var(--t-gold)", cursor:"pointer", fontSize:"13px"}} onClick={() => { setShowInstructions(false); setShowStartScreen(true); }}>✕ Close</button>
              </div>
              <div style={{padding:"24px", display:"flex", flexDirection:"column", gap:"24px", fontFamily:"var(--font-body)", color:"var(--t-text)", background:"var(--t-panel)"}}>
                <InstrSection icon="⚔" title="What Is This?"><p>Please launch the game via ⚔ Campaigns to read the full How To Play guide in-game.</p></InstrSection>
              </div>
            </div>
          </div>
        )}
        {showSlotModal && (
          <div style={styles.modalOverlay} onClick={() => { setShowSlotModal(false); setShowStartScreen(true); setConfirmResetSlot(null); }}>
            <div style={styles.modalBox} onClick={e => e.stopPropagation()}>
              <div style={styles.modalTitle}>⚔ CAMPAIGNS</div>
              <div style={styles.modalSub}>Select a campaign slot to begin your adventure</div>
              <div style={styles.slotGrid}>
                {Array.from({length: NUM_SLOTS}).map((_, i) => {
                  const meta = getSlotMeta(i);
                  const isActive = i === activeSlot;
                  const pendingReset = confirmResetSlot === i;
                  return (
                    <div key={i} style={{...styles.slotCard, ...(isActive ? styles.slotCardActive : {})}}>
                      <div style={styles.slotNum}>SLOT {i + 1}{isActive ? " — LAST PLAYED" : ""}</div>
                      {meta ? (
                        <>
                          <div style={styles.slotName}>{meta.partyName}</div>
                          <div style={styles.slotDetail}>{meta.worldTone}</div>
                          <div style={styles.slotMsgs}>{meta.msgCount} messages</div>
                          {pendingReset ? (
                            <div style={{marginTop:"6px", padding:"8px", background:"#3a0a0a", border:"1px solid #9a3a3a", borderRadius:"3px"}}>
                              <div style={{fontSize:"11px", color:"#f0a0a0", fontFamily:"var(--font-ui)", marginBottom:"8px", lineHeight:"1.4"}}>Permanently erase this campaign?</div>
                              <div style={{display:"flex", gap:"6px"}}>
                                <button style={{flex:1, padding:"5px", background:"#9a3a3a", border:"none", borderRadius:"3px", color:"#fff", cursor:"pointer", fontSize:"11px", fontFamily:"var(--font-ui)", fontWeight:"700"}}
                                  onClick={() => { setConfirmResetSlot(null); newCampaignInSlot(i); setShowStartScreen(false); }}>Yes, Reset</button>
                                <button style={{flex:1, padding:"5px", background:"transparent", border:"1px solid var(--t-border)", borderRadius:"3px", color:"var(--t-text-sec)", cursor:"pointer", fontSize:"11px", fontFamily:"var(--font-ui)"}}
                                  onClick={() => setConfirmResetSlot(null)}>Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <div style={styles.slotActions}>
                              <button style={styles.slotLoadBtn} onClick={() => { switchToSlot(i); setShowStartScreen(false); setShowSlotModal(false); }}>▶ Play</button>
                              <button style={styles.slotResetBtn} onClick={() => setConfirmResetSlot(i)}>🗑 Reset</button>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <div style={styles.slotEmpty}>Empty Slot</div>
                          <button style={styles.slotLoadBtn} onClick={() => { switchToSlot(i); setShowStartScreen(false); setShowSlotModal(false); }}>+ New Campaign</button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
              <button style={styles.modalCloseBtn} onClick={() => { setShowSlotModal(false); setShowStartScreen(true); setConfirmResetSlot(null); }}>← Back to Menu</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SETUP SCREEN
  // ─────────────────────────────────────────────────────────────────────────────
  if (!setupDone) {
    return (
      <div style={styles.setupOverlay}>
        <div style={styles.setupBox}>
          <div style={styles.setupTitle}>⚔ SESSION ZERO ⚔</div>
          <div style={styles.setupSub}>Forge your world before the adventure begins</div>
          <button style={{...styles.modalCloseBtn, marginBottom:"16px", fontSize:"12px", padding:"8px"}}
            onClick={() => { setShowStartScreen(true); setSetupStep(0); }}>
            ← Back to Main Menu
          </button>

          {setupStep === 0 && (
            <div style={styles.setupForm}>
              <label style={styles.label}>Party Name</label>
              <input style={styles.setupInput} placeholder="The Iron Vanguard..." value={setupData.partyName}
                onChange={e => setSetupData(p => ({...p, partyName: e.target.value}))} />
              <label style={styles.label}>World Tone</label>
              <input style={styles.setupInput} placeholder="Grim dark, high fantasy, sword & sorcery..." value={setupData.worldTone}
                onChange={e => setSetupData(p => ({...p, worldTone: e.target.value}))} />
              <label style={styles.label}>Starting Region</label>
              <input style={styles.setupInput} placeholder="The Ashwood Frontier, City of Emberveil..." value={setupData.startingRegion}
                onChange={e => setSetupData(p => ({...p, startingRegion: e.target.value}))} />
              <button style={styles.setupBtn} onClick={() => setSetupStep(1)}>Next: Configure Your DM →</button>
            </div>
          )}

          {setupStep === 1 && (
            <div style={styles.setupForm}>
              <div style={{...styles.sectionTitle, fontSize:"11px", marginBottom:"16px"}}>Adjust the sliders to define your Dungeon Master's personality</div>
              <PersonalitySliders personality={dmPersonality} onChange={setDmPersonality} />
              <div style={{display:"flex",gap:"10px",marginTop:"16px"}}>
                <button style={{...styles.setupBtn, background:"var(--t-text-muted)", flex:1}} onClick={() => setSetupStep(0)}>← Back</button>
                <button style={{...styles.setupBtn, flex:2}} onClick={() => setSetupStep(2)}>Next: Add Characters →</button>
              </div>
            </div>
          )}

          {setupStep === 2 && (
            <div style={styles.setupForm}>
              <div style={styles.charTabsSetup}>
                {setupParty.map((c, i) => (
                  <button key={c.id} style={{...styles.charTabBtn, ...(i === activeCharTab ? styles.charTabActive : {})}}
                    onClick={() => setActiveCharTab(i)}>{c.name || `Character ${i+1}`}</button>
                ))}
                <button style={styles.addCharBtn} onClick={() => { setSetupParty(p => [...p, emptyCharacter()]); setActiveCharTab(setupParty.length); }}>+ Add</button>
              </div>

              {setupParty[activeCharTab] && (() => {
                const c = setupParty[activeCharTab];
                const upd = (f, v) => updateSetupChar(c.id, f, v);
                const isFromVault = !!c.sheetId;
                return (
                  <div>
                    {/* Vault picker */}
                    {vault.length > 0 && (
                      <div style={{marginBottom:"12px"}}>
                        <label style={styles.label}>Load from Character Vault</label>
                        <div style={{display:"flex", gap:"6px", flexWrap:"wrap", marginTop:"8px"}}>
                          {vault.map(s => (
                            <button key={s.id}
                              style={{...styles.addCharBtn, ...(c.sheetId === s.id ? {background:"var(--t-accent)", color:"var(--t-gold)", border:"1px solid var(--t-border-strong)"} : {})}}
                              onClick={() => {
                                const gc = sheetToGameChar(s);
                                setSetupParty(prev => prev.map((ch,i) => i === activeCharTab ? {...gc, id: ch.id, sheetId: s.id} : ch));
                              }}>
                              {s.name || "Unnamed"} {s.classLevel ? "·" + s.classLevel : ""}
                            </button>
                          ))}
                          {isFromVault && <button style={{...styles.addCharBtn, color:"var(--t-accent-light)"}}
                            onClick={() => setSetupParty(prev => prev.map((ch,i) => i === activeCharTab ? emptyCharacter() : ch))}>
                            ✕ Clear
                          </button>}
                        </div>
                        <div style={{borderTop:"1px solid #c8a870", margin:"12px 0", opacity:0.5}} />
                      </div>
                    )}
                    <div style={styles.charGrid}>
                      <div style={styles.charField}><label style={styles.label}>Name</label><input style={styles.setupInput} value={c.name} onChange={e=>upd("name",e.target.value)} /></div>
                      <div style={styles.charField}><label style={styles.label}>Race</label><input style={styles.setupInput} value={c.race} onChange={e=>upd("race",e.target.value)} /></div>
                      <div style={styles.charField}><label style={styles.label}>Class & Level</label><input style={styles.setupInput} placeholder="Fighter 3" value={c.classLevel} onChange={e=>upd("classLevel",e.target.value)} /></div>
                      <div style={styles.charField}><label style={styles.label}>Max HP</label><input style={styles.setupInput} type="number" value={c.hpMax} onChange={e=>{upd("hpMax",e.target.value);upd("hpCurrent",e.target.value);}} /></div>
                      <div style={styles.charField}><label style={styles.label}>AC</label><input style={styles.setupInput} type="number" value={c.ac} onChange={e=>upd("ac",e.target.value)} /></div>
                      <div style={styles.charField}><label style={styles.label}>Speed</label><input style={styles.setupInput} placeholder="30 ft" value={c.speed} onChange={e=>upd("speed",e.target.value)} /></div>
                      <div style={styles.charField}><label style={styles.label}>Initiative Bonus</label><input style={styles.setupInput} placeholder="+2" value={c.initiative} onChange={e=>upd("initiative",e.target.value)} /></div>
                      <div style={styles.charField}><label style={styles.label}>Passive Perception</label><input style={styles.setupInput} type="number" value={c.passivePerception} onChange={e=>upd("passivePerception",e.target.value)} /></div>
                    </div>
                    {!isFromVault && c.name && (
                      <button style={{...styles.addCharBtn, marginTop:"10px", width:"100%", color:"var(--t-accent)", border:"1px dashed var(--t-border-strong)"}}
                        onClick={() => {
                          const sheet = {...emptySheet(), ...c, id: c.id};
                          upsertSheet(sheet);
                          upd("sheetId", c.id);
                        }}>
                        💾 Save to Character Vault
                      </button>
                    )}
                  </div>
                );
              })()}

              <div style={{display:"flex",gap:"10px",marginTop:"16px"}}>
                <button style={{...styles.setupBtn, background:"var(--t-text-muted)", flex:1}} onClick={() => setSetupStep(1)}>← Back</button>
                <button style={{...styles.setupBtn, flex:2}} onClick={completeSetup}>Begin Adventure ⚔</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MAIN GAME UI
  // ─────────────────────────────────────────────────────────────────────────────
  // activeChar = who is currently acting (drives DM, combat actions, message prefix)
  const activeCharIdx = Math.max(0, party.findIndex(c => c.name === activePlayer));
  const activeChar = party[activeCharIdx] || party[0];
  // viewedChar = what the sidebar is displaying (independent — user can browse freely)
  const viewedChar = party[viewCharIdx] || party[0];

  return (
    <div style={styles.root}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.logo}>⚔ DUNGEON MASTER</span>
          <span style={styles.worldName}>{worldState.partyName || "The Adventurers"}</span>
          <span style={styles.xpBadge}>✦ {xp.toLocaleString()} XP</span>
        </div>
        <div style={styles.headerRight}>
          {HAS_STT && (
            <span style={styles.micHint} title="Use Chrome/Edge for voice input">🎙 Voice input available</span>
          )}
          <span style={styles.slotBadge}>Slot {activeSlot + 1}</span>
          <button style={{...styles.iconBtn, background:"#2a1a3a", border:"1px solid #a060c0", color:"#c080e0"}}
            onClick={endSession} disabled={endingSession || loading}>
            {endingSession ? "⏳ Ending..." : "🌙 End Session"}
          </button>
          <button style={styles.iconBtn} onClick={() => setShowSettings(true)}>⚙ Settings</button>
          <button style={{...styles.iconBtn, background:"#0a1a2a", border:"1px solid #4a8ab0", color:"#8ab8d0"}} onClick={() => setShowInstructions(true)}>📖 How To Play</button>
          <button style={styles.iconBtn} onClick={() => setShowVaultViewer(true)}>📋 Vault</button>
          <button style={styles.iconBtn} onClick={() => setShowSlotModal(true)}>⚔ Campaigns</button>
          <button style={{...styles.iconBtn, opacity:0.7}} onClick={() => setShowStartScreen(true)}>⌂ Menu</button>
        </div>
      </div>

      <div style={styles.body}>
        {/* ── LEFT: NARRATIVE ── */}
        <div style={styles.narrativePanel}>
          {/* Location bar */}
          <div style={styles.locationBar}>
            <span style={styles.locIcon}>🗺</span>
            <span style={styles.locName}>{location.name}</span>
            <span style={styles.locDetail}>{location.environment}</span>
            <span style={styles.locWeather}>☁ {location.weather}</span>
            <span style={styles.locTime}>🕰 {location.timeOfDay}</span>
          </div>

          {/* Chat */}
          <div style={styles.chat} ref={chatRef}>
            {messages.length === 0 && !loading && (
              <div style={styles.emptyChat}>The DM awakens... your world awaits.</div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={m.role === "assistant" ? styles.dmMsg : styles.playerMsg}>
                {m.role === "assistant" && <span style={styles.dmLabel}>DM</span>}
                {m.role === "user" && <span style={styles.playerLabel}>{m.player || "YOU"}</span>}
                <div style={styles.msgText}>{m.content}</div>
              </div>
            ))}
            {loading && (
              <div style={styles.dmMsg}>
                <span style={styles.dmLabel}>DM</span>
                <div style={styles.typing}><span/><span/><span/></div>
              </div>
            )}
          </div>

          {/* Initiative order banner — shown during combat */}
          {initiativeOrder.length > 0 && (
            <div style={styles.initiativeBanner}>
              <span style={styles.initLabel}>⚔ INITIATIVE:</span>
              {initiativeOrder.map((e, i) => (
                <span key={i} style={{...styles.initEntry, ...(e.name === activePlayer ? styles.initEntryActive : {})}}>
                  {e.name} <span style={styles.initNum}>{e.initiative}</span>
                </span>
              ))}
            </div>
          )}

          {/* Distance tracker */}
          {distances.length > 0 && initiativeOrder.length > 0 && (
            <div style={styles.distanceBanner}>
              <span style={styles.distLabel}>📏 RANGE:</span>
              {distances.map((d, i) => (
                <span key={i} style={{...styles.distEntry, ...(d.distance <= 5 ? styles.distEntryClose : d.distance <= 30 ? styles.distEntryMed : styles.distEntryFar)}}>
                  {d.name} <span style={styles.distNum}>{d.distance}ft</span>
                </span>
              ))}
            </div>
          )}

          {/* Active player toggle — read-only during combat, manual outside */}
          {party.length > 1 && (
            <div style={styles.activePlayerBar}>
              <span style={styles.activePlayerLabel}>
                {initiativeOrder.length > 0 ? "⚔ TURN:" : "ACTING:"}
              </span>
              {initiativeOrder.length > 0 ? (
                // Combat mode — show all combatants in initiative order, highlight current
                <>
                  {party.map((c) => (
                    <div key={c.id}
                      style={{...styles.activePlayerBtn,
                        ...(c.name === activePlayer ? styles.activePlayerBtnOn : {}),
                        cursor: "default",
                        opacity: c.name === activePlayer ? 1 : 0.5 }}>
                      {c.name === activePlayer ? "▶ " : ""}{c.name || "Char"}
                    </div>
                  ))}
                  <span style={{fontSize:"10px", color:"var(--t-text-muted)", fontFamily:"var(--font-ui)", fontStyle:"italic", marginLeft:"4px"}}>
                    Initiative order — DM controls turn
                  </span>
                </>
              ) : (
                // Out of combat — manual toggle
                <>
                  {party.map((c, i) => (
                    <button key={c.id}
                      style={{...styles.activePlayerBtn, ...(c.name === activePlayer ? styles.activePlayerBtnOn : {})}}
                      onClick={() => { setActivePlayer(c.name); setActiveCharTab(i); }}>
                      {c.name || `Char ${i+1}`}
                    </button>
                  ))}
                  <div style={styles.activePlayerDivider} />
                  <button
                    style={{...styles.activePlayerBtn, ...styles.activePlayerBtnParty, ...(activePlayer === "__PARTY__" ? styles.activePlayerBtnOn : {})}}
                    onClick={() => setActivePlayer("__PARTY__")}
                    title="The whole party acts together">
                    ⚔ Whole Party
                  </button>
                </>
              )}
            </div>
          )}

          {/* Combat Action Panel or Suggestions */}
          {initiativeOrder.length > 0 && !loading ? (
            <CombatActions onAction={sendMessage} activeChar={activeChar} initiativeOrder={initiativeOrder} party={party} />
          ) : suggestions.length > 0 && !loading ? (
            <div style={styles.suggestionsRow}>
              {suggestions.map((s, i) => (
                <button key={i}
                  style={{...styles.suggestionBtn, ...(s === "More Details" ? styles.suggestionBtnDetails : {})}}
                  onClick={() => sendMessage(s)}>
                  {s}
                </button>
              ))}
            </div>
          ) : null}

          {/* Input */}
          <div style={styles.inputRow}>
            {initiativeOrder.length > 0 && activeChar && activePlayer !== "__PARTY__" && (
              <span style={{padding:"9px 8px 9px 0", fontSize:"12px", fontFamily:"var(--font-smallcap)", color:"var(--t-accent)", fontWeight:"bold", whiteSpace:"nowrap", letterSpacing:"1px", flexShrink:0}}>
                {activeChar.name}:
              </span>
            )}
            <input ref={inputRef} style={styles.textInput} value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }}}
              placeholder={initiativeOrder.length > 0 ? "Describe " + (activeChar ? activeChar.name + "'s" : "your") + " action..." : "What do you do?"} disabled={loading} />
            {HAS_STT && (
              <button style={{...styles.micBtn, ...(listening ? styles.micBtnActive : {})}}
                onMouseDown={startListening} onMouseUp={stopListening}
                onTouchStart={startListening} onTouchEnd={stopListening}
                title="Hold to speak">
                {listening ? "🔴" : "🎙"}
              </button>
            )}
            <button style={styles.sendBtn} onClick={() => sendMessage(input)} disabled={loading || !input.trim()}>Send</button>
          </div>
        </div>

        {/* ── RIGHT: STATS ── */}
        <div style={styles.statsPanel}>
          {/* Character tabs — viewing only, never affects active turn */}
          <div style={styles.charTabs}>
            {party.map((c, i) => (
              <button key={c.id}
                style={{
                  ...styles.charTabBtn,
                  ...(i === viewCharIdx ? styles.charTabActive : {}),
                  // Show a subtle indicator if this is the acting player (during combat)
                  ...(initiativeOrder.length > 0 && c.name === activePlayer && i !== viewCharIdx
                    ? { borderBottom:"2px solid var(--t-gold)", color:"var(--t-gold)" } : {})
                }}
                onClick={() => setViewCharIdx(i)}
                title={initiativeOrder.length > 0 && c.name === activePlayer ? "⚔ Currently acting" : ""}>
                {c.name || `Char ${i+1}`}
                {initiativeOrder.length > 0 && c.name === activePlayer && <span style={{marginLeft:"3px", fontSize:"9px"}}>⚔</span>}
              </button>
            ))}
          </div>

          {viewedChar && (
            <div style={styles.charSheet}>
              {/* Name / Class / Race */}
              <div style={styles.charHeader}>
                <div style={styles.charName}>{viewedChar.name}</div>
                <div style={styles.charSub}>{viewedChar.race} · {viewedChar.classLevel}</div>
                <button style={styles.openSheetBtn} onClick={() => openSheet(viewedChar)}>
                  📋 Open Character Sheet
                </button>
              </div>

              {/* HP */}
              <div style={styles.hpBlock}>
                <div style={styles.hpLabel}>HIT POINTS</div>
                <div style={styles.hpRow}>
                  <input style={styles.hpInput} type="number" value={viewedChar.hpCurrent}
                    onChange={e => updateCharAndSync(viewedChar.id, "hpCurrent", e.target.value)} />
                  <span style={styles.hpSlash}>/</span>
                  <input style={styles.hpInput} type="number" value={viewedChar.hpMax}
                    onChange={e => updateCharAndSync(viewedChar.id, "hpMax", e.target.value)} />
                </div>
                <div style={styles.hpBar}>
                  <div style={{...styles.hpFill, width: `${Math.min(100, Math.max(0, (viewedChar.hpCurrent / viewedChar.hpMax) * 100))}%`,
                    background: viewedChar.hpCurrent / viewedChar.hpMax > 0.5 ? "#2d7a2d" : viewedChar.hpCurrent / viewedChar.hpMax > 0.25 ? "#8a6a00" : "#8a1a1a"}} />
                </div>
              </div>

              {/* Core stats grid */}
              <div style={styles.coreStats}>
                {[
                  ["AC", viewedChar.ac, "ac"],
                  ["Speed", viewedChar.speed, "speed"],
                  ["Init", viewedChar.initiative, "initiative"],
                  ["Pass. Perc.", viewedChar.passivePerception, "passivePerception"],
                ].map(([label, val, field]) => (
                  <div key={field} style={styles.statBox}>
                    <div style={styles.statLabel}>{label}</div>
                    <input style={styles.statInput} value={val}
                      onChange={e => updateCharAndSync(viewedChar.id, field, e.target.value)} />
                  </div>
                ))}
              </div>

              {/* Action Economy — shown during combat */}
              {initiativeOrder.length > 0 && (
                <div style={styles.aeBlock}>
                  <div style={styles.hpLabel}>ACTION ECONOMY</div>
                  <div style={styles.aeRow}>
                    <div style={{...styles.aePip, ...(actionEconomy.action ? styles.aePipUsed : styles.aePipFree)}}>
                      <span style={styles.aePipIcon}>⚔</span><span style={styles.aePipLabel}>Action</span>
                    </div>
                    <div style={{...styles.aePip, ...(actionEconomy.bonusAction ? styles.aePipUsed : styles.aePipFree)}}>
                      <span style={styles.aePipIcon}>✦</span><span style={styles.aePipLabel}>Bonus</span>
                    </div>
                    <div style={{...styles.aePip, ...(actionEconomy.movement ? styles.aePipUsed : styles.aePipFree)}}>
                      <span style={styles.aePipIcon}>🏃</span><span style={styles.aePipLabel}>
                        {actionEconomy.movementMax > 0 ? (actionEconomy.movementMax - actionEconomy.movementUsed) + "/" + actionEconomy.movementMax + "ft" : "Move"}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Inspiration */}
              <div style={styles.inspirationRow}>
                <button style={{...styles.inspirationBtn, ...(viewedChar.inspiration ? styles.inspirationActive : {})}}
                  onClick={() => updateCharAndSync(viewedChar.id, "inspiration", !viewedChar.inspiration)}>
                  ✦ Inspiration {viewedChar.inspiration ? "ON" : "OFF"}
                </button>
              </div>

              {/* Death Saves */}
              <div style={styles.section}>
                <div style={styles.sectionTitle}>DEATH SAVES</div>
                <div style={styles.deathSaveRow}>
                  <span style={styles.dsLabel}>✓ Successes</span>
                  {[0,1,2].map(i => (
                    <button key={i} style={{...styles.dsPip, ...(i < viewedChar.deathSaves.successes ? styles.dsPipSuccess : {})}}
                      onClick={() => updateCharAndSync(viewedChar.id, "deathSaves", {...viewedChar.deathSaves, successes: i < viewedChar.deathSaves.successes ? i : i+1})} />
                  ))}
                </div>
                <div style={styles.deathSaveRow}>
                  <span style={styles.dsLabel}>✗ Failures</span>
                  {[0,1,2].map(i => (
                    <button key={i} style={{...styles.dsPip, ...(i < viewedChar.deathSaves.failures ? styles.dsPipFail : {})}}
                      onClick={() => updateCharAndSync(viewedChar.id, "deathSaves", {...viewedChar.deathSaves, failures: i < viewedChar.deathSaves.failures ? i : i+1})} />
                  ))}
                </div>
              </div>

              {/* Spell Slots */}
              <div style={styles.section}>
                <div style={styles.sectionTitle}>SPELL SLOTS</div>
                {SPELL_SLOT_LEVELS.filter(l => viewedChar.spellSlots[l] > 0).map(level => (
                  <div key={level} style={styles.slotRow}>
                    <span style={styles.slotLabel}>Lvl {level}</span>
                    <div style={styles.slotPips}>
                      {Array.from({length: viewedChar.spellSlots[level]}).map((_, i) => (
                        <button key={i} style={{...styles.slotPip, ...(i < (viewedChar.spellSlots[level] - viewedChar.spellSlotsUsed[level]) ? styles.slotPipFull : styles.slotPipEmpty)}}
                          onClick={() => {
                            const used = viewedChar.spellSlotsUsed[level];
                            const total = viewedChar.spellSlots[level];
                            const newUsed = i < total - used ? used + 1 : used - 1;
                            updateCharAndSync(viewedChar.id, "spellSlotsUsed", {...viewedChar.spellSlotsUsed, [level]: Math.max(0, Math.min(total, newUsed))});
                          }} />
                      ))}
                    </div>
                    <input style={styles.slotCountInput} type="number" min="0" max="9" value={viewedChar.spellSlots[level]}
                      onChange={e => updateCharAndSync(viewedChar.id, "spellSlots", {...viewedChar.spellSlots, [level]: parseInt(e.target.value)||0})} />
                  </div>
                ))}
                <button style={styles.addSlotBtn} onClick={() => {
                  const nextEmpty = SPELL_SLOT_LEVELS.find(l => !viewedChar.spellSlots[l]);
                  if (nextEmpty) updateCharAndSync(viewedChar.id, "spellSlots", {...viewedChar.spellSlots, [nextEmpty]: 1});
                }}>+ Add Slot Level</button>
              </div>

              {/* Conditions */}
              <div style={styles.section}>
                <div style={styles.sectionTitle}>CONDITIONS</div>
                <div style={styles.condGrid}>
                  {CONDITIONS.map(cond => (
                    <button key={cond} style={{...styles.condBtn, ...(viewedChar.conditions.includes(cond) ? styles.condBtnActive : {})}}
                      onClick={() => toggleCondition(viewedChar.id, cond)}>{cond}</button>
                  ))}
                </div>
              </div>

              {/* Dice Roller */}
              <DiceRoller />

              {/* Notes */}
              <div style={styles.section}>
                <div style={styles.sectionTitle}>📜 NOTES</div>
                <textarea
                  style={styles.notesArea}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Jot down items, clues, NPC names, quest details..."
                  spellCheck={false}
                />
              </div>

              {/* Session Recap */}
              <div style={styles.section}>
                <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"6px"}}>
                  <div style={styles.sectionTitle}>📖 SESSION LOG</div>
                  <button style={styles.recapBtn} onClick={() => setShowRecap(true)}>View Recap</button>
                </div>
                <div style={{fontSize:"11px", color:"var(--t-text-muted)", fontFamily:"var(--font-ui)"}}>
                  {sessionLog.length} events · {xp.toLocaleString()} XP this session
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── CHARACTER SHEET MODAL ── */}
      {openSheetId && vault.find(s => s.id === openSheetId) && (
        <CharacterSheetModal
          key={openSheetId}
          initialSheet={vault.find(s => s.id === openSheetId)}
          onSave={onSheetSave}
          onClose={() => setOpenSheetId(null)}
        />
      )}

      {/* ── VAULT VIEWER ── */}
      {showVaultViewer && (
        <VaultViewerModal
          vault={vault}
          onClose={() => setShowVaultViewer(false)}
          onOpenSheet={(id) => { setOpenSheetId(id); setShowVaultViewer(false); }}
          onCreateCharacter={createCharacterInVault}
          onDeleteCharacter={deleteSheet}
        />
      )}

      {/* ── END SESSION MODAL ── */}
      {showEndSession && sessionSummary && (
        <div style={styles.modalOverlay}>
          <div style={{...styles.modalBox, maxWidth:"600px", padding:0, overflow:"hidden"}} onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div style={{background:"#2a0a3a", padding:"16px 24px", borderBottom:"3px solid #a060c0", display:"flex", alignItems:"center", gap:"12px"}}>
              <span style={{fontSize:"22px"}}>🌙</span>
              <div>
                <div style={{fontSize:"16px", fontWeight:"bold", letterSpacing:"3px", color:"#e0b0f0", fontFamily:"var(--font-display)"}}>SESSION END</div>
                <div style={{fontSize:"11px", color:"#a080c0", fontFamily:"var(--font-ui)", marginTop:"2px"}}>{worldState.partyName || "The Adventurers"} · Slot {activeSlot + 1}</div>
              </div>
            </div>
            <div style={{background:"var(--t-accent)", padding:"12px 24px", display:"flex", justifyContent:"space-between", alignItems:"center", borderBottom:"1px solid var(--t-border-strong)"}}>
              <div>
                <div style={{fontSize:"9px", letterSpacing:"3px", color:"var(--t-gold)", fontFamily:"var(--font-smallcap)", marginBottom:"2px", opacity:0.8}}>TOTAL XP AWARDED</div>
                <div style={{fontSize:"28px", fontWeight:"bold", color:"var(--t-gold)", fontFamily:"var(--font-display)", lineHeight:1}}>{(sessionSummary.adjustedXp || sessionSummary.xp).toLocaleString()} XP</div>
              </div>
              {sessionSummary.multiplier > 1 && (
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:"12px", color:"var(--t-gold)", fontFamily:"var(--font-ui)", opacity:0.8}}>{sessionSummary.xp.toLocaleString()} base</div>
                  <div style={{fontSize:"12px", color:"var(--t-gold)", fontFamily:"var(--font-ui)", opacity:0.8}}>× {sessionSummary.multiplier} level multiplier</div>
                </div>
              )}
            </div>
            <div style={{padding:"20px 24px", maxHeight:"340px", overflowY:"auto", background:"var(--t-panel)"}}>
              <div style={{fontSize:"9px", letterSpacing:"3px", color:"var(--t-accent-light)", fontFamily:"var(--font-smallcap)", marginBottom:"10px", fontWeight:"bold"}}>SESSION SUMMARY</div>
              <div style={{fontFamily:"var(--font-body)", fontSize:"14px", lineHeight:"1.8", color:"var(--t-text)", whiteSpace:"pre-wrap"}}>
                {sessionSummary.text}
              </div>
            </div>
            <div style={{padding:"16px 24px", background:"var(--t-stripe)", borderTop:"2px solid var(--t-border-strong)", display:"flex", gap:"10px"}}>
              <button
                style={{flex:1, padding:"12px", background:"var(--t-card)", border:"2px solid var(--t-border-strong)", borderRadius:"3px", color:"var(--t-accent)", cursor:"pointer", fontSize:"13px", fontFamily:"var(--font-ui)", fontWeight:"700", letterSpacing:"1px"}}
                onClick={() => setShowEndSession(false)}>
                ▶ Continue Campaign
              </button>
              <button
                style={{flex:1, padding:"12px", background:"var(--t-accent)", border:"2px solid var(--t-border-strong)", borderRadius:"3px", color:"var(--t-gold)", cursor:"pointer", fontSize:"13px", fontFamily:"var(--font-ui)", fontWeight:"700", letterSpacing:"1px"}}
                onClick={() => { setShowEndSession(false); setShowSlotModal(true); }}>
                ⚔ Campaign Menu
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── RECAP MODAL ── */}
      {showRecap && (
        <div style={styles.modalOverlay} onClick={() => setShowRecap(false)}>
          <div style={{...styles.modalBox, maxWidth:"560px", maxHeight:"80vh", overflowY:"auto"}} onClick={e => e.stopPropagation()}>
            <div style={styles.modalTitle}>📖 SESSION RECAP</div>
            <div style={styles.modalSub}>{sessionLog.length} recorded events · {xp.toLocaleString()} XP this session</div>
            {sessionLog.length === 0 ? (
              <div style={{color:"var(--t-text-muted)", fontStyle:"italic", textAlign:"center", padding:"20px", fontFamily:"var(--font-body)"}}>No events recorded yet. The adventure is just beginning...</div>
            ) : (
              <div style={{display:"flex", flexDirection:"column", gap:"6px"}}>
                {[...sessionLog].reverse().map((e, i) => (
                  <div key={i} style={{display:"flex", gap:"10px", padding:"8px 10px", background:"var(--t-card)", border:"1px solid var(--t-border)", borderRadius:"3px"}}>
                    <span style={{color:"var(--t-accent)", fontSize:"12px", flexShrink:0, fontFamily:"var(--font-ui)"}}>
                      {e.text && e.text.startsWith("[SESSION END]") ? "🌙" : "•"}
                    </span>
                    <span style={{fontSize:"13px", color:"var(--t-text)", fontFamily:"var(--font-body)", lineHeight:"1.5"}}>{e.text}</span>
                  </div>
                ))}
              </div>
            )}
            <button style={{...styles.modalCloseBtn, marginTop:"16px"}} onClick={() => setShowRecap(false)}>Close</button>
          </div>
        </div>
      )}

      {/* ── INSTRUCTIONS MODAL ── */}
      {showInstructions && (
        <div style={styles.modalOverlay} onClick={() => setShowInstructions(false)}>
          <div style={{...styles.modalBox, maxWidth:"720px", maxHeight:"88vh", overflowY:"auto", padding:0}} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{background:"var(--t-accent)", padding:"16px 24px", borderBottom:"3px solid var(--t-border-strong)", display:"flex", justifyContent:"space-between", alignItems:"center", position:"sticky", top:0, zIndex:1}}>
              <span style={{fontSize:"18px", fontWeight:"bold", letterSpacing:"3px", color:"var(--t-gold)", fontFamily:"var(--font-display)"}}>📖 HOW TO PLAY</span>
              <button style={{padding:"6px 12px", background:"transparent", border:"1px solid var(--t-gold)", borderRadius:"3px", color:"var(--t-gold)", cursor:"pointer", fontSize:"13px"}} onClick={() => setShowInstructions(false)}>✕ Close</button>
            </div>
            <div style={{padding:"24px", display:"flex", flexDirection:"column", gap:"24px", fontFamily:"var(--font-body)", color:"var(--t-text)", background:"var(--t-panel)"}}>

              {/* What is this */}
              <InstrSection icon="⚔" title="What Is This?">
                <p>This is an <strong>AI-powered Dungeon Master</strong> for Dungeons &amp; Dragons 5th Edition (2024 rules). Claude — the AI — acts as your DM, narrating the world, running NPCs and enemies, managing combat, and telling the story. You and your fellow players are the adventurers.</p>
                <p>Think of it exactly like a live session with a human DM — except the DM never sleeps, never forgets, and is available whenever you are. You make decisions, roll your own dice, track your own character, and the DM responds to everything you do.</p>
                <p>The world is persistent. Every NPC you meet, every place you explore, every choice you make is remembered across sessions.</p>
              </InstrSection>

              {/* The Philosophy */}
              <InstrSection icon="🎲" title="The Core Philosophy — You Run Your Character">
                <p><strong>This is a simulator for live, in-person D&D play.</strong> The goal is to recreate the experience of sitting around a table with a Dungeon Master as closely as possible — the AI just never gets tired, never cancels, and is always available.</p>
                <p>The same rules apply here as at a real table:</p>
                <ul>
                  <li><strong>You track your own stats.</strong> HP, spell slots, conditions, inventory, hit dice — all yours to manage. When the DM says you take 7 damage, you subtract 7 from your HP. When you cast a spell, you mark the slot. The DM never does this for you — just like a real session.</li>
                  <li><strong>You roll your own dice.</strong> When the DM asks for a roll, use physical dice, the built-in roller in the sidebar, or any dice app. Report your total including all modifiers.</li>
                  <li><strong>The DM rolls for enemies and the world.</strong> Enemy attacks, NPC saving throws, random events — the AI handles all of that and narrates the result.</li>
                  <li><strong>The character sheet is optional.</strong> It's a convenience tool — like the dice roller — not a requirement. Use it if you want a digital record. Ignore it if you prefer paper or D&D Beyond. Either works perfectly.</li>
                  <li><strong>Decisions are yours.</strong> The DM presents the world and its consequences. What your character does is entirely up to you.</li>
                </ul>
              </InstrSection>

              {/* Session Zero */}
              <InstrSection icon="🌍" title="Starting a Campaign — Session Zero">
                <p>Every new campaign begins with <strong>Session Zero</strong>, a three-step setup:</p>
                <ol>
                  <li><strong>World Setup:</strong> Name your party, choose a world tone (grim dark, high fantasy, sword &amp; sorcery, etc.), and pick a starting region. These shape the entire campaign.</li>
                  <li><strong>DM Personality:</strong> Use the sliders to define how your DM behaves — serious vs. comedic, harsh vs. warm, story-focused vs. combat-heavy, strict rules vs. Rule of Cool, and more. You can adjust this anytime via ⚙ Settings.</li>
                  <li><strong>Characters:</strong> Add up to any number of characters. Enter their key stats (HP, AC, Speed, Initiative, Passive Perception). You can load characters from the <strong>Character Vault</strong> if you've played before, or create them fresh.</li>
                </ol>
                <p>Once you hit <strong>Begin Adventure</strong>, the DM sets the scene and the adventure begins immediately.</p>
              </InstrSection>

              {/* Talking to the DM */}
              <InstrSection icon="💬" title="Talking to the DM">
                <p>The main chat window is your table. Everything you type goes directly to the DM as an in-character action or statement. You don't need special commands — just speak naturally:</p>
                <ul>
                  <li><em>"I look around the tavern for anyone suspicious."</em></li>
                  <li><em>"I try to persuade the guard to let us through."</em></li>
                  <li><em>"Can we rest here for the night?"</em></li>
                  <li><em>"I rolled a 17 on my Stealth check."</em> (when the DM asked you to roll)</li>
                </ul>
                <p>After each DM response, <strong>suggestion buttons</strong> appear — quick action choices relevant to your current situation. Click one to send it instantly, or type your own. The DM always ends with a clear prompt for what to do next.</p>
                <p>On <strong>Chrome or Edge</strong>, you can also use the 🎙 microphone button to speak your actions aloud.</p>
              </InstrSection>

              {/* Play Styles */}
              <InstrSection icon="🎭" title="Play Styles & DM Personality">
                <p>The DM Personality sliders (found in ⚙ Settings or set during Session Zero) control the entire feel of your campaign:</p>
                <ul>
                  <li><strong>Seriousness / Humor</strong> — from dead serious epic drama to light-hearted fun</li>
                  <li><strong>Warmth</strong> — from brutal and unforgiving to encouraging and celebratory</li>
                  <li><strong>Sarcasm</strong> — how much dry wit appears in narration and NPC dialogue</li>
                  <li><strong>Combat / Story Focus</strong> — lean into battles or roleplaying and narrative</li>
                  <li><strong>Darkness</strong> — heroic adventure vs. gritty, dangerous world where death is real</li>
                  <li><strong>Verbosity</strong> — terse and punchy vs. rich atmospheric descriptions</li>
                  <li><strong>Rule Strictness</strong> — strict Rules-as-Written vs. Rule of Cool</li>
                  <li><strong>Lethality</strong> — forgiving (near-death escapes) vs. deadly (mistakes have consequences)</li>
                  <li><strong>Mystery</strong> — transparent world vs. cryptic hints and hidden truths</li>
                  <li><strong>Humor</strong> — straight-faced narration vs. comedic NPCs and witty asides</li>
                </ul>
                <p>Changes take effect on the very next DM response. Experiment freely — different campaigns can have completely different DMs.</p>
              </InstrSection>

              {/* Combat */}
              <InstrSection icon="⚔" title="Combat — How It Works">
                <p>When combat starts, the DM will ask each player to <strong>roll initiative</strong> (d20 + your DEX modifier — report the total). The DM rolls for all enemies. Initiative order appears in the banner at the top of the chat.</p>
                <p><strong>On your turn:</strong></p>
                <ul>
                  <li>You have <strong>1 Action, 1 Bonus Action, and Movement</strong> up to your Speed.</li>
                  <li>Use the <strong>Combat Action Panel</strong> (appears during combat) to select your action — Melee Attack, Ranged Attack, Cast a Spell, Dash, Dodge, Disengage, Help, and more.</li>
                  <li>Select your <strong>target</strong> from the dropdown — it shows all active combatants and updates if someone dies or joins.</li>
                  <li>When you attack, the DM asks you to <strong>roll to hit</strong> (d20 + attack modifier). Report your total. The DM compares it to the target's AC and tells you if you hit or miss.</li>
                  <li>If you hit, you roll damage and report it.</li>
                  <li>Natural 20 = <strong>Critical Hit</strong> — double your damage dice. Natural 1 = automatic miss.</li>
                </ul>
                <p><strong>Enemy turns</strong> are handled entirely by the DM — it rolls the dice, narrates the attack, compares to your AC, and tells you how much damage you take. <strong>Update your own HP accordingly.</strong></p>
                <p>The <strong>Range Tracker</strong> below the initiative bar shows each combatant's distance from the party. The DM enforces range rules — you can't melee attack an enemy 30ft away without moving first.</p>
                <p>The <strong>Action Economy tracker</strong> in the sidebar shows what you've used this turn.</p>
                <p>At <strong>0 HP</strong>, you're unconscious and rolling death saving throws each turn (d20: 10+ = success, 1-9 = failure). Three successes = stable. Three failures = dead.</p>
              </InstrSection>

              {/* Active Player / Party */}
              <InstrSection icon="👥" title="Active Player & Party Actions">
                <p>The <strong>ACTING</strong> bar above the input shows who is currently taking action. Click a character's name to switch to them — the DM will address that character specifically.</p>
                <p>Click <strong>⚔ Whole Party</strong> when the whole group acts together — exploring a room, deciding on a plan, resting. The DM will address everyone collectively and may call for group checks.</p>
                <p>In combat, the initiative order determines who acts — the DM will prompt the correct player automatically. Use the ACTING bar to manually override if needed.</p>
              </InstrSection>

              {/* Character Sheet */}
              <InstrSection icon="📋" title="The Character Sheet — A Tool, Not a Tracker">
                <p><strong>This app is a simulator for live, in-person D&D play.</strong> That means you — the player — are responsible for tracking your own character. The AI DM does not update your stats. It never has and never will. This is intentional.</p>
                <p>When an enemy hits you and the DM says "that's 7 piercing damage" — you update your HP. When you cast a spell — you mark off the slot. When you spend hit dice during a rest — you update them. Exactly like sitting at a real table with a real DM.</p>
                <p>The <strong>character sheet included in this app is a convenience tool</strong> — think of it the same way as the dice roller. It's there if you want it. You are not required to use it. Many players prefer a physical sheet, a printed PDF, or D&D Beyond alongside this app. All of those work perfectly.</p>
                <p>The sheet covers:</p>
                <ul>
                  <li><strong>Ability Scores</strong> — enter your scores, modifiers calculate automatically</li>
                  <li><strong>Saving Throws &amp; Skills</strong> — check proficiency boxes, totals update live</li>
                  <li><strong>Combat Stats</strong> — AC, Initiative, Speed, HP (current/max/temp), Hit Dice, Death Saves</li>
                  <li><strong>Attacks</strong> — name, attack bonus, damage, damage type</li>
                  <li><strong>Spells</strong> — full spell list by level with Prepared checkbox, Cast Time, Range, Duration, Concentration, V/S/M components, and materials. Slot tracking with +/− buttons.</li>
                  <li><strong>Inventory, Gold, Notes</strong></li>
                </ul>
                <p><strong>Sync:</strong> Key stats (HP, AC, Speed, conditions, spell slots) sync between the full sheet and the sidebar panel. Edit either — they stay in sync when you save.</p>
                <p>Characters saved to the <strong>Character Vault</strong> are shared across all campaigns and can be loaded into any new adventure.</p>
                <p style={{fontStyle:"italic", color:"var(--t-text-sec)"}}>Bottom line: track your own character. The DM runs the world. You run your adventurer. That's the game.</p>
              </InstrSection>

              {/* XP System */}
              <InstrSection icon="✦" title="XP & Progression">
                <p>The DM awards XP automatically throughout play — you don't need to track it manually. XP appears live in the header.</p>
                <p>XP is awarded for:</p>
                <ul>
                  <li><strong>Combat</strong> — defeating enemies, scaled by Challenge Rating</li>
                  <li><strong>Encounters</strong> — resolving situations creatively or diplomatically</li>
                  <li><strong>Objectives</strong> — completing quests, finding secrets, achieving goals</li>
                  <li><strong>Roleplay</strong> — strong character moments, clever skill use, memorable decisions</li>
                </ul>
                <p>When you click <strong>🌙 End Session</strong>, the DM generates a session summary including:</p>
                <ul>
                  <li>A narrative recap of the session's key events</li>
                  <li>Total XP awarded, adjusted by a <strong>level multiplier</strong> based on your party's average level</li>
                  <li>Fun awards — Best Kill, MVP of the Session, Most Creative Solution, Biggest Blunder, and more</li>
                </ul>
                <p>XP resets to 0 after each session end. Use it to level up your characters manually on your character sheet.</p>
              </InstrSection>

              {/* Session Continuity */}
              <InstrSection icon="📖" title="Sessions, Saves & Continuity">
                <p>The game auto-saves everything as you play — no manual saving needed. When you return to a campaign, the DM posts a short <strong>"Previously on your adventure..."</strong> recap so everyone remembers where things left off.</p>
                <p>The <strong>Session Log</strong> in the sidebar records significant events as they happen — combats won, major decisions, discoveries, deaths. Click <strong>View Recap</strong> to see the full list at any time.</p>
                <p>You can save up to <strong>6 campaigns</strong> simultaneously using the ⚔ Campaigns button. Each slot is completely independent — different world, different party, different DM personality.</p>
                <p>The <strong>Character Vault</strong> is separate from campaign slots — characters there persist forever and can be shared between any campaign.</p>
              </InstrSection>

              {/* Data Storage */}
              <InstrSection icon="💾" title="Where Is My Data Stored?">
                <p><strong>All of your game data is stored locally in your browser's cache</strong> (called localStorage). This includes your campaigns, characters, session logs, notes, XP, and settings. No data is sent to any server — everything stays on your device.</p>
                <p><strong>What this means for you:</strong></p>
                <ul>
                  <li><strong>Same browser, same device</strong> — your data will be there every time you return, as long as you use the same browser on the same machine.</li>
                  <li><strong>Different browser or device</strong> — your data will not carry over. A campaign played in Chrome won't appear in Firefox, and won't appear on your phone or another computer.</li>
                  <li><strong>Clearing browser cache or history</strong> — this will permanently erase all saved game data, characters, and campaigns. Be careful when clearing browsing data — look for options to preserve "Site data" or "localStorage" if your browser offers them.</li>
                  <li><strong>Private / Incognito mode</strong> — data is not saved at all. When you close the window, everything is gone.</li>
                </ul>
                <p><strong>To back up your data</strong> — currently there is no built-in export feature. If you want to preserve a campaign, avoid clearing your browser cache and stick to one browser on one machine.</p>
                <p style={{fontStyle:"italic", color:"var(--t-text-sec)"}}>A future version may add cloud saves so your campaigns follow you across devices. For now, treat your browser cache as your save file — protect it accordingly.</p>
              </InstrSection>

              {/* Tips */}
              <InstrSection icon="💡" title="Tips for the Best Experience">
                <ul>
                  <li><strong>Be specific</strong> — the more detail you give the DM, the better the response. "I attack" is fine; "I leap onto the table and bring my axe down on the goblin's skull" is better.</li>
                  <li><strong>Report your rolls honestly</strong> — the DM trusts your dice. The game is only fun if you play it straight.</li>
                  <li><strong>Use "More Details"</strong> — the suggestion button always includes this. Use it whenever you want the DM to elaborate on a location, NPC, or situation.</li>
                  <li><strong>Ask the DM anything</strong> — rules questions, lore questions, "what do I remember about this creature?" — the DM knows D&amp;D 5e and will answer in character.</li>
                  <li><strong>Adjust the DM mid-campaign</strong> — if the tone isn't clicking, open ⚙ Settings and move the sliders. The next response will feel different.</li>
                  <li><strong>End sessions properly</strong> — clicking 🌙 End Session generates the recap and XP summary. It's worth doing even for short sessions.</li>
                  <li><strong>Chrome or Edge</strong> is recommended for the best experience, especially if you want microphone input.</li>
                </ul>
              </InstrSection>

            </div>
          </div>
        </div>
      )}

      {/* ── SETTINGS MODAL ── */}
      {showSettings && (
        <div style={styles.modalOverlay} onClick={() => setShowSettings(false)}>
          <div style={{...styles.modalBox, maxWidth:"580px", maxHeight:"85vh", overflowY:"auto"}} onClick={e => e.stopPropagation()}>
            <div style={styles.modalTitle}>⚙ SETTINGS</div>

            {/* Color Theme */}
            <div style={{marginBottom:"20px", paddingBottom:"20px", borderBottom:"1px solid var(--t-border)"}}>
              <div style={{fontSize:"10px", letterSpacing:"3px", color:"var(--t-accent-light)", fontFamily:"var(--font-smallcap)", fontWeight:"bold", marginBottom:"12px"}}>COLOR THEME</div>
              <div style={{display:"flex", gap:"10px"}}>
                {Object.entries(THEMES).map(([key, theme]) => (
                  <label key={key} style={{display:"flex", alignItems:"center", gap:"8px", cursor:"pointer", flex:1, padding:"10px", background: colorTheme === key ? "var(--t-accent)" : "var(--t-card)", border:"2px solid " + (colorTheme === key ? "var(--t-border-strong)" : "var(--t-border)"), borderRadius:"4px", transition:"all 0.15s"}}>
                    <input type="radio" name="colorTheme" value={key} checked={colorTheme === key}
                      onChange={() => setColorTheme(key)}
                      style={{accentColor:"var(--t-gold)", width:"16px", height:"16px"}} />
                    <div>
                      <div style={{fontSize:"12px", fontWeight:"bold", color: colorTheme === key ? "var(--t-gold)" : "var(--t-text)", fontFamily:"var(--font-ui)"}}>{theme.name}</div>
                      <div style={{width:"40px", height:"8px", borderRadius:"2px", marginTop:"3px", background:`linear-gradient(to right, ${theme.headerBg}, ${theme.accent}, ${theme.gold})`}} />
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* DM Personality */}
            <div style={{fontSize:"10px", letterSpacing:"3px", color:"var(--t-accent-light)", fontFamily:"var(--font-smallcap)", fontWeight:"bold", marginBottom:"12px"}}>DM PERSONALITY</div>
            <div style={{fontSize:"11px", color:"var(--t-text-sec)", fontFamily:"var(--font-body)", marginBottom:"14px", fontStyle:"italic"}}>Adjust your Dungeon Master's personality — takes effect on the next message</div>
            <PersonalitySliders personality={dmPersonality} onChange={setDmPersonality} />
            <button style={{...styles.modalCloseBtn, marginTop:"16px"}} onClick={() => setShowSettings(false)}>Save & Close</button>
          </div>
        </div>
      )}

      {/* ── CAMPAIGNS MODAL ── */}
      {showSlotModal && (
        <div style={styles.modalOverlay} onClick={() => { setShowSlotModal(false); setConfirmResetSlot(null); }}>
          <div style={styles.modalBox} onClick={e => e.stopPropagation()}>
            <div style={styles.modalTitle}>⚔ CAMPAIGNS</div>
            <div style={styles.modalSub}>Select a slot to load, or reset a slot to start fresh</div>
            <div style={styles.slotGrid}>
              {Array.from({length: NUM_SLOTS}).map((_, i) => {
                const meta = getSlotMeta(i);
                const isActive = i === activeSlot;
                const pendingReset = confirmResetSlot === i;
                return (
                  <div key={i} style={{...styles.slotCard, ...(isActive ? styles.slotCardActive : {})}}>
                    <div style={styles.slotNum}>SLOT {i + 1}{isActive ? " — ACTIVE" : ""}</div>
                    {meta ? (
                      <>
                        <div style={styles.slotName}>{meta.partyName}</div>
                        <div style={styles.slotDetail}>{meta.worldTone}</div>
                        <div style={styles.slotMsgs}>{meta.msgCount} messages</div>

                        {pendingReset ? (
                          // Inline confirmation
                          <div style={{marginTop:"6px", padding:"8px", background:"#3a0a0a", border:"1px solid #9a3a3a", borderRadius:"3px"}}>
                            <div style={{fontSize:"11px", color:"#f0a0a0", fontFamily:"var(--font-ui)", marginBottom:"8px", lineHeight:"1.4"}}>
                              Permanently erase this campaign?
                            </div>
                            <div style={{display:"flex", gap:"6px"}}>
                              <button style={{flex:1, padding:"5px", background:"#9a3a3a", border:"none", borderRadius:"3px", color:"#fff", cursor:"pointer", fontSize:"11px", fontFamily:"var(--font-ui)", fontWeight:"700"}}
                                onClick={() => { setConfirmResetSlot(null); newCampaignInSlot(i); }}>
                                Yes, Reset
                              </button>
                              <button style={{flex:1, padding:"5px", background:"transparent", border:"1px solid var(--t-border)", borderRadius:"3px", color:"var(--t-text-sec)", cursor:"pointer", fontSize:"11px", fontFamily:"var(--font-ui)"}}
                                onClick={() => setConfirmResetSlot(null)}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div style={styles.slotActions}>
                            {!isActive && (
                              <button style={styles.slotLoadBtn} onClick={() => switchToSlot(i)}>Load</button>
                            )}
                            <button style={styles.slotResetBtn} onClick={() => setConfirmResetSlot(i)}>
                              🗑 Reset
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div style={styles.slotEmpty}>Empty</div>
                        <button style={styles.slotLoadBtn} onClick={() => newCampaignInSlot(i)}>Start Campaign</button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <button style={styles.modalCloseBtn} onClick={() => { setShowSlotModal(false); setConfirmResetSlot(null); }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CHARACTER SHEET MODAL ────────────────────────────────────────────────────
function CharacterSheetModal({ initialSheet, onSave, onClose }) {
  const [s, setS] = useState(() => ({...initialSheet}));
  const upd = useCallback((field, val) => setS(prev => ({...prev, [field]: val})), []);
  const updNested = useCallback((obj, key, val) => setS(prev => ({...prev, [obj]: {...prev[obj], [key]: val}})), []);

  const mod = (ability) => fmtMod(abilityMod(s[ability]));
  const skillMod = (skill) => {
    const base = abilityMod(s[SKILL_MAP[skill]]);
    return fmtMod(base + (s.skills[skill] ? Number(s.profBonus) : 0));
  };
  const savesMod = (ability) => {
    const base = abilityMod(s[ability]);
    return fmtMod(base + (s.savingThrows[ability] ? Number(s.profBonus) : 0));
  };

  // Helper rendered as inline JSX, not as a component (avoids remount-on-render)
  const field = (label, fieldName, type="text", placeholder="") => (
    <div style={csS.field}>
      <input style={csS.input} type={type} value={s[fieldName]||""} placeholder={placeholder}
        onChange={e => upd(fieldName, e.target.value)} />
      <div style={csS.fieldLabel}>{label}</div>
    </div>
  );

  return (
    <div style={csS.overlay} onClick={onClose}>
      <div style={csS.modal} onClick={e => e.stopPropagation()}>
        {/* Header bar */}
        <div style={csS.headerBar}>
          <span style={csS.headerTitle}>CHARACTER SHEET</span>
          <div style={{display:"flex",gap:"8px"}}>
            <button style={csS.saveBtn} onClick={() => onSave(s)}>💾 Save & Close</button>
            <button style={csS.closeBtn} onClick={onClose}>✕</button>
          </div>
        </div>

        <div style={csS.body}>
          {/* ── TOP: Name/Class/etc ── */}
          <div style={csS.topRow}>
            <div style={{...csS.field, flex:2}}>
              <input style={{...csS.input, fontSize:"18px", fontFamily:"var(--font-display)", fontWeight:"bold"}}
                value={s.name} placeholder="Character Name" onChange={e => upd("name",e.target.value)} />
              <div style={csS.fieldLabel}>CHARACTER NAME</div>
            </div>
            {[["classLevel","Class & Level"],["background","Background"],["race","Race"],["alignment","Alignment"],["xp","Experience Points"]].map(([f,l]) => (
              <React.Fragment key={f}>{field(l, f)}</React.Fragment>
            ))}
          </div>

          <div style={csS.columns}>
            {/* ── LEFT COLUMN ── */}
            <div style={csS.leftCol}>
              {/* Ability Scores */}
              <div style={csS.abilityBox}>
                {ABILITY_KEYS.map(a => (
                  <div key={a} style={csS.ability}>
                    <div style={csS.abilityName}>{a.toUpperCase()}</div>
                    <div style={csS.abilityMod}>{mod(a)}</div>
                    <input style={csS.abilityScore} type="number" value={s[a]}
                      onChange={e => upd(a, e.target.value)} />
                  </div>
                ))}
              </div>

              {/* Inspiration + Prof Bonus */}
              <div style={csS.twoCol}>
                <div style={csS.smallBox}>
                  <div style={csS.smallBoxVal}>
                    <input type="checkbox" checked={s.inspiration} onChange={e => upd("inspiration",e.target.checked)} style={{width:"20px",height:"20px",accentColor:"var(--t-accent)"}} />
                  </div>
                  <div style={csS.smallBoxLabel}>Inspiration</div>
                </div>
                <div style={csS.smallBox}>
                  <input style={csS.smallBoxInput} type="number" value={s.profBonus}
                    onChange={e => upd("profBonus", e.target.value)} />
                  <div style={csS.smallBoxLabel}>Proficiency Bonus</div>
                </div>
              </div>

              {/* Saving Throws */}
              <div style={csS.listBox}>
                <div style={csS.listBoxTitle}>SAVING THROWS</div>
                {ABILITY_KEYS.map(a => (
                  <div key={a} style={csS.listRow}>
                    <input type="checkbox" checked={s.savingThrows[a]} style={{accentColor:"var(--t-accent)"}}
                      onChange={e => updNested("savingThrows",a,e.target.checked)} />
                    <span style={csS.listMod}>{savesMod(a)}</span>
                    <span style={csS.listName}>{a.charAt(0).toUpperCase()+a.slice(1)}</span>
                  </div>
                ))}
              </div>

              {/* Skills */}
              <div style={csS.listBox}>
                <div style={csS.listBoxTitle}>SKILLS</div>
                {Object.keys(SKILL_MAP).map(skill => (
                  <div key={skill} style={csS.listRow}>
                    <input type="checkbox" checked={s.skills[skill]} style={{accentColor:"var(--t-accent)"}}
                      onChange={e => updNested("skills",skill,e.target.checked)} />
                    <span style={csS.listMod}>{skillMod(skill)}</span>
                    <span style={csS.listName}>{skill.replace(/([A-Z])/g," $1").replace(/^./,c=>c.toUpperCase())} <span style={{color:"#8a6040",fontSize:"10px"}}>({SKILL_MAP[skill].toUpperCase()})</span></span>
                  </div>
                ))}
              </div>

              {/* Passive Perception */}
              <div style={csS.smallBox}>
                <input style={csS.smallBoxInput} type="number" value={s.passivePerception}
                  placeholder={String(10+abilityMod(s.wis)+(s.skills.perception?Number(s.profBonus):0))}
                  onChange={e => upd("passivePerception",e.target.value)} />
                <div style={csS.smallBoxLabel}>Passive Perception (Wisdom)</div>
              </div>

              {/* Other Proficiencies */}
              <div style={csS.textBox}>
                <textarea style={csS.textarea} value={s.otherProficiencies}
                  placeholder="Languages, armor, weapons, tools..."
                  onChange={e => upd("otherProficiencies",e.target.value)} rows={4} />
                <div style={csS.fieldLabel}>OTHER PROFICIENCIES & LANGUAGES</div>
              </div>
            </div>

            {/* ── MIDDLE COLUMN ── */}
            <div style={csS.midCol}>
              {/* Combat row */}
              <div style={csS.combatRow}>
                {[["ac","AC"],["initiative","Initiative"],["speed","Speed"]].map(([f,l]) => (
                  <div key={f} style={csS.combatStat}>
                    <input style={csS.combatInput} type="text" value={s[f]||""}
                      onChange={e => upd(f,e.target.value)} />
                    <div style={csS.combatLabel}>{l}</div>
                  </div>
                ))}
              </div>

              {/* HP */}
              <div style={csS.hpSection}>
                <div style={csS.hpRow}>
                  <div style={csS.hpField}>
                    <input style={csS.hpInput} type="number" value={s.hpMax||""} onChange={e=>upd("hpMax",e.target.value)} />
                    <div style={csS.fieldLabel}>HP MAXIMUM</div>
                  </div>
                </div>
                <div style={csS.hpRow}>
                  <div style={csS.hpField}>
                    <input style={csS.hpInputLarge} type="number" value={s.hpCurrent||""} onChange={e=>upd("hpCurrent",e.target.value)} />
                    <div style={csS.fieldLabel}>CURRENT HIT POINTS</div>
                  </div>
                </div>
                <div style={csS.hpRow}>
                  <div style={csS.hpField}>
                    <input style={csS.hpInput} type="number" value={s.hpTemp||""} onChange={e=>upd("hpTemp",e.target.value)} />
                    <div style={csS.fieldLabel}>TEMPORARY HIT POINTS</div>
                  </div>
                </div>
              </div>

              {/* Hit Dice + Death Saves */}
              <div style={csS.twoCol}>
                <div style={csS.listBox}>
                  <div style={csS.listBoxTitle}>HIT DICE</div>
                  <input style={csS.inlineInput} value={s.hitDice||""} placeholder="e.g. 4d10"
                    onChange={e=>upd("hitDice",e.target.value)} />
                  <div style={{fontSize:"10px",color:"#8a6040",marginTop:"2px"}}>Used:</div>
                  <input style={csS.inlineInput} value={s.hitDiceUsed||""} placeholder="0"
                    onChange={e=>upd("hitDiceUsed",e.target.value)} />
                </div>
                <div style={csS.listBox}>
                  <div style={csS.listBoxTitle}>DEATH SAVES</div>
                  <div style={{fontSize:"10px",color:"var(--t-text-sec)",marginBottom:"4px"}}>Successes</div>
                  <div style={{display:"flex",gap:"4px",marginBottom:"6px"}}>
                    {[0,1,2].map(i=><div key={i} style={{...csS.dsPip,...(i<s.deathSaves.successes?csS.dsPipS:{})}}
                      onClick={()=>updNested("deathSaves","successes",i<s.deathSaves.successes?i:i+1)} />)}
                  </div>
                  <div style={{fontSize:"10px",color:"var(--t-text-sec)",marginBottom:"4px"}}>Failures</div>
                  <div style={{display:"flex",gap:"4px"}}>
                    {[0,1,2].map(i=><div key={i} style={{...csS.dsPip,...(i<s.deathSaves.failures?csS.dsPipF:{})}}
                      onClick={()=>updNested("deathSaves","failures",i<s.deathSaves.failures?i:i+1)} />)}
                  </div>
                </div>
              </div>

              {/* Attacks */}
              <div style={csS.listBox}>
                <div style={csS.listBoxTitle}>ATTACKS & SPELLCASTING</div>
                <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:"4px",marginBottom:"4px"}}>
                  {["Name","Atk Bonus","Damage/Type",""].map(h=><div key={h} style={{fontSize:"9px",color:"var(--t-accent-light)",letterSpacing:"1px"}}>{h}</div>)}
                </div>
                {s.attacks.map((atk,i) => (
                  <div key={i} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:"4px",marginBottom:"4px"}}>
                    <input style={csS.inlineInput} value={atk.name} placeholder="Attack name"
                      onChange={e=>setS(p=>({...p,attacks:p.attacks.map((a,j)=>j===i?{...a,name:e.target.value}:a)}))} />
                    <input style={csS.inlineInput} value={atk.atkBonus} placeholder="+0"
                      onChange={e=>setS(p=>({...p,attacks:p.attacks.map((a,j)=>j===i?{...a,atkBonus:e.target.value}:a)}))} />
                    <input style={csS.inlineInput} value={atk.damage} placeholder="1d6+2"
                      onChange={e=>setS(p=>({...p,attacks:p.attacks.map((a,j)=>j===i?{...a,damage:e.target.value}:a)}))} />
                    <input style={csS.inlineInput} value={atk.type} placeholder="slsh"
                      onChange={e=>setS(p=>({...p,attacks:p.attacks.map((a,j)=>j===i?{...a,type:e.target.value}:a)}))} />
                  </div>
                ))}
                <button style={csS.addRowBtn} onClick={()=>setS(p=>({...p,attacks:[...p.attacks,{name:"",atkBonus:"",damage:"",type:""}]}))}>+ Add Attack</button>
              </div>

              {/* Equipment */}
              <div style={csS.textBox}>
                <div style={csS.currencyRow}>
                  {[["cp","CP"],["sp","SP"],["ep","EP"],["gp","GP"],["pp","PP"]].map(([f,l])=>(
                    <div key={f} style={{textAlign:"center"}}>
                      <input style={{...csS.inlineInput,textAlign:"center",width:"36px"}} value={s[f]||""} onChange={e=>upd(f,e.target.value)} />
                      <div style={{fontSize:"9px",color:"var(--t-accent-light)",letterSpacing:"1px"}}>{l}</div>
                    </div>
                  ))}
                </div>
                <textarea style={csS.textarea} value={s.equipment} placeholder="Equipment list..."
                  onChange={e=>upd("equipment",e.target.value)} rows={5} />
                <div style={csS.fieldLabel}>EQUIPMENT</div>
              </div>
            </div>

            {/* ── RIGHT COLUMN ── */}
            <div style={csS.rightCol}>
              {/* Personality */}
              {[["personalityTraits","PERSONALITY TRAITS",3],["ideals","IDEALS",3],["bonds","BONDS",3],["flaws","FLAWS",3]].map(([f,l,r])=>(
                <div key={f} style={csS.textBox}>
                  <textarea style={csS.textarea} value={s[f]||""} placeholder={l.charAt(0)+l.slice(1).toLowerCase()+"..."} rows={r}
                    onChange={e=>upd(f,e.target.value)} />
                  <div style={csS.fieldLabel}>{l}</div>
                </div>
              ))}

              {/* Features & Traits */}
              <div style={csS.textBox}>
                <textarea style={csS.textarea} value={s.featuresTraits||""} placeholder="Class features, racial traits, feats..."
                  onChange={e=>upd("featuresTraits",e.target.value)} rows={8} />
                <div style={csS.fieldLabel}>FEATURES & TRAITS</div>
              </div>

              {/* Inventory */}
              <div style={csS.textBox}>
                <div style={{display:"flex", gap:"8px", alignItems:"flex-end", marginBottom:"6px"}}>
                  <div style={{flex:1}}>
                    <textarea style={{...csS.textarea, minHeight:"80px"}} value={s.inventory||""}
                      placeholder="Rope, torches, rations, backpack..."
                      onChange={e=>upd("inventory",e.target.value)} rows={4} />
                    <div style={csS.fieldLabel}>INVENTORY</div>
                  </div>
                  <div style={{width:"72px", flexShrink:0}}>
                    <div style={{display:"flex", alignItems:"center", gap:"4px", background:"var(--t-stripe)", border:"1px solid var(--t-border)", borderRadius:"3px", padding:"4px 6px"}}>
                      <span style={{fontSize:"13px"}}>🪙</span>
                      <input style={{background:"transparent", border:"none", color:"var(--t-text)", fontSize:"13px", width:"100%", fontFamily:"var(--font-body)", outline:"none", fontWeight:"bold"}}
                        value={s.gold||""} placeholder="0" onChange={e=>upd("gold",e.target.value)} />
                    </div>
                    <div style={csS.fieldLabel}>GOLD (GP)</div>
                  </div>
                </div>
              </div>

              {/* Sheet Notes */}
              <div style={csS.textBox}>
                <textarea style={{...csS.textarea, minHeight:"70px"}} value={s.sheetNotes||""}
                  placeholder="Reminders, quest hooks, NPC contacts..."
                  onChange={e=>upd("sheetNotes",e.target.value)} rows={4} />
                <div style={csS.fieldLabel}>NOTES</div>
              </div>
            </div>
          </div>

          {/* ── SPELLS ── */}
          <div style={csS.spellSection}>
            <div style={csS.listBoxTitle}>SPELLCASTING</div>

            {/* Spellcasting header stats */}
            <div style={{display:"flex",gap:"10px",marginBottom:"14px",flexWrap:"wrap"}}>
              {[["spellcastingClass","Spellcasting Class"],["spellcastingAbility","Ability"],["spellSaveDC","Spell Save DC"],["spellAtkBonus","Spell Atk Bonus"]].map(([f,l])=>(
                <div key={f} style={csS.field}>
                  <input style={csS.input} value={s[f]||""} placeholder={l} onChange={e=>upd(f,e.target.value)} />
                  <div style={csS.fieldLabel}>{l.toUpperCase()}</div>
                </div>
              ))}
            </div>

            {/* Spell levels */}
            {[0,1,2,3,4,5,6,7,8,9].map(lvl => {
              const spellList = Array.isArray(s.spells[lvl]) ? s.spells[lvl] : [];
              const updSpell = (idx, field, val) => setS(p => {
                const arr = [...(Array.isArray(p.spells[lvl]) ? p.spells[lvl] : [])];
                arr[idx] = {...arr[idx], [field]: val};
                return {...p, spells: {...p.spells, [lvl]: arr}};
              });
              const updSpellNested = (idx, obj, field, val) => setS(p => {
                const arr = [...(Array.isArray(p.spells[lvl]) ? p.spells[lvl] : [])];
                arr[idx] = {...arr[idx], [obj]: {...arr[idx][obj], [field]: val}};
                return {...p, spells: {...p.spells, [lvl]: arr}};
              });
              const addSpell = () => setS(p => ({...p, spells: {...p.spells, [lvl]: [...(Array.isArray(p.spells[lvl])?p.spells[lvl]:[]), emptySpell()]}}));
              const removeSpell = (idx) => setS(p => { const arr = [...(Array.isArray(p.spells[lvl])?p.spells[lvl]:[])]; arr.splice(idx,1); return {...p, spells: {...p.spells, [lvl]: arr}}; });

              return (
                <div key={lvl} style={{marginBottom:"12px"}}>
                  {/* Level header row */}
                  <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"6px",paddingBottom:"4px",borderBottom:"1px solid #c8a870"}}>
                    <div style={{fontSize:"11px",fontWeight:"bold",color:"var(--t-accent)",fontFamily:"var(--font-smallcap)",letterSpacing:"2px",minWidth:"80px"}}>
                      {lvl===0 ? "CANTRIPS" : "LEVEL " + lvl}
                    </div>
                    {lvl > 0 && (
                      <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                        <span style={{fontSize:"10px",color:"var(--t-text-muted)",fontFamily:"var(--font-ui)"}}>Slots:</span>
                        <button style={csS.stepBtn} onClick={()=>setS(p=>({...p,spellSlots:{...p.spellSlots,[lvl]:Math.max(0,(p.spellSlots[lvl]||0)-1)}}))}>−</button>
                        <span style={csS.stepVal}>{s.spellSlots[lvl]||0}</span>
                        <button style={csS.stepBtn} onClick={()=>setS(p=>({...p,spellSlots:{...p.spellSlots,[lvl]:(p.spellSlots[lvl]||0)+1}}))}>+</button>
                        <span style={{fontSize:"10px",color:"var(--t-text-muted)",fontFamily:"var(--font-ui)",marginLeft:"4px"}}>Used:</span>
                        <button style={csS.stepBtn} onClick={()=>setS(p=>({...p,spellSlotsUsed:{...p.spellSlotsUsed,[lvl]:Math.max(0,(p.spellSlotsUsed[lvl]||0)-1)}}))}>−</button>
                        <span style={csS.stepVal}>{s.spellSlotsUsed[lvl]||0}</span>
                        <button style={csS.stepBtn} onClick={()=>setS(p=>({...p,spellSlotsUsed:{...p.spellSlotsUsed,[lvl]:Math.min(p.spellSlots[lvl]||0,(p.spellSlotsUsed[lvl]||0)+1)}}))}>+</button>
                      </div>
                    )}
                    <button style={{...csS.addRowBtn,width:"auto",padding:"2px 10px",marginTop:0}} onClick={addSpell}>+ Add Spell</button>
                  </div>

                  {/* Column headers */}
                  {spellList.length > 0 && (
                    <div style={csS.spellRowHeader}>
                      {lvl > 0 && <div style={{width:"22px"}}>Prep</div>}
                      <div style={{flex:2}}>Name</div>
                      <div style={{flex:1}}>Cast Time</div>
                      <div style={{flex:1}}>Range</div>
                      <div style={{flex:1}}>Duration</div>
                      <div style={{width:"28px",textAlign:"center"}}>Con.</div>
                      <div style={{width:"60px",textAlign:"center"}}>V S M</div>
                      <div style={{flex:2}}>Materials / Notes</div>
                      <div style={{width:"20px"}}></div>
                    </div>
                  )}

                  {/* Spell rows */}
                  {spellList.map((spell, idx) => (
                    <div key={idx} style={csS.spellRow}>
                      {/* Prepared checkbox — leveled spells only */}
                      {lvl > 0 && (
                        <div style={{width:"22px",display:"flex",alignItems:"center",justifyContent:"center"}}>
                          <input type="checkbox" checked={spell.prepared||false} style={{accentColor:"var(--t-accent)",width:"14px",height:"14px"}}
                            onChange={e=>updSpell(idx,"prepared",e.target.checked)} title="Prepared" />
                        </div>
                      )}
                      <input style={{...csS.spellInput,flex:2}} value={spell.name||""} placeholder="Spell name"
                        onChange={e=>updSpell(idx,"name",e.target.value)} />
                      <input style={{...csS.spellInput,flex:1}} value={spell.castingTime||""} placeholder="1 action"
                        onChange={e=>updSpell(idx,"castingTime",e.target.value)} />
                      <input style={{...csS.spellInput,flex:1}} value={spell.range||""} placeholder="60 ft"
                        onChange={e=>updSpell(idx,"range",e.target.value)} />
                      <input style={{...csS.spellInput,flex:1}} value={spell.duration||""} placeholder="1 min"
                        onChange={e=>updSpell(idx,"duration",e.target.value)} />
                      {/* Concentration */}
                      <div style={{width:"28px",display:"flex",alignItems:"center",justifyContent:"center"}}>
                        <input type="checkbox" checked={spell.concentration||false} style={{accentColor:"var(--t-accent-light)",width:"14px",height:"14px"}}
                          onChange={e=>updSpell(idx,"concentration",e.target.checked)} title="Concentration" />
                      </div>
                      {/* V S M checkboxes */}
                      <div style={{width:"60px",display:"flex",gap:"4px",alignItems:"center",justifyContent:"center"}}>
                        {["v","s","m"].map(c => (
                          <label key={c} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:"1px",cursor:"pointer"}}>
                            <input type="checkbox" checked={(spell.components&&spell.components[c])||false}
                              style={{accentColor:"var(--t-accent)",width:"13px",height:"13px"}}
                              onChange={e=>updSpellNested(idx,"components",c,e.target.checked)} />
                            <span style={{fontSize:"8px",color:"var(--t-accent)",fontWeight:"bold",fontFamily:"var(--font-ui)"}}>{c.toUpperCase()}</span>
                          </label>
                        ))}
                      </div>
                      {/* Materials / short description */}
                      <input style={{...csS.spellInput,flex:2}} value={spell.materials||""} placeholder="Material components or brief notes"
                        onChange={e=>updSpell(idx,"materials",e.target.value)} />
                      <button style={csS.removeSpellBtn} onClick={()=>removeSpell(idx)} title="Remove">✕</button>
                    </div>
                  ))}

                  {spellList.length === 0 && (
                    <div style={{fontSize:"11px",color:"var(--t-text-muted)",fontStyle:"italic",fontFamily:"var(--font-body)",padding:"4px 0 2px 2px"}}>
                      No {lvl===0?"cantrips":"level "+lvl+" spells"} added yet.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// Character sheet internal styles (cs = character sheet)
const csS = {
  overlay: { position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:2000,display:"flex",alignItems:"flex-start",justifyContent:"center",overflowY:"auto",padding:"20px 0" },
  modal: { background:"var(--t-panel)",border:"3px solid var(--t-border-strong)",borderRadius:"4px",width:"100%",maxWidth:"1100px",margin:"0 16px",boxShadow:"0 8px 40px rgba(0,0,0,0.5)" },
  headerBar: { display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 18px",background:"var(--t-accent)",borderBottom:"3px solid var(--t-border-strong)" },
  headerTitle: { fontSize:"16px",fontWeight:"bold",letterSpacing:"3px",color:"var(--t-gold)",fontFamily:"var(--font-display)" },
  saveBtn: { padding:"6px 16px",background:"var(--t-gold)",border:"none",borderRadius:"3px",color:"var(--t-accent)",cursor:"pointer",fontSize:"13px",fontFamily:"var(--font-ui)",fontWeight:"700" },
  closeBtn: { padding:"6px 10px",background:"transparent",border:"1px solid var(--t-gold)",borderRadius:"3px",color:"var(--t-gold)",cursor:"pointer",fontSize:"14px" },
  body: { padding:"16px",overflowY:"auto",background:"var(--t-panel)" },
  topRow: { display:"flex",gap:"8px",flexWrap:"wrap",marginBottom:"12px",paddingBottom:"12px",borderBottom:"2px solid var(--t-border-strong)" },
  columns: { display:"grid",gridTemplateColumns:"200px 1fr 1fr",gap:"12px" },
  leftCol: { display:"flex",flexDirection:"column",gap:"8px" },
  midCol: { display:"flex",flexDirection:"column",gap:"8px" },
  rightCol: { display:"flex",flexDirection:"column",gap:"8px" },
  field: { display:"flex",flexDirection:"column-reverse",gap:"2px",flex:1,minWidth:"80px" },
  fieldLabel: { fontSize:"8px",letterSpacing:"2px",color:"var(--t-accent-light)",fontWeight:"bold",fontFamily:"var(--font-smallcap)",textAlign:"center" },
  input: { background:"var(--t-card)",border:"none",borderBottom:"1px solid var(--t-border)",color:"var(--t-text)",padding:"4px 6px",fontSize:"13px",fontFamily:"var(--font-body)",outline:"none",width:"100%" },
  abilityBox: { display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px" },
  ability: { background:"var(--t-card)",border:"2px solid var(--t-border-strong)",borderRadius:"4px",padding:"6px",textAlign:"center" },
  abilityName: { fontSize:"8px",letterSpacing:"2px",color:"var(--t-accent-light)",fontFamily:"var(--font-smallcap)",fontWeight:"bold" },
  abilityMod: { fontSize:"20px",fontWeight:"bold",color:"var(--t-accent)",fontFamily:"var(--font-display)",lineHeight:1 },
  abilityScore: { background:"transparent",border:"none",borderTop:"1px solid var(--t-border)",color:"var(--t-text)",fontSize:"14px",textAlign:"center",width:"100%",fontFamily:"var(--font-body)",marginTop:"4px",outline:"none" },
  twoCol: { display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px" },
  smallBox: { background:"var(--t-card)",border:"1px solid var(--t-border)",borderRadius:"3px",padding:"6px",textAlign:"center" },
  smallBoxVal: { fontSize:"16px",fontWeight:"bold",color:"var(--t-accent)" },
  smallBoxInput: { background:"transparent",border:"none",borderBottom:"1px solid var(--t-border)",color:"var(--t-text)",fontSize:"16px",textAlign:"center",width:"100%",fontFamily:"var(--font-body)",outline:"none" },
  smallBoxLabel: { fontSize:"8px",letterSpacing:"1px",color:"var(--t-accent-light)",fontFamily:"var(--font-smallcap)",marginTop:"4px" },
  listBox: { background:"var(--t-card)",border:"1px solid var(--t-border)",borderRadius:"3px",padding:"8px" },
  listBoxTitle: { fontSize:"9px",letterSpacing:"2px",color:"var(--t-accent-light)",fontWeight:"bold",fontFamily:"var(--font-smallcap)",marginBottom:"6px",textAlign:"center" },
  listRow: { display:"flex",alignItems:"center",gap:"4px",marginBottom:"3px" },
  listMod: { fontSize:"11px",fontWeight:"bold",color:"var(--t-accent)",width:"28px",textAlign:"right",fontFamily:"var(--font-ui)" },
  listName: { fontSize:"11px",color:"var(--t-text)",fontFamily:"var(--font-ui)" },
  textBox: { background:"var(--t-card)",border:"1px solid var(--t-border)",borderRadius:"3px",padding:"8px" },
  textarea: { width:"100%",background:"transparent",border:"none",color:"var(--t-text)",fontSize:"12px",fontFamily:"var(--font-body)",resize:"vertical",outline:"none",lineHeight:"1.5",boxSizing:"border-box" },
  combatRow: { display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"8px" },
  combatStat: { background:"var(--t-card)",border:"2px solid var(--t-border-strong)",borderRadius:"4px",padding:"8px",textAlign:"center" },
  combatInput: { background:"transparent",border:"none",color:"var(--t-text)",fontSize:"20px",fontWeight:"bold",textAlign:"center",width:"100%",fontFamily:"var(--font-display)",outline:"none" },
  combatLabel: { fontSize:"8px",letterSpacing:"2px",color:"var(--t-accent-light)",fontFamily:"var(--font-smallcap)",marginTop:"2px" },
  hpSection: { background:"var(--t-card)",border:"1px solid var(--t-border)",borderRadius:"3px",padding:"8px" },
  hpRow: { marginBottom:"6px" },
  hpField: { display:"flex",flexDirection:"column-reverse",gap:"2px" },
  hpInput: { background:"transparent",border:"none",borderBottom:"1px solid var(--t-border)",color:"var(--t-text)",fontSize:"16px",fontFamily:"var(--font-body)",outline:"none",width:"100%" },
  hpInputLarge: { background:"transparent",border:"none",borderBottom:"2px solid var(--t-border-strong)",color:"var(--t-accent)",fontSize:"24px",fontWeight:"bold",fontFamily:"var(--font-display)",outline:"none",width:"100%" },
  inlineInput: { background:"var(--t-stripe)",border:"1px solid var(--t-border)",borderRadius:"2px",color:"var(--t-text)",fontSize:"12px",fontFamily:"var(--font-ui)",padding:"2px 4px",outline:"none",width:"100%" },
  currencyRow: { display:"flex",gap:"6px",justifyContent:"center",marginBottom:"8px" },
  addRowBtn: { marginTop:"4px",padding:"3px 8px",background:"transparent",border:"1px dashed var(--t-border-strong)",borderRadius:"2px",color:"var(--t-accent)",cursor:"pointer",fontSize:"10px",fontFamily:"var(--font-ui)",width:"100%" },
  dsPip: { width:"18px",height:"18px",borderRadius:"50%",background:"var(--t-stripe)",border:"1px solid var(--t-border)",cursor:"pointer" },
  dsPipS: { background:"#2a5a2a",border:"1px solid #3a8a3a" },
  dsPipF: { background:"#7a1a1a",border:"1px solid #aa3a3a" },
  spellSection: { marginTop:"12px",paddingTop:"12px",borderTop:"2px solid var(--t-border-strong)" },
  spellRowHeader: { display:"flex",gap:"4px",alignItems:"center",padding:"2px 4px",marginBottom:"2px",fontSize:"8px",letterSpacing:"1px",color:"var(--t-accent-light)",fontFamily:"var(--font-smallcap)",fontWeight:"bold" },
  spellRow: { display:"flex",gap:"4px",alignItems:"center",padding:"3px 4px",background:"var(--t-card)",border:"1px solid var(--t-border)",borderRadius:"2px",marginBottom:"3px" },
  spellInput: { background:"transparent",border:"none",borderBottom:"1px solid var(--t-border)",color:"var(--t-text)",fontSize:"12px",fontFamily:"var(--font-body)",padding:"2px 3px",outline:"none",minWidth:0 },
  removeSpellBtn: { width:"18px",height:"18px",background:"transparent",border:"1px solid var(--t-border)",borderRadius:"2px",color:"var(--t-text-muted)",cursor:"pointer",fontSize:"11px",lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,padding:0 },
  stepBtn: { width:"18px",height:"18px",background:"var(--t-accent)",border:"none",borderRadius:"2px",color:"var(--t-gold)",cursor:"pointer",fontSize:"13px",lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"var(--font-ui)",padding:0,flexShrink:0 },
  stepVal: { fontSize:"13px",fontWeight:"bold",color:"var(--t-text)",minWidth:"18px",textAlign:"center",fontFamily:"var(--font-body)" },
};

// ─── VAULT VIEWER MODAL ───────────────────────────────────────────────────────
function VaultViewerModal({ vault, onClose, onOpenSheet, onCreateCharacter, onDeleteCharacter }) {
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={{...styles.modalBox, maxWidth:"560px", maxHeight:"82vh", overflowY:"auto"}} onClick={e => e.stopPropagation()}>
        <div style={styles.modalTitle}>📋 CHARACTER VAULT</div>
        <div style={styles.modalSub}>All saved characters — available across all campaigns</div>

        {/* Create button */}
        <button style={{...styles.setupBtn, width:"100%", marginBottom:"16px", fontSize:"13px", padding:"10px", letterSpacing:"2px"}}
          onClick={onCreateCharacter}>
          + Create New Character
        </button>

        {vault.length === 0 ? (
          <div style={{color:"var(--t-text-muted)", fontStyle:"italic", textAlign:"center", padding:"24px 0", fontFamily:"var(--font-body)"}}>
            No characters saved yet. Create one above or add characters during Session Zero.
          </div>
        ) : (
          <div style={{display:"flex", flexDirection:"column", gap:"8px", marginBottom:"16px"}}>
            {vault.map(c => (
              <div key={c.id} style={{display:"flex", alignItems:"center", gap:"10px", padding:"10px 14px", background:"var(--t-card)", border:"1px solid var(--t-border)", borderRadius:"4px"}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:"15px", fontWeight:"bold", color:"var(--t-text)", fontFamily:"var(--font-display)", letterSpacing:"1px"}}>{c.name || "Unnamed"}</div>
                  <div style={{fontSize:"12px", color:"var(--t-text-sec)", fontFamily:"var(--font-body)", fontStyle:"italic", marginTop:"2px"}}>
                    {[c.race, c.classLevel].filter(Boolean).join(" · ") || "No details"}
                  </div>
                  {(c.hpMax || c.ac) && (
                    <div style={{fontSize:"11px", color:"var(--t-text-muted)", fontFamily:"var(--font-ui)", marginTop:"3px"}}>
                      {c.hpMax ? "HP " + c.hpMax : ""}{c.hpMax && c.ac ? " · " : ""}{c.ac ? "AC " + c.ac : ""}
                    </div>
                  )}
                </div>

                {confirmDeleteId === c.id ? (
                  <div style={{display:"flex", flexDirection:"column", gap:"4px", alignItems:"flex-end"}}>
                    <div style={{fontSize:"11px", color:"#f0a0a0", fontFamily:"var(--font-ui)"}}>Delete permanently?</div>
                    <div style={{display:"flex", gap:"6px"}}>
                      <button style={{padding:"4px 10px", background:"#9a3a3a", border:"none", borderRadius:"3px", color:"#fff", cursor:"pointer", fontSize:"11px", fontFamily:"var(--font-ui)", fontWeight:"700"}}
                        onClick={() => { onDeleteCharacter(c.id); setConfirmDeleteId(null); }}>
                        Yes
                      </button>
                      <button style={{padding:"4px 10px", background:"transparent", border:"1px solid var(--t-border)", borderRadius:"3px", color:"var(--t-text-sec)", cursor:"pointer", fontSize:"11px", fontFamily:"var(--font-ui)"}}
                        onClick={() => setConfirmDeleteId(null)}>
                        No
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{display:"flex", gap:"6px"}}>
                    <button style={styles.slotLoadBtn} onClick={() => onOpenSheet(c.id)}>
                      Open Sheet
                    </button>
                    <button style={styles.slotResetBtn} onClick={() => setConfirmDeleteId(c.id)}>
                      🗑
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <button style={styles.modalCloseBtn} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

// ─── INSTRUCTIONS SECTION COMPONENT ─────────────────────────────────────────
function InstrSection({ icon, title, children }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{borderBottom:"1px solid var(--t-border)", paddingBottom:"16px"}}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{display:"flex", alignItems:"center", gap:"10px", width:"100%", background:"none", border:"none", cursor:"pointer", padding:"0 0 8px 0", textAlign:"left"}}>
        <span style={{fontSize:"18px"}}>{icon}</span>
        <span style={{fontSize:"14px", fontWeight:"bold", color:"var(--t-accent)", letterSpacing:"1px", fontFamily:"var(--font-display)", flex:1}}>{title}</span>
        <span style={{fontSize:"12px", color:"var(--t-text-muted)", fontFamily:"var(--font-ui)"}}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{fontSize:"13px", lineHeight:"1.8", color:"var(--t-text)", fontFamily:"var(--font-body)", display:"flex", flexDirection:"column", gap:"8px", paddingLeft:"28px"}}>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── PERSONALITY SLIDERS ──────────────────────────────────────────────────────
const SLIDERS = [
  { key:"seriousness",   left:"😄 Comedic",         right:"🎭 Dead Serious"          },
  { key:"warmth",        left:"😤 Harsh & Cold",     right:"🤗 Warm & Encouraging"    },
  { key:"sarcasm",       left:"😇 Sincere",           right:"😏 Sarcastic"             },
  { key:"combat",        left:"📖 Story-Focused",    right:"⚔ Combat-Focused"         },
  { key:"darkness",      left:"☀ Heroic & Light",   right:"🌑 Gritty & Dark"          },
  { key:"verbosity",     left:"💬 Terse",             right:"📜 Descriptive"           },
  { key:"ruleStrictness",left:"😎 Rule of Cool",     right:"📏 Strict Rules-as-Written"},
  { key:"lethality",     left:"🛡 Forgiving",        right:"💀 Deadly"                 },
  { key:"mystery",       left:"🔍 Transparent",      right:"🌫 Cryptic & Mysterious"  },
  { key:"xpGenerosity",  left:"💰 Stingy XP",        right:"🎁 Generous XP"           },
];

function PersonalitySliders({ personality, onChange }) {
  const update = (key, val) => onChange(prev => ({...prev, [key]: Number(val)}));
  return (
    <div style={{display:"flex", flexDirection:"column", gap:"14px"}}>
      {SLIDERS.map(s => (
        <div key={s.key}>
          <div style={{display:"flex", justifyContent:"space-between", marginBottom:"4px"}}>
            <span style={{fontSize:"11px", color:"var(--t-text-sec)", fontFamily:"var(--font-ui)"}}>{s.left}</span>
            <span style={{fontSize:"11px", color:"var(--t-text-sec)", fontFamily:"var(--font-ui)"}}>{s.right}</span>
          </div>
          <input type="range" min="0" max="100" value={personality[s.key]}
            onChange={e => update(s.key, e.target.value)}
            style={{width:"100%", accentColor:"var(--t-accent)", cursor:"pointer"}} />
        </div>
      ))}
    </div>
  );
}

// ─── COMBAT ACTIONS ───────────────────────────────────────────────────────────
const ACTIONS = [
  { label: "⚔ Melee Attack",    msg: "I make a melee attack.",           type: "action" },
  { label: "🏹 Ranged Attack",   msg: "I make a ranged attack.",          type: "action" },
  { label: "✨ Cast a Spell",    msg: "I cast a spell.",                  type: "action" },
  { label: "💨 Dash",           msg: "I use my action to Dash.",         type: "action" },
  { label: "🛡 Dodge",          msg: "I take the Dodge action.",         type: "action" },
  { label: "↩ Disengage",      msg: "I use Disengage.",                 type: "action" },
  { label: "🫱 Help",           msg: "I use the Help action.",           type: "action" },
  { label: "👁 Search",         msg: "I use the Search action.",         type: "action" },
  { label: "⏱ Ready",          msg: "I Ready an action.",               type: "action" },
  { label: "🗡 Off-hand Attack", msg: "I make an off-hand bonus attack.", type: "bonus"  },
  { label: "🏃 Move",           msg: "I move.",                          type: "move"   },
  { label: "🤸 Grapple",        msg: "I attempt to grapple.",            type: "action" },
  { label: "💪 Shove",          msg: "I attempt to shove.",              type: "action" },
  { label: "🎲 Improvise",      msg: "I improvise an action.",           type: "action" },
  { label: "⏭ End Turn",        msg: "I end my turn.",                   type: "end"    },
];

// TYPE_COLORS uses CSS vars so they work across all themes
const getTypeColors = () => ({
  action: { bg:"var(--t-card)", border:"var(--t-border-strong)", color:"var(--t-accent)", activeBg:"var(--t-stripe)", activeBorder:"var(--t-accent)" },
  bonus:  { bg:"var(--t-card)", border:"#4a5a9a", color:"#2a3a7a", activeBg:"var(--t-stripe)", activeBorder:"#3a4a8a" },
  move:   { bg:"var(--t-card)", border:"#3a7a3a", color:"#1a5a1a", activeBg:"var(--t-stripe)", activeBorder:"#2a6a2a" },
  end:    { bg:"var(--t-card)", border:"#9a3a3a", color:"#6a1a1a", activeBg:"var(--t-stripe)", activeBorder:"#7a2a2a" },
});

function CombatActions({ onAction, activeChar, initiativeOrder, party }) {
  const [selected, setSelected] = useState(null);
  const [target, setTarget] = useState("");

  // Build target list from initiative order, excluding the active character
  // Party members shown with ⚔ prefix, enemies plain
  const partyNames = new Set(party.map(c => c.name));
  const targets = initiativeOrder
    .filter(e => e.name !== (activeChar && activeChar.name))
    .map(e => ({ name: e.name, isParty: partyNames.has(e.name) }));

  // If current target is no longer in the list, clear it
  useEffect(() => {
    if (target && !targets.find(t => t.name === target)) setTarget("");
  }, [initiativeOrder]);

  const handleSend = (action) => {
    const who = activeChar ? activeChar.name + ": " : "";
    const msg = target
      ? who + action.msg + " Target: " + target + "."
      : who + action.msg;
    onAction(msg);
    setSelected(null);
  };

  return (
    <div style={styles.combatPanel}>
      <div style={styles.combatPanelTitle}>
        <span style={styles.combatTurnLabel}>⚔ {activeChar ? activeChar.name + "'s Turn" : "Combat"}</span>
        <select style={styles.targetSelect} value={target} onChange={e => setTarget(e.target.value)}>
          <option value="">— Select Target —</option>
          {targets.length > 0 && (
            <optgroup label="Enemies">
              {targets.filter(t => !t.isParty).map(t => (
                <option key={t.name} value={t.name}>{t.name}</option>
              ))}
            </optgroup>
          )}
          {targets.filter(t => t.isParty).length > 0 && (
            <optgroup label="Allies">
              {targets.filter(t => t.isParty).map(t => (
                <option key={t.name} value={t.name}>⚔ {t.name}</option>
              ))}
            </optgroup>
          )}
        </select>
      </div>
      <div style={styles.combatGrid}>
        {ACTIONS.map((a, i) => {
          const TYPE_COLORS = getTypeColors();
          const c = TYPE_COLORS[a.type];
          const isSelected = selected === i;
          return (
            <button key={i}
              style={{ padding:"6px 8px", background: isSelected ? c.activeBg : c.bg,
                border:"1px solid " + (isSelected ? c.activeBorder : c.border),
                borderRadius:"4px", color: c.color, cursor:"pointer",
                fontSize:"11px", fontFamily:"var(--font-ui)", transition:"all 0.15s", textAlign:"left" }}
              onClick={() => { setSelected(i); handleSend(a); }}>
              {a.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── DICE ROLLER ──────────────────────────────────────────────────────────────
const DICE = [4, 6, 8, 10, 12, 20, 100];

function DiceRoller() {
  const [count, setCount] = useState(1);
  const [die, setDie] = useState(20);
  const [result, setResult] = useState(null);
  const [rolls, setRolls] = useState([]);
  const [rolling, setRolling] = useState(false);

  const roll = () => {
    setRolling(true);
    setResult(null);
    setTimeout(() => {
      const r = Array.from({ length: count }, () => Math.floor(Math.random() * die) + 1);
      setRolls(r);
      setResult(r.reduce((a, b) => a + b, 0));
      setRolling(false);
    }, 350);
  };

  return (
    <div style={styles.section}>
      <div style={styles.sectionTitle}>🎲 DICE ROLLER</div>
      <div style={styles.diceControls}>
        <div style={styles.diceField}>
          <label style={styles.diceLabel}># Dice</label>
          <div style={styles.diceCounter}>
            <button style={styles.diceCountBtn} onClick={() => setCount(c => Math.max(1, c - 1))}>−</button>
            <span style={styles.diceCountVal}>{count}</span>
            <button style={styles.diceCountBtn} onClick={() => setCount(c => Math.min(20, c + 1))}>+</button>
          </div>
        </div>
        <div style={styles.diceField}>
          <label style={styles.diceLabel}>Die Type</label>
          <div style={styles.dicePicker}>
            {DICE.map(d => (
              <button key={d} style={{...styles.dieBtn, ...(die === d ? styles.dieBtnActive : {})}}
                onClick={() => setDie(d)}>d{d}</button>
            ))}
          </div>
        </div>
      </div>
      <button style={styles.rollBtn} onClick={roll} disabled={rolling}>
        {rolling ? "Rolling..." : `Roll ${count}d${die}`}
      </button>
      {result !== null && !rolling && (
        <div style={styles.diceResult}>
          <div style={styles.diceTotal}>{result}</div>
          {count > 1 && (
            <div style={styles.diceBreakdown}>[{rolls.join(" + ")}]</div>
          )}
          <div style={styles.diceFormula}>{count}d{die}</div>
        </div>
      )}
    </div>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const styles = {
  root: { display:"flex", flexDirection:"column", height:"100vh", background:"var(--t-bg)", color:"var(--t-text)", fontFamily:"var(--font-body)", overflow:"hidden" },
  header: { display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 18px", background:"var(--t-header)", borderBottom:"3px solid var(--t-border-strong)", flexShrink:0 },
  headerLeft: { display:"flex", alignItems:"center", gap:"14px" },
  logo: { fontSize:"20px", fontWeight:"bold", letterSpacing:"4px", color:"var(--t-gold)", fontFamily:"var(--font-display)", textTransform:"uppercase" },
  worldName: { fontSize:"13px", color:"var(--t-gold)", fontStyle:"italic", fontFamily:"var(--font-body)", opacity:0.8 },
  headerRight: { display:"flex", alignItems:"center", gap:"8px" },
  iconBtn: { padding:"6px 12px", background:"var(--t-accent)", border:"1px solid var(--t-gold)", borderRadius:"3px", color:"var(--t-gold)", cursor:"pointer", fontSize:"12px", fontFamily:"var(--font-ui)", transition:"all 0.2s" },
  iconBtnActive: { opacity:0.8 },
  body: { display:"flex", flex:1, overflow:"hidden" },
  narrativePanel: { flex:1, display:"flex", flexDirection:"column", borderRight:"2px solid var(--t-border-strong)", minWidth:0, background:"var(--t-panel)" },
  locationBar: { display:"flex", alignItems:"center", gap:"12px", padding:"7px 14px", background:"var(--t-stripe)", borderBottom:"1px solid var(--t-border)", flexShrink:0, flexWrap:"wrap" },
  locIcon: { fontSize:"14px" },
  locName: { fontWeight:"600", color:"var(--t-accent)", fontSize:"13px", letterSpacing:"0.5px", fontFamily:"var(--font-smallcap)" },
  locDetail: { color:"var(--t-text-sec)", fontSize:"12px", fontStyle:"italic", flex:1, fontFamily:"var(--font-body)" },
  locWeather: { fontSize:"11px", color:"var(--t-text-muted)", fontFamily:"var(--font-ui)" },
  locTime: { fontSize:"11px", color:"var(--t-text-muted)", fontFamily:"var(--font-ui)" },
  chat: { flex:1, overflowY:"auto", padding:"16px", display:"flex", flexDirection:"column", gap:"14px", scrollbarWidth:"thin", scrollbarColor:"var(--t-border) var(--t-panel)" },
  emptyChat: { color:"var(--t-text-muted)", fontStyle:"italic", textAlign:"center", marginTop:"40px", fontFamily:"var(--font-body)" },
  dmMsg: { display:"flex", flexDirection:"column", gap:"4px", maxWidth:"92%" },
  playerMsg: { display:"flex", flexDirection:"column", gap:"4px", maxWidth:"80%", alignSelf:"flex-end", alignItems:"flex-end" },
  dmLabel: { fontSize:"10px", letterSpacing:"3px", color:"var(--t-accent)", fontWeight:"600", fontFamily:"var(--font-smallcap)" },
  playerLabel: { fontSize:"10px", letterSpacing:"3px", color:"var(--t-text-sec)", fontWeight:"600", fontFamily:"var(--font-smallcap)" },
  msgText: { fontSize:"15px", lineHeight:"1.75", color:"var(--t-text)", background:"var(--t-msg)", border:"1px solid var(--t-border)", borderRadius:"3px", padding:"10px 14px", whiteSpace:"pre-wrap", boxShadow:"0 1px 3px rgba(0,0,0,0.08)", fontFamily:"var(--font-body)" },
  typing: { display:"flex", gap:"4px", padding:"12px 16px", background:"var(--t-msg)", border:"1px solid var(--t-border)", borderRadius:"3px" },
  inputRow: { padding:"10px 14px", background:"var(--t-stripe)", borderTop:"2px solid var(--t-border-strong)", display:"flex", gap:"8px", flexShrink:0 },
  textInput: { flex:1, background:"var(--t-input)", border:"1px solid var(--t-border)", borderRadius:"3px", color:"var(--t-text)", padding:"9px 12px", fontSize:"14px", fontFamily:"var(--font-body)", outline:"none" },
  sendBtn: { padding:"9px 18px", background:"var(--t-accent)", border:"1px solid var(--t-border-strong)", borderRadius:"3px", color:"var(--t-gold)", cursor:"pointer", fontSize:"12px", fontFamily:"var(--font-ui)", fontWeight:"700", letterSpacing:"1px", transition:"all 0.2s" },
  micHint: { fontSize:"11px", color:"var(--t-gold)", fontStyle:"italic", fontFamily:"var(--font-ui)", opacity:0.8 },
  micBtn: { padding:"9px 12px", background:"var(--t-accent)", border:"1px solid var(--t-gold)", borderRadius:"3px", cursor:"pointer", fontSize:"16px", transition:"all 0.2s" },
  micBtnActive: { opacity:0.6 },
  suggestionsRow: { display:"flex", flexWrap:"wrap", gap:"6px", padding:"8px 14px 6px", background:"var(--t-stripe)", borderTop:"1px solid var(--t-border)" },
  suggestionBtn: { padding:"5px 12px", background:"var(--t-card)", border:"1px solid var(--t-border-strong)", borderRadius:"20px", color:"var(--t-accent)", cursor:"pointer", fontSize:"12px", fontFamily:"var(--font-ui)", transition:"all 0.15s", whiteSpace:"nowrap" },
  suggestionBtnDetails: { background:"var(--t-bg)", border:"1px solid var(--t-border)", color:"var(--t-text-sec)" },
  statsPanel: { width:"300px", flexShrink:0, display:"flex", flexDirection:"column", background:"var(--t-bg)", overflowY:"auto", scrollbarWidth:"thin", scrollbarColor:"var(--t-border) var(--t-bg)" },
  charTabs: { display:"flex", flexWrap:"wrap", borderBottom:"2px solid var(--t-border-strong)", flexShrink:0 },
  charTabBtn: { flex:1, padding:"8px 6px", background:"var(--t-stripe)", border:"none", borderRight:"1px solid var(--t-border)", color:"var(--t-text-sec)", cursor:"pointer", fontSize:"11px", fontFamily:"var(--font-ui)", transition:"all 0.2s", minWidth:"60px" },
  charTabActive: { background:"var(--t-accent)", color:"var(--t-gold)", borderBottom:"none" },
  charSheet: { padding:"12px", display:"flex", flexDirection:"column", gap:"10px" },
  charHeader: { textAlign:"center", paddingBottom:"8px", borderBottom:"2px solid var(--t-border-strong)" },
  charName: { fontSize:"20px", color:"var(--t-accent)", fontWeight:"700", letterSpacing:"2px", fontFamily:"var(--font-display)", textTransform:"uppercase" },
  charSub: { fontSize:"12px", color:"var(--t-text-sec)", fontStyle:"italic", marginTop:"2px", fontFamily:"var(--font-body)" },
  openSheetBtn: { marginTop:"6px", padding:"4px 10px", background:"transparent", border:"1px solid var(--t-border-strong)", borderRadius:"3px", color:"var(--t-accent)", cursor:"pointer", fontSize:"11px", fontFamily:"var(--font-ui)", width:"100%", transition:"all 0.15s" },
  hpBlock: { background:"var(--t-card)", border:"1px solid var(--t-border)", borderRadius:"4px", padding:"10px" },
  hpLabel: { fontSize:"9px", letterSpacing:"2px", color:"var(--t-accent-light)", marginBottom:"6px", fontWeight:"bold", fontFamily:"var(--font-smallcap)" },
  hpRow: { display:"flex", alignItems:"center", gap:"4px", justifyContent:"center" },
  hpInput: { width:"56px", background:"transparent", border:"none", borderBottom:"2px solid var(--t-border-strong)", color:"var(--t-text)", fontSize:"22px", textAlign:"center", fontFamily:"var(--font-body)", outline:"none" },
  hpSlash: { fontSize:"20px", color:"var(--t-border)" },
  hpBar: { height:"6px", background:"var(--t-stripe)", borderRadius:"3px", marginTop:"8px", overflow:"hidden" },
  hpFill: { height:"100%", borderRadius:"3px", transition:"width 0.5s, background 0.5s" },
  coreStats: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px" },
  statBox: { background:"var(--t-card)", border:"1px solid var(--t-border)", borderRadius:"3px", padding:"6px 8px", textAlign:"center" },
  statLabel: { fontSize:"9px", letterSpacing:"2px", color:"var(--t-accent-light)", marginBottom:"3px", fontWeight:"bold", fontFamily:"var(--font-smallcap)" },
  statInput: { background:"transparent", border:"none", color:"var(--t-text)", fontSize:"16px", textAlign:"center", width:"100%", fontFamily:"var(--font-body)", outline:"none" },
  inspirationRow: { display:"flex" },
  inspirationBtn: { flex:1, padding:"6px", background:"var(--t-card)", border:"1px solid var(--t-border)", borderRadius:"3px", color:"var(--t-text-sec)", cursor:"pointer", fontSize:"11px", fontFamily:"var(--font-ui)", letterSpacing:"1px" },
  inspirationActive: { background:"var(--t-accent)", border:"1px solid var(--t-border-strong)", color:"var(--t-gold)" },
  section: { background:"var(--t-card)", border:"1px solid var(--t-border)", borderRadius:"4px", padding:"8px 10px" },
  sectionTitle: { fontSize:"9px", letterSpacing:"3px", color:"var(--t-accent-light)", marginBottom:"8px", fontWeight:"bold", fontFamily:"var(--font-smallcap)" },
  deathSaveRow: { display:"flex", alignItems:"center", gap:"6px", marginBottom:"4px" },
  dsLabel: { fontSize:"10px", color:"var(--t-text-sec)", width:"72px", fontFamily:"var(--font-ui)" },
  dsPip: { width:"16px", height:"16px", borderRadius:"50%", background:"var(--t-stripe)", border:"1px solid var(--t-border)", cursor:"pointer" },
  dsPipSuccess: { background:"#2a5a2a", border:"1px solid #3a8a3a" },
  dsPipFail: { background:"#7a1a1a", border:"1px solid #aa3a3a" },
  slotRow: { display:"flex", alignItems:"center", gap:"6px", marginBottom:"4px" },
  slotLabel: { fontSize:"10px", color:"var(--t-text-sec)", width:"32px", fontFamily:"var(--font-ui)" },
  slotPips: { display:"flex", gap:"3px", flex:1 },
  slotPip: { width:"12px", height:"12px", borderRadius:"2px", cursor:"pointer", border:"none" },
  slotPipFull: { background:"var(--t-accent)" },
  slotPipEmpty: { background:"var(--t-stripe)", border:"1px solid var(--t-border)" },
  slotCountInput: { width:"30px", background:"transparent", border:"1px solid var(--t-border)", borderRadius:"2px", color:"var(--t-text)", textAlign:"center", fontSize:"11px", fontFamily:"var(--font-ui)" },
  addSlotBtn: { marginTop:"4px", padding:"4px 8px", background:"transparent", border:"1px dashed var(--t-border)", borderRadius:"2px", color:"var(--t-text-muted)", cursor:"pointer", fontSize:"10px", fontFamily:"var(--font-ui)", width:"100%" },
  condGrid: { display:"flex", flexWrap:"wrap", gap:"4px" },
  condBtn: { padding:"3px 7px", background:"var(--t-bg)", border:"1px solid var(--t-border)", borderRadius:"3px", color:"var(--t-text-sec)", cursor:"pointer", fontSize:"10px", fontFamily:"var(--font-ui)", transition:"all 0.15s" },
  condBtnActive: { background:"#7a1a1a", border:"1px solid #aa3a3a", color:"#fdf6ea" },
  combatPanel: { background:"var(--t-stripe)", borderTop:"2px solid var(--t-border-strong)", padding:"8px 12px", flexShrink:0 },
  combatPanelTitle: { display:"flex", alignItems:"center", gap:"8px", marginBottom:"8px" },
  combatTurnLabel: { fontSize:"12px", color:"var(--t-accent)", letterSpacing:"2px", whiteSpace:"nowrap", fontWeight:"600", fontFamily:"var(--font-smallcap)" },
  targetSelect: { flex:1, background:"var(--t-card)", border:"1px solid var(--t-border)", borderRadius:"3px", color:"var(--t-text)", fontSize:"11px", fontFamily:"var(--font-ui)", padding:"4px 8px", outline:"none", cursor:"pointer" },
  combatGrid: { display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:"4px" },
  aeBlock: { background:"var(--t-card)", border:"1px solid var(--t-border)", borderRadius:"4px", padding:"10px" },
  aeRow: { display:"flex", gap:"6px", marginTop:"6px" },
  aePip: { flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:"2px", padding:"6px 4px", borderRadius:"3px", border:"1px solid" },
  aePipFree: { background:"#e8f0e8", borderColor:"#5a8a5a" },
  aePipUsed: { background:"#f0e8e8", borderColor:"#c0a0a0", opacity:0.6 },
  aePipIcon: { fontSize:"14px" },
  aePipLabel: { fontSize:"9px", color:"var(--t-text-sec)", letterSpacing:"1px", fontFamily:"var(--font-ui)" },
  initiativeBanner: { display:"flex", alignItems:"center", flexWrap:"wrap", gap:"6px", padding:"6px 14px", background:"var(--t-accent)", borderTop:"1px solid var(--t-border-strong)", flexShrink:0 },
  initLabel: { fontSize:"9px", letterSpacing:"3px", color:"var(--t-gold)", marginRight:"2px", fontFamily:"var(--font-smallcap)", fontWeight:"600" },
  initEntry: { fontSize:"11px", color:"var(--t-gold)", background:"var(--t-accent-light)", border:"1px solid var(--t-border-strong)", borderRadius:"3px", padding:"2px 7px", fontFamily:"var(--font-ui)", opacity:0.85 },
  initEntryActive: { color:"var(--t-accent)", background:"var(--t-gold)", border:"1px solid var(--t-gold)", fontWeight:"700", fontFamily:"var(--font-ui)", opacity:1 },
  initNum: { color:"var(--t-text-muted)", fontSize:"10px" },
  distanceBanner: { display:"flex", alignItems:"center", flexWrap:"wrap", gap:"6px", padding:"5px 14px", background:"var(--t-header)", borderTop:"1px solid var(--t-border-strong)", flexShrink:0 },
  distLabel: { fontSize:"9px", letterSpacing:"2px", color:"var(--t-gold)", marginRight:"2px", fontFamily:"var(--font-smallcap)", fontWeight:"600", opacity:0.7 },
  distEntry: { fontSize:"11px", background:"var(--t-card)", border:"1px solid var(--t-border)", borderRadius:"3px", padding:"2px 7px", fontFamily:"var(--font-ui)" },
  distEntryClose: { color:"#ff8888", background:"#4a1010", borderColor:"#7a2020" },
  distEntryMed:   { color:"var(--t-gold)", background:"var(--t-accent)", borderColor:"var(--t-border-strong)" },
  distEntryFar:   { color:"#a0c0d0", background:"#102030", borderColor:"#204050" },
  distNum: { color:"var(--t-text-muted)", fontSize:"10px" },
  activePlayerBar: { display:"flex", alignItems:"center", gap:"6px", padding:"6px 14px", background:"var(--t-stripe)", borderTop:"1px solid var(--t-border)", flexShrink:0, flexWrap:"wrap" },
  activePlayerLabel: { fontSize:"9px", letterSpacing:"3px", color:"var(--t-accent-light)", marginRight:"2px", fontWeight:"600", fontFamily:"var(--font-smallcap)" },
  activePlayerBtn: { padding:"4px 12px", background:"var(--t-card)", border:"1px solid var(--t-border)", borderRadius:"12px", color:"var(--t-text-sec)", cursor:"pointer", fontSize:"11px", fontFamily:"var(--font-ui)", transition:"all 0.15s" },
  activePlayerBtnOn: { background:"var(--t-accent)", border:"1px solid var(--t-border-strong)", color:"var(--t-gold)" },
  activePlayerBtnParty: { border:"1px dashed var(--t-text-muted)", fontStyle:"italic" },
  activePlayerDivider: { width:"1px", background:"var(--t-border)", alignSelf:"stretch", margin:"0 2px" },
  xpBadge: { fontSize:"12px", color:"var(--t-gold)", background:"var(--t-accent)", border:"1px solid var(--t-gold)", borderRadius:"3px", padding:"3px 10px", fontFamily:"var(--font-ui)", fontWeight:"700", opacity:0.9 },
  slotBadge: { fontSize:"11px", color:"var(--t-gold)", background:"var(--t-accent-light)", border:"1px solid var(--t-gold)", borderRadius:"3px", padding:"3px 8px", fontFamily:"var(--font-ui)", opacity:0.8 },
  recapBtn: { padding:"3px 8px", background:"transparent", border:"1px solid var(--t-border-strong)", borderRadius:"3px", color:"var(--t-accent)", cursor:"pointer", fontSize:"10px", fontFamily:"var(--font-ui)" },
  modalOverlay: { position:"fixed", inset:0, background:"rgba(0,0,0,0.82)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 },
  modalBox: { background:"var(--t-panel)", border:"3px solid var(--t-border-strong)", borderRadius:"4px", padding:"28px", width:"100%", maxWidth:"520px", margin:"16px", boxShadow:"0 8px 32px rgba(0,0,0,0.5)" },
  modalTitle: { fontSize:"20px", color:"var(--t-accent)", letterSpacing:"3px", textAlign:"center", marginBottom:"6px", fontWeight:"700", fontFamily:"var(--font-display)", textTransform:"uppercase" },
  modalSub: { fontSize:"12px", color:"var(--t-text-sec)", fontStyle:"italic", textAlign:"center", marginBottom:"20px", fontFamily:"var(--font-body)" },
  slotGrid: { display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"10px", marginBottom:"16px" },
  slotCard: { background:"var(--t-card)", border:"1px solid var(--t-border)", borderRadius:"4px", padding:"12px", display:"flex", flexDirection:"column", gap:"4px" },
  slotCardActive: { border:"2px solid var(--t-border-strong)", background:"var(--t-panel)" },
  slotNum: { fontSize:"9px", letterSpacing:"3px", color:"var(--t-accent-light)", fontWeight:"bold", fontFamily:"var(--font-smallcap)" },
  slotName: { fontSize:"15px", color:"var(--t-text)", fontWeight:"700", fontFamily:"var(--font-display)", letterSpacing:"1px" },
  slotDetail: { fontSize:"11px", color:"var(--t-text-sec)", fontStyle:"italic", fontFamily:"var(--font-body)" },
  slotMsgs: { fontSize:"10px", color:"var(--t-text-muted)", marginBottom:"6px", fontFamily:"var(--font-ui)" },
  slotEmpty: { fontSize:"13px", color:"var(--t-text-muted)", fontStyle:"italic", flex:1, marginBottom:"8px", fontFamily:"var(--font-body)" },
  slotActions: { display:"flex", gap:"6px", flexWrap:"wrap" },
  slotLoadBtn: { padding:"5px 10px", background:"var(--t-accent)", border:"1px solid var(--t-border-strong)", borderRadius:"3px", color:"var(--t-gold)", cursor:"pointer", fontSize:"11px", fontFamily:"var(--font-ui)", fontWeight:"700" },
  slotResetBtn: { padding:"5px 10px", background:"transparent", border:"1px solid #9a3a3a", borderRadius:"3px", color:"#9a3a3a", cursor:"pointer", fontSize:"11px", fontFamily:"var(--font-ui)" },
  modalCloseBtn: { width:"100%", padding:"10px", background:"transparent", border:"1px solid var(--t-border)", borderRadius:"3px", color:"var(--t-text-sec)", cursor:"pointer", fontSize:"13px", fontFamily:"var(--font-ui)" },
  notesArea: { width:"100%", minHeight:"120px", background:"var(--t-card)", border:"1px solid var(--t-border)", borderRadius:"3px", color:"var(--t-text)", fontSize:"13px", fontFamily:"var(--font-body)", padding:"8px", resize:"vertical", outline:"none", lineHeight:"1.6", boxSizing:"border-box" },
  diceControls: { display:"flex", flexDirection:"column", gap:"8px", marginBottom:"8px" },
  diceField: { display:"flex", flexDirection:"column", gap:"4px" },
  diceLabel: { fontSize:"9px", letterSpacing:"3px", color:"var(--t-accent-light)", fontWeight:"600", fontFamily:"var(--font-smallcap)" },
  diceCounter: { display:"flex", alignItems:"center", gap:"8px" },
  diceCountBtn: { width:"24px", height:"24px", background:"var(--t-accent)", border:"1px solid var(--t-border-strong)", borderRadius:"3px", color:"var(--t-gold)", cursor:"pointer", fontSize:"14px", lineHeight:1, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"var(--font-ui)" },
  diceCountVal: { fontSize:"16px", color:"var(--t-text)", minWidth:"20px", textAlign:"center", fontFamily:"var(--font-body)" },
  dicePicker: { display:"flex", flexWrap:"wrap", gap:"4px" },
  dieBtn: { padding:"3px 7px", background:"var(--t-bg)", border:"1px solid var(--t-border)", borderRadius:"3px", color:"var(--t-text-sec)", cursor:"pointer", fontSize:"11px", fontFamily:"var(--font-ui)", transition:"all 0.15s" },
  dieBtnActive: { background:"var(--t-accent)", border:"1px solid var(--t-border-strong)", color:"var(--t-gold)" },
  rollBtn: { width:"100%", padding:"8px", background:"var(--t-accent)", border:"1px solid var(--t-border-strong)", borderRadius:"3px", color:"var(--t-gold)", cursor:"pointer", fontSize:"13px", fontFamily:"var(--font-ui)", fontWeight:"700", letterSpacing:"2px", marginBottom:"8px", transition:"all 0.2s" },
  diceResult: { textAlign:"center", padding:"10px", background:"var(--t-card)", borderRadius:"3px", border:"2px solid var(--t-border-strong)" },
  diceTotal: { fontSize:"40px", color:"var(--t-accent)", fontWeight:"700", lineHeight:1, fontFamily:"var(--font-display)" },
  diceBreakdown: { fontSize:"12px", color:"var(--t-text-sec)", marginTop:"4px", fontFamily:"var(--font-ui)" },
  diceFormula: { fontSize:"10px", color:"var(--t-text-muted)", letterSpacing:"2px", marginTop:"2px", fontFamily:"var(--font-smallcap)" },
  setupOverlay: { display:"flex", alignItems:"flex-start", justifyContent:"center", minHeight:"100vh", background:"var(--t-header)", fontFamily:"var(--font-body)", overflowY:"auto", padding:"20px 0" },
  setupBox: { width:"100%", maxWidth:"560px", background:"var(--t-panel)", border:"3px solid var(--t-border-strong)", borderRadius:"4px", padding:"32px", margin:"0 16px", boxShadow:"0 8px 40px rgba(0,0,0,0.6)" },
  setupTitle: { fontSize:"28px", textAlign:"center", color:"var(--t-accent)", letterSpacing:"5px", marginBottom:"6px", fontWeight:"700", fontFamily:"var(--font-display)", textTransform:"uppercase" },
  setupSub: { fontSize:"14px", textAlign:"center", color:"var(--t-text-sec)", fontStyle:"italic", marginBottom:"24px", fontFamily:"var(--font-body)" },
  setupForm: { display:"flex", flexDirection:"column", gap:"12px" },
  label: { fontSize:"9px", letterSpacing:"3px", color:"var(--t-accent-light)", marginBottom:"-6px", fontWeight:"600", fontFamily:"var(--font-smallcap)" },
  setupInput: { background:"var(--t-card)", border:"1px solid var(--t-border)", borderRadius:"3px", color:"var(--t-text)", padding:"9px 12px", fontSize:"14px", fontFamily:"var(--font-body)", outline:"none" },
  setupBtn: { padding:"12px", background:"var(--t-accent)", border:"1px solid var(--t-border-strong)", borderRadius:"3px", color:"var(--t-gold)", cursor:"pointer", fontSize:"14px", fontFamily:"var(--font-ui)", fontWeight:"700", letterSpacing:"2px", marginTop:"4px" },
  charTabsSetup: { display:"flex", flexWrap:"wrap", gap:"6px", marginBottom:"12px" },
  addCharBtn: { padding:"6px 10px", background:"transparent", border:"1px dashed var(--t-border)", borderRadius:"3px", color:"var(--t-text-sec)", cursor:"pointer", fontSize:"12px", fontFamily:"var(--font-ui)" },
  charGrid: { display:"grid", gridTemplateColumns:"1fr", gap:"10px" },
  charField: { display:"flex", flexDirection:"column", gap:"4px" },
};
