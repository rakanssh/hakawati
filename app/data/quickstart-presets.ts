import { Stat } from "@/types/stats.type";

export type Setting = {
  id: string;
  name: string;
  icon: string;
};

export type InventoryPreset = {
  name: string;
  description?: string;
};

export type Archetype = {
  id: string;
  name: string;
  defaultStats?: Stat[];
  defaultInventory?: InventoryPreset[];
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
        {
          name: "Stamina",
          value: 30,
          range: [0, 50],
          description: "Current energy",
        },
      ],
      defaultInventory: [{ name: "Iron Sword" }, { name: "Wooden Shield" }],
    },
    {
      id: "mage",
      name: "Mage",
      defaultStats: [
        { name: "HP", value: 100, range: [0, 100] },
        {
          name: "Mana",
          value: 70,
          range: [0, 100],
          description: "Expendable magical energy",
        },
      ],
      defaultInventory: [{ name: "Wooden Staff" }, { name: "Mana Potion" }],
    },
    {
      id: "rogue",
      name: "Rogue",
      defaultStats: [{ name: "HP", value: 100, range: [0, 100] }],
      defaultInventory: [{ name: "Dagger" }, { name: "Lockpick Set" }],
    },
    {
      id: "ranger",
      name: "Ranger",
      defaultStats: [
        { name: "HP", value: 100, range: [0, 100] },
        {
          name: "Stamina",
          value: 85,
          range: [0, 100],
          description: "Current energy",
        },
      ],
      defaultInventory: [
        { name: "Longbow" },
        { name: "Quiver" },
        { name: "Hunting Knife" },
      ],
    },
  ],
  mystery: [
    {
      id: "detective",
      name: "Detective",
      defaultStats: [{ name: "HP", value: 100, range: [0, 100] }],
      defaultInventory: [{ name: "Notebook" }, { name: "Revolver" }],
    },
    {
      id: "journalist",
      name: "Journalist",
      defaultStats: [{ name: "HP", value: 100, range: [0, 100] }],
      defaultInventory: [{ name: "Camera" }, { name: "Recorder" }],
    },
    {
      id: "psychic",
      name: "Psychic",
      defaultStats: [{ name: "HP", value: 100, range: [0, 100] }],
      defaultInventory: [
        { name: "Tarot Cards" },
        { name: "Incense", description: "A small bundle of incense sticks" },
      ],
    },
  ],
  zombies: [
    {
      id: "survivor",
      name: "Survivor",
      defaultStats: [
        { name: "HP", value: 100, range: [0, 100] },
        {
          name: "Stamina",
          value: 85,
          range: [0, 100],
          description: "Current energy",
        },
        {
          name: "Stress",
          value: 0,
          range: [0, 100],
          description: "Mental strain",
        },
      ],
      defaultInventory: [
        { name: "Crowbar" },
        { name: "Canned Food" },
        { name: "First Aid Kit" },
      ],
    },
    {
      id: "medic",
      name: "Medic",
      defaultStats: [
        { name: "HP", value: 100, range: [0, 100] },
        {
          name: "Stress",
          value: 0,
          range: [0, 100],
          description: "Mental strain",
        },
      ],
      defaultInventory: [{ name: "Medkit" }, { name: "Painkillers" }],
    },
    {
      id: "soldier",
      name: "Soldier",
      defaultStats: [
        { name: "HP", value: 100, range: [0, 100] },
        {
          name: "Stamina",
          value: 90,
          range: [0, 100],
          description: "Current energy",
        },
      ],
      defaultInventory: [{ name: "Pistol" }, { name: "Combat Knife" }],
    },
  ],
  scifi: [
    {
      id: "pilot",
      name: "Pilot",
      defaultStats: [{ name: "HP", value: 100, range: [0, 100] }],
      defaultInventory: [{ name: "Phaser", description: "Energy sidearm" }],
    },
    {
      id: "scientist",
      name: "Scientist",
      defaultStats: [{ name: "HP", value: 100, range: [0, 100] }],
      defaultInventory: [
        { name: "Tricorder", description: "Handheld scanner" },
      ],
    },
    {
      id: "marine",
      name: "Space Marine",
      defaultStats: [{ name: "HP", value: 100, range: [0, 100] }],
      defaultInventory: [
        { name: "Pulse Rifle" },
        {
          name: "Power Armor",
          description: "Exosuit with enhanced protection",
        },
      ],
    },
  ],
  horror: [
    {
      id: "investigator",
      name: "Investigator",
      defaultStats: [{ name: "HP", value: 100, range: [0, 100] }],
      defaultInventory: [
        { name: "Flashlight" },
        { name: "Old Diary" },
        { name: "Pocket Knife" },
      ],
    },
    {
      id: "occultist",
      name: "Occultist",
      defaultStats: [
        { name: "HP", value: 100, range: [0, 100] },
        {
          name: "Sanity",
          value: 80,
          range: [0, 100],
          description: "Mental stability",
        },
      ],
      defaultInventory: [
        { name: "Ancient Tome", description: "Contains forbidden knowledge" },
        { name: "Candles" },
        { name: "Amulet", description: "Protective charm" },
      ],
    },
    {
      id: "skeptic",
      name: "Skeptic",
      defaultStats: [
        { name: "HP", value: 100, range: [0, 100] },
        {
          name: "Sanity",
          value: 100,
          range: [0, 100],
          description: "Mental stability",
        },
      ],
      defaultInventory: [{ name: "Camera" }, { name: "Research Notes" }],
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
    fantasy: " with a quest",
    mystery: " with a new mystery",
    zombies: " as the dead walk the earth",
    scifi: " among the stars",
    horror: " as darkness falls",
  };

  const hook = hooks[baseSetting] || "";

  return `You are ${characterName}, a ${archetypeName.toLowerCase()} in a ${settingName.toLowerCase()} world. The adventure begins${hook}.`;
}

export function getRandomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}
