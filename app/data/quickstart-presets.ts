import { Stat } from "@/types/stats.type";

export type Setting = {
  id: string;
  name: string;
  icon: string;
};

export type Archetype = {
  id: string;
  name: string;
  defaultStats?: Stat[];
  defaultInventory?: string[];
};

export type Tone = {
  id: string;
  name: string;
};

export const SETTINGS: Setting[] = [
  {
    id: "fantasy",
    name: "Fantasy",
    icon: "⚔️",
  },
  {
    id: "mystery",
    name: "Mystery",
    icon: "🔍",
  },
  {
    id: "zombies",
    name: "Zombies",
    icon: "🧟",
  },
  {
    id: "scifi",
    name: "Sci-Fi",
    icon: "🚀",
  },
  {
    id: "horror",
    name: "Horror",
    icon: "👻",
  },
  {
    id: "custom",
    name: "Custom",
    icon: "✨",
  },
];

export const ARCHETYPES: Record<string, Archetype[]> = {
  fantasy: [
    {
      id: "warrior",
      name: "Warrior",
      defaultStats: [
        { name: "HP", value: 100, range: [0, 100] },
        { name: "Stamina", value: 30, range: [0, 50] },
      ],
      defaultInventory: ["Iron Sword", "Wooden Shield"],
    },
    {
      id: "mage",
      name: "Mage",
      defaultStats: [
        { name: "HP", value: 100, range: [0, 100] },
        { name: "Mana", value: 70, range: [0, 100] },
      ],
      defaultInventory: ["Wooden Staff", "Mana Potion"],
    },
    {
      id: "rogue",
      name: "Rogue",
      defaultStats: [{ name: "HP", value: 100, range: [0, 100] }],
      defaultInventory: ["Dagger", "Lockpick Set"],
    },
    {
      id: "ranger",
      name: "Ranger",
      defaultStats: [
        { name: "HP", value: 100, range: [0, 100] },
        { name: "Stamina", value: 85, range: [0, 100] },
      ],
      defaultInventory: ["Longbow", "Quiver", "Hunting Knife"],
    },
  ],
  mystery: [
    {
      id: "detective",
      name: "Detective",
      defaultStats: [{ name: "HP", value: 100, range: [0, 100] }],
      defaultInventory: ["Notebook", "Revolver"],
    },
    {
      id: "journalist",
      name: "Journalist",
      defaultStats: [{ name: "HP", value: 100, range: [0, 100] }],
      defaultInventory: ["Camera", "Recorder"],
    },
    {
      id: "psychic",
      name: "Psychic",
      defaultStats: [{ name: "HP", value: 100, range: [0, 100] }],
      defaultInventory: ["Tarot Cards", "Incense"],
    },
  ],
  zombies: [
    {
      id: "survivor",
      name: "Survivor",
      defaultStats: [
        { name: "HP", value: 100, range: [0, 100] },
        { name: "Stamina", value: 85, range: [0, 100] },
        { name: "Stress", value: 0, range: [0, 100] },
      ],
      defaultInventory: ["Crowbar", "Canned Food", "First Aid Kit"],
    },
    {
      id: "medic",
      name: "Medic",
      defaultStats: [
        { name: "HP", value: 100, range: [0, 100] },
        { name: "Stress", value: 0, range: [0, 100] },
      ],
      defaultInventory: ["Medkit", "Painkillers"],
    },
    {
      id: "soldier",
      name: "Soldier",
      defaultStats: [
        { name: "HP", value: 100, range: [0, 100] },
        { name: "Stamina", value: 90, range: [0, 100] },
      ],
      defaultInventory: ["Pistol", "Combat Knife"],
    },
  ],
  scifi: [
    {
      id: "pilot",
      name: "Pilot",
      defaultStats: [{ name: "HP", value: 100, range: [0, 100] }],
      defaultInventory: ["Phaser"],
    },
    {
      id: "scientist",
      name: "Scientist",
      defaultStats: [{ name: "HP", value: 100, range: [0, 100] }],
      defaultInventory: ["Tricorder"],
    },
    {
      id: "marine",
      name: "Space Marine",
      defaultStats: [{ name: "HP", value: 100, range: [0, 100] }],
      defaultInventory: ["Pulse Rifle", "Power Armor"],
    },
  ],
  horror: [
    {
      id: "investigator",
      name: "Investigator",
      defaultStats: [{ name: "HP", value: 100, range: [0, 100] }],
      defaultInventory: ["Flashlight", "Old Diary", "Pocket Knife"],
    },
    {
      id: "occultist",
      name: "Occultist",
      defaultStats: [
        { name: "HP", value: 100, range: [0, 100] },
        { name: "Sanity", value: 80, range: [0, 100] },
      ],
      defaultInventory: ["Ancient Tome", "Candles", "Amulet"],
    },
    {
      id: "skeptic",
      name: "Skeptic",
      defaultStats: [
        { name: "HP", value: 100, range: [0, 100] },
        { name: "Sanity", value: 100, range: [0, 100] },
      ],
      defaultInventory: ["Camera", "Research Notes"],
    },
  ],
  custom: [
    {
      id: "custom-archetype",
      name: "Custom",
      defaultStats: [{ name: "HP", value: 100, range: [0, 100] }],
      defaultInventory: [],
    },
  ],
};

export const TONES: Tone[] = [
  {
    id: "serious",
    name: "Serious",
  },
  {
    id: "lighthearted",
    name: "Light-Hearted",
  },
  {
    id: "comedic",
    name: "Comedic",
  },
  {
    id: "none",
    name: "None",
  },
];

export function generateAuthorNote(setting: string, tone: string): string {
  const toneText = tone !== "none" ? ` Respond in a ${tone} tone.` : "";

  return `Respond in the second person when referring to the player.${toneText} Guide the story in a ${setting} world.`;
}

export function generateTaleName(
  characterName: string,
  setting: string,
): string {
  const settingObj = SETTINGS.find((s) => s.id === setting);
  const settingName = settingObj?.name || setting;
  return `${characterName}'s ${settingName} Adventure`;
}

export function generateDescription(
  characterName: string,
  archetype: string,
  setting: string,
  _tone: string,
): string {
  const settingObj = SETTINGS.find((s) => s.id === setting);
  const settingName = settingObj?.name || setting;
  const baseSetting = settingObj ? setting : "custom";

  const archetypeObj = ARCHETYPES[baseSetting]?.find((a) => a.id === archetype);
  const archetypeName = archetypeObj?.name || archetype || "character";

  const hooks: Record<string, string> = {
    fantasy: "with a quest",
    mystery: "with a new mystery",
    zombies: "as the dead walk the earth",
    scifi: "among the stars",
    horror: "as darkness falls",
    custom: "with endless possibilities",
  };

  const hook = hooks[baseSetting] || "with endless possibilities";

  return `You are ${characterName}, a ${archetypeName.toLowerCase()} in a ${settingName.toLowerCase()} world. The adventure begins ${hook}.`;
}

export function getRandomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}
