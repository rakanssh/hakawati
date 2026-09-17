const { createHash } = require("node:crypto");
const {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} = require("node:fs");
const { join } = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const root = join(__dirname, "..");
const fixtureDirectory = join(root, "src-tauri", "fixtures");
const fixturePath = join(fixtureDirectory, "v0.15.2-release.db");
const fixtureTempPath = `${fixturePath}.tmp`;
const manifestPath = join(fixtureDirectory, "v0.15.2-release.manifest.json");

mkdirSync(fixtureDirectory, { recursive: true });
for (const path of [fixtureTempPath]) {
  if (existsSync(path)) rmSync(path);
}

const db = new DatabaseSync(fixtureTempPath);
db.exec("PRAGMA foreign_keys = ON");
for (const migration of [
  "001_create_scenarios.sql",
  "002_create_tales.sql",
  "003_add_prompt_components.sql",
]) {
  db.exec(
    readFileSync(join(root, "src-tauri", "migrations", migration), "utf8"),
  );
}

db.exec(`
  CREATE TABLE _sqlx_migrations (
    version BIGINT PRIMARY KEY,
    description TEXT NOT NULL,
    installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    success BOOLEAN NOT NULL,
    checksum BLOB NOT NULL,
    execution_time BIGINT NOT NULL
  )
`);

const migrationRecords = [
  [
    1,
    "create_scenarios_table",
    "2b5adfe6973b2bb577b3971031b2b62271bc31ca11310588dfe1ef3952a5b5cfbf9d674bfc23deded807930a70b61309",
  ],
  [
    2,
    "create_tales_table",
    "012387dc0bcdf98564a93e01c014fa529aa16319ce05e699dc64ac764033e924dbb8e2b5b3824e3a6de22271d2fb4b70",
  ],
  [
    3,
    "add_prompt_components",
    "82a39d84ffac1b10e4bf9ec1f70fca797ac6f3f2b90f4e4f56cf8871005ff85097753dee5c22919d390482385b93b33b",
  ],
];
const insertMigration = db.prepare(`
  INSERT INTO _sqlx_migrations (
    version, description, installed_on, success, checksum, execution_time
  ) VALUES (?, ?, '2026-06-13 00:00:00Z', 1, ?, 0)
`);
for (const [version, description, checksum] of migrationRecords) {
  insertMigration.run(version, description, Buffer.from(checksum, "hex"));
}

const scenario = {
  id: "scenario-iron-gate",
  name: "Iron Gate / بوابة الحديد",
  initialGameMode: "story_teller",
  description: "A rain-soaked gate divides the old city.",
  authorNote: "Keep choices consequential and preserve Arabic names.",
  stats: [
    {
      name: "Nerve",
      description: "Resolve under pressure",
      value: 5,
      range: [0, 10],
    },
  ],
  inventory: ["Iron key", "دفتر صغير"],
  storyCards: [
    {
      id: "gatekeeper-maryam",
      title: "Maryam / مريم",
      triggers: ["Maryam", "مريم", "gatekeeper"],
      content: "The gatekeeper remembers every promise.",
      category: "Character",
      isPinned: true,
      createdAt: 1710000000000,
      updatedAt: 1710000000000,
    },
    {
      id: "merchant-salim",
      title: "Salim / سالم",
      triggers: ["Salim", "سالم", "merchant"],
      content: "A merchant carrying news from beyond the gate.",
      category: "Character",
      isPinned: false,
      createdAt: 1710000000000,
      updatedAt: 1710000000000,
    },
  ],
  openingText: "Rain needles the iron gate as مريم raises her lantern.",
  components: [
    {
      id: "scenario-plot",
      type: "plot",
      content: "Discover why the old city gate was sealed.",
      createdAt: 1710000000000,
      updatedAt: 1710000000000,
    },
    {
      id: "scenario-author-note",
      type: "author_note",
      content: "Keep choices consequential and preserve Arabic names.",
      createdAt: 1710000000000,
      updatedAt: 1710000000000,
    },
    {
      id: "scenario-opening",
      type: "opening",
      content: "Rain needles the iron gate as مريم raises her lantern.",
      createdAt: 1710000000000,
      updatedAt: 1710000000000,
    },
  ],
};

db.prepare(
  `
  INSERT INTO scenarios (
    id, name, thumbnail_data, initial_game_mode, initial_description,
    initial_author_note, initial_stats, initial_inventory,
    initial_story_cards, opening_text, version, created_at, updated_at,
    components
  ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
`,
).run(
  scenario.id,
  scenario.name,
  scenario.initialGameMode,
  scenario.description,
  scenario.authorNote,
  JSON.stringify(scenario.stats),
  JSON.stringify(scenario.inventory),
  JSON.stringify(scenario.storyCards),
  scenario.openingText,
  1710000000000,
  1710000005000,
  JSON.stringify(scenario.components),
);

const entry = (id, role, mode, text, createdAt) => ({
  id,
  role,
  mode,
  text,
  createdAt,
});
const tales = [
  {
    id: "tale-completed",
    name: "The Open Gate",
    description: "A completed play session.",
    authorNote: "The promise to Maryam must matter.",
    gameMode: "story_teller",
    log: [
      entry(
        "completed-1",
        "player",
        "do",
        "I show Maryam the iron key.",
        1710000100000,
      ),
      entry(
        "completed-2",
        "gm",
        "story",
        "Maryam studies the worn teeth of the key.",
        1710000101000,
      ),
      entry("completed-3", "player", "say", "سأفي بوعدي.", 1710000102000),
      entry(
        "completed-4",
        "gm",
        "story",
        "The gatekeeper opens the first lock.",
        1710000103000,
      ),
      entry(
        "completed-5",
        "player",
        "do",
        "I turn the key in the final lock.",
        1710000104000,
      ),
      entry(
        "completed-6",
        "gm",
        "story",
        "The gate opens and morning reaches the old city.",
        1710000105000,
      ),
    ],
  },
  {
    id: "tale-interrupted",
    name: "Lantern in the Storm",
    description: "An interrupted session ending on player input.",
    authorNote: "Resume before generating the next narrator turn.",
    gameMode: "gm",
    log: [
      entry(
        "interrupted-1",
        "player",
        "do",
        "I follow Salim into the market.",
        1710000200000,
      ),
      entry(
        "interrupted-2",
        "gm",
        "story",
        "The lamps vanish one by one behind you.",
        1710000201000,
      ),
      entry(
        "interrupted-3",
        "player",
        "say",
        "Salim, wait—what did you hear?",
        1710000202000,
      ),
    ],
  },
  {
    id: "tale-arabic",
    name: "حكاية الحارس",
    description: "جلسة عربية مع أسماء وشخصيات متعددة.",
    authorNote: "اكتب بالعربية الفصحى البسيطة.",
    gameMode: "story_teller",
    log: [
      entry(
        "arabic-1",
        "player",
        "say",
        "يا مريم، لماذا أُغلقت البوابة؟",
        1710000300000,
      ),
      entry(
        "arabic-2",
        "gm",
        "story",
        "تنظر مريم إلى سالم قبل أن تجيب.",
        1710000301000,
      ),
      entry(
        "arabic-3",
        "player",
        "do",
        "أفتح الدفتر الصغير وأبحث عن الختم.",
        1710000302000,
      ),
    ],
  },
];

const insertTale = db.prepare(`
  INSERT INTO tales (
    id, name, description, thumbnail_data, author_note, story_cards,
    scenario_id, stats, inventory, undo_stack, log, game_mode, version,
    created_at, updated_at, components
  ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
`);
for (const [index, tale] of tales.entries()) {
  insertTale.run(
    tale.id,
    tale.name,
    tale.description,
    tale.authorNote,
    JSON.stringify(scenario.storyCards),
    scenario.id,
    JSON.stringify(scenario.stats),
    JSON.stringify([{ id: "iron-key", name: "Iron key" }]),
    JSON.stringify(tale.log.slice(0, 1)),
    JSON.stringify(tale.log),
    tale.gameMode,
    1710000100000 + index * 100000,
    1710000105000 + index * 100000,
    JSON.stringify([
      {
        id: `${tale.id}-plot`,
        type: "plot",
        content: tale.description,
        createdAt: 1710000000000,
        updatedAt: 1710000000000,
      },
      {
        id: `${tale.id}-author-note`,
        type: "author_note",
        content: tale.authorNote,
        createdAt: 1710000000000,
        updatedAt: 1710000000000,
      },
    ]),
  );
}

db.exec("VACUUM");

const hash = (value) =>
  createHash("sha256").update(value, "utf8").digest("hex");
const rowCounts = {
  scenarios: db.prepare("SELECT COUNT(*) AS count FROM scenarios").get().count,
  tales: db.prepare("SELECT COUNT(*) AS count FROM tales").get().count,
  legacyLogEntries: db
    .prepare("SELECT SUM(json_array_length(log)) AS count FROM tales")
    .get().count,
  expectedTaleStatesAfterUpgrade: 3,
  expectedTaleSessionsAfterUpgrade: 3,
  expectedTaleTurnsAfterUpgrade: 12,
};
const representativeContentHashes = {};
for (const [label, sql, id] of [
  [
    "scenario.components",
    "SELECT components AS value FROM scenarios WHERE id = ?",
    scenario.id,
  ],
  [
    "tale-completed.log",
    "SELECT log AS value FROM tales WHERE id = ?",
    "tale-completed",
  ],
  [
    "tale-arabic.story_cards",
    "SELECT story_cards AS value FROM tales WHERE id = ?",
    "tale-arabic",
  ],
]) {
  representativeContentHashes[label] = hash(db.prepare(sql).get(id).value);
}
db.close();

if (existsSync(fixturePath)) rmSync(fixturePath);
renameSync(fixtureTempPath, fixturePath);
const fixtureBytes = readFileSync(fixturePath);
const manifest = {
  fixture: "v0.15.2-release.db",
  sourceAppVersion: "0.15.2",
  sourceSchemaVersion: 3,
  generatedBy: "scripts/generate-v0152-migration-fixture.cjs",
  generatedAt: "2026-07-14T00:00:00.000Z",
  byteSize: statSync(fixturePath).size,
  sha256: createHash("sha256").update(fixtureBytes).digest("hex"),
  rowCounts,
  representativeContentHashes,
  coverage: {
    completedPlay: "tale-completed",
    interruptedPlay: "tale-interrupted",
    arabicEnglish: ["scenario-iron-gate", "tale-arabic"],
    characterNames: ["Maryam / مريم", "Salim / سالم"],
    settingsStorage: "v0.15.2 settings are localStorage-backed, not SQLite",
  },
};
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(`Generated ${fixturePath}`);
console.log(`SHA-256 ${manifest.sha256}`);
