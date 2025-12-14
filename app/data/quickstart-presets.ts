import { t, msg } from "@lingui/core/macro";
import { MessageDescriptor } from "@lingui/core";

export type Setting = {
  id: string;
  name: MessageDescriptor;
  icon: string;
};

export type InventoryPreset = {
  name: MessageDescriptor;
  description?: MessageDescriptor;
};

export type StatPreset = {
  name: MessageDescriptor;
  value: number;
  range: [number, number];
  description?: MessageDescriptor;
};

export type Archetype = {
  id: string;
  name: MessageDescriptor;
  defaultStats?: StatPreset[];
  defaultInventory?: InventoryPreset[];
};

export type Tone = {
  id: string;
  name: MessageDescriptor;
};

export const SETTINGS: Setting[] = [
  {
    id: "fantasy",
    name: msg`Fantasy`,
    icon: "⚔️",
  },
  {
    id: "mystery",
    name: msg`Mystery`,
    icon: "🔍",
  },
  {
    id: "zombies",
    name: msg`Zombies`,
    icon: "🧟",
  },
  {
    id: "scifi",
    name: msg`Sci-Fi`,
    icon: "🚀",
  },
  {
    id: "horror",
    name: msg`Horror`,
    icon: "👻",
  },
  {
    id: "custom",
    name: msg`Custom`,
    icon: "✨",
  },
];

export const ARCHETYPES: Record<string, Archetype[]> = {
  fantasy: [
    {
      id: "warrior",
      name: msg`Warrior`,
      defaultStats: [
        { name: msg`HP`, value: 100, range: [0, 100] },
        {
          name: msg`Stamina`,
          value: 30,
          range: [0, 50],
          description: msg`Current energy`,
        },
      ],
      defaultInventory: [
        { name: msg`Iron Sword` },
        { name: msg`Wooden Shield` },
      ],
    },
    {
      id: "mage",
      name: msg`Mage`,
      defaultStats: [
        { name: msg`HP`, value: 100, range: [0, 100] },
        {
          name: msg`Mana`,
          value: 70,
          range: [0, 100],
          description: msg`Expendable magical energy`,
        },
      ],
      defaultInventory: [
        { name: msg`Wooden Staff` },
        { name: msg`Mana Potion` },
      ],
    },
    {
      id: "rogue",
      name: msg`Rogue`,
      defaultStats: [{ name: msg`HP`, value: 100, range: [0, 100] }],
      defaultInventory: [{ name: msg`Dagger` }, { name: msg`Lockpick Set` }],
    },
    {
      id: "ranger",
      name: msg`Ranger`,
      defaultStats: [
        { name: msg`HP`, value: 100, range: [0, 100] },
        {
          name: msg`Stamina`,
          value: 85,
          range: [0, 100],
          description: msg`Current energy`,
        },
      ],
      defaultInventory: [
        { name: msg`Longbow` },
        { name: msg`Quiver` },
        { name: msg`Hunting Knife` },
      ],
    },
  ],
  mystery: [
    {
      id: "detective",
      name: msg`Detective`,
      defaultStats: [{ name: msg`HP`, value: 100, range: [0, 100] }],
      defaultInventory: [{ name: msg`Notebook` }, { name: msg`Revolver` }],
    },
    {
      id: "journalist",
      name: msg`Journalist`,
      defaultStats: [{ name: msg`HP`, value: 100, range: [0, 100] }],
      defaultInventory: [{ name: msg`Camera` }, { name: msg`Recorder` }],
    },
    {
      id: "psychic",
      name: msg`Psychic`,
      defaultStats: [{ name: msg`HP`, value: 100, range: [0, 100] }],
      defaultInventory: [
        { name: msg`Tarot Cards` },
        {
          name: msg`Incense`,
          description: msg`A small bundle of incense sticks`,
        },
      ],
    },
  ],
  zombies: [
    {
      id: "survivor",
      name: msg`Survivor`,
      defaultStats: [
        { name: msg`HP`, value: 100, range: [0, 100] },
        {
          name: msg`Stamina`,
          value: 85,
          range: [0, 100],
          description: msg`Current energy`,
        },
        {
          name: msg`Stress`,
          value: 0,
          range: [0, 100],
          description: msg`Mental strain`,
        },
      ],
      defaultInventory: [
        { name: msg`Crowbar` },
        { name: msg`Canned Food` },
        { name: msg`First Aid Kit` },
      ],
    },
    {
      id: "medic",
      name: msg`Medic`,
      defaultStats: [
        { name: msg`HP`, value: 100, range: [0, 100] },
        {
          name: msg`Stress`,
          value: 0,
          range: [0, 100],
          description: msg`Mental strain`,
        },
      ],
      defaultInventory: [{ name: msg`Medkit` }, { name: msg`Painkillers` }],
    },
    {
      id: "soldier",
      name: msg`Soldier`,
      defaultStats: [
        { name: msg`HP`, value: 100, range: [0, 100] },
        {
          name: msg`Stamina`,
          value: 90,
          range: [0, 100],
          description: msg`Current energy`,
        },
      ],
      defaultInventory: [{ name: msg`Pistol` }, { name: msg`Combat Knife` }],
    },
  ],
  scifi: [
    {
      id: "pilot",
      name: msg`Pilot`,
      defaultStats: [{ name: msg`HP`, value: 100, range: [0, 100] }],
      defaultInventory: [
        { name: msg`Phaser`, description: msg`Energy sidearm` },
      ],
    },
    {
      id: "scientist",
      name: msg`Scientist`,
      defaultStats: [{ name: msg`HP`, value: 100, range: [0, 100] }],
      defaultInventory: [
        { name: msg`Tricorder`, description: msg`Handheld scanner` },
      ],
    },
    {
      id: "marine",
      name: msg`Space Marine`,
      defaultStats: [{ name: msg`HP`, value: 100, range: [0, 100] }],
      defaultInventory: [
        { name: msg`Pulse Rifle` },
        {
          name: msg`Power Armor`,
          description: msg`Exosuit with enhanced protection`,
        },
      ],
    },
  ],
  horror: [
    {
      id: "investigator",
      name: msg`Investigator`,
      defaultStats: [{ name: msg`HP`, value: 100, range: [0, 100] }],
      defaultInventory: [
        { name: msg`Flashlight` },
        { name: msg`Old Diary` },
        { name: msg`Pocket Knife` },
      ],
    },
    {
      id: "occultist",
      name: msg`Occultist`,
      defaultStats: [
        { name: msg`HP`, value: 100, range: [0, 100] },
        {
          name: msg`Sanity`,
          value: 80,
          range: [0, 100],
          description: msg`Mental stability`,
        },
      ],
      defaultInventory: [
        {
          name: msg`Ancient Tome`,
          description: msg`Contains forbidden knowledge`,
        },
        { name: msg`Candles` },
        { name: msg`Amulet`, description: msg`Protective charm` },
      ],
    },
    {
      id: "skeptic",
      name: msg`Skeptic`,
      defaultStats: [
        { name: msg`HP`, value: 100, range: [0, 100] },
        {
          name: msg`Sanity`,
          value: 100,
          range: [0, 100],
          description: msg`Mental stability`,
        },
      ],
      defaultInventory: [{ name: msg`Camera` }, { name: msg`Research Notes` }],
    },
  ],
  custom: [
    {
      id: "custom-archetype",
      name: msg`Custom`,
      defaultStats: [{ name: msg`HP`, value: 100, range: [0, 100] }],
      defaultInventory: [],
    },
  ],
};

export const TONES: Tone[] = [
  {
    id: "serious",
    name: msg`Serious`,
  },
  {
    id: "lighthearted",
    name: msg`Light-Hearted`,
  },
  {
    id: "comedic",
    name: msg`Comedic`,
  },
  {
    id: "none",
    name: msg`Nothing Specific`,
  },
];

export function generateAuthorNote(setting: string, tone: string): string {
  const toneDirections: Record<string, string> = {
    serious: t`Write with weight and consequence. Actions have repercussions. Death is real. Stakes matter.`,
    lighthearted: t`Keep the mood warm and hopeful even in danger. Humor can surface naturally but do not force jokes.`,
    comedic: t`Lean into absurdity, quick banter, and sharp timing. Play with expectations in a playful way.`,
    none: "",
  };

  const settingDirections: Record<string, string> = {
    fantasy: t`Draw from classic sword and sorcery. Magic should feel wondrous or dangerous, never mundane.`,
    mystery: t`Build tension through atmosphere and unanswered questions. Focus on human motives, lies, and conflicting accounts. Plant clues naturally. Every character could be hiding something.`,
    zombies: t`Emphasize survival horror. Resources are scarce. Trust is fragile. The world has ended and what remains is desperate, gritty, and human. Quiet moments matter as much as the horror.`,
    scifi: t`Ground the fantastic in plausible detail. Explore the human condition against the vastness of space or the weight of technological change.`,
    horror: t`Favor dread over shock. Build unease through atmosphere, wrongness, and the unknown or unknowable. Let the imagination do most of the work. Not everything needs to be explained.`,
    custom: "",
  };

  const toneText = toneDirections[tone] || "";
  const settingText =
    settingDirections[setting] ||
    (setting ? `Lean into the distinct atmosphere of ${setting}.` : "");

  const parts = [
    t`Address the player directly in second person. Write in present tense. Show, do not simply tell. Use concrete sensory details over abstract descriptions. Vary sentence rhythm. Short, sharp lines for tension. Longer, flowing passages for atmosphere. Avoid acting on behalf of the player.`,
    t`Keep paragraphs short, between one and four sentences. Avoid long uninterrupted speeches and do not jump the story forward too quickly between beats.`,
  ];

  if (toneText) parts.push(toneText);
  if (settingText) parts.push(settingText);

  return parts.join("\n\n");
}

export function generateTaleName(
  characterName: string,
  setting: string,
  _: (descriptor: MessageDescriptor) => string,
): string {
  const settingObj = SETTINGS.find((s) => s.id === setting);
  const settingName = settingObj ? _(settingObj.name) : setting;
  return t`${characterName}'s ${settingName} Adventure`;
}

export function generateDescription(
  characterName: string,
  archetype: string,
  setting: string,
  _tone: string,
  _: (descriptor: MessageDescriptor) => string,
): string {
  const settingObj = SETTINGS.find((s) => s.id === setting);
  const baseSetting = settingObj ? setting : "custom";

  const archetypeObj = ARCHETYPES[baseSetting]?.find((a) => a.id === archetype);
  const archetypeName = archetypeObj
    ? _(archetypeObj.name)
    : archetype || "character";

  const worldDescriptions: Record<string, string> = {
    fantasy: t`a world where ancient magic stirs in forgotten places, kingdoms rise and fall by the sword, and prophecies shape the fate of mortals. Ancient beasts slumber in mountain keeps. Old gods whisper through sacred groves. The line between legend and reality blurs.`,
    mystery: t`a world of shadows and secrets, where people mislead, conceal, and rationalize. Every locked door hides a motive. Every alibi has cracks. The truth waits beneath layers of story, excuse, and distraction, and those who dig too deep may not like what they find.`,
    zombies: t`a world that ended three months ago. The virus claimed the cities first, too many people in too little space. Now the living dead move through the streets while the remaining few scavenge, survive, and wonder if humanity has any future at all.`,
    scifi: t`a world of advanced technology where humanity has scattered across the stars. The frontier is vast, dangerous, and full of discovery.`,
    horror: t`a world where something is deeply wrong. It began as a feeling of being watched, dreams that feel too real, thoughts that do not fully feel like your own. Rational explanations are running out. What waits at the edge of perception is patient, and it is getting closer.`,
    custom: t`a setting defined by the theme you provided, grounded in the tone and situations common to that type of story.`,
  };

  const archetypeHooks: Record<string, Record<string, string>> = {
    fantasy: {
      warrior: t`trained in the art of war, carrying scars that tell stories and a blade that has tasted blood`,
      mage: t`touched by powers most fear to name, walking the knife's edge between knowledge and destruction`,
      rogue: t`surviving on wit, guile, and the understanding that rules are for people who cannot bend them`,
      ranger: t`more at home in wild places than among crowded streets`,
    },
    mystery: {
      detective: t`driven by an obsession with truth that has cost you sleep, relationships, and maybe your peace of mind`,
      journalist: t`chasing the story others avoid, knowing that the best headlines come with the biggest risks`,
      psychic: t`cursed, or gifted, with glimpses beyond the veil, never certain if what you see is truth or madness`,
    },
    zombies: {
      survivor: t`having made it this far on instinct and luck, knowing both can run out`,
      medic: t`keeping others alive in a world that wants everyone dead, rationing hope along with the antibiotics`,
      soldier: t`trained for wars that seem small now, applying military discipline to an enemy that does not negotiate`,
    },
    scifi: {
      pilot: t`most comfortable at the helm of a ship, trusting your vessel and reflexes more than most people`,
      scientist: t`assigned to the edge of known space, more interested in unknown phenomena than in safety protocols`,
      marine: t`serving as the sharp end of whatever corporate or colonial interest sends you into harm's way`,
    },
    horror: {
      investigator: t`unable to let mysteries rest, even the ones that might be safer left buried`,
      occultist: t`having peered behind the curtain and seen what waits there, knowing too much to ever feel safe again`,
      skeptic: t`clinging to rationality like a life raft, even as the evidence mounts that the world does not quite match the rules you know`,
    },
    custom: {
      "custom-archetype": t`forging your own path`,
    },
  };

  const worldDesc =
    baseSetting === "custom" && setting
      ? `a world shaped by the themes and atmosphere of ${setting}`
      : worldDescriptions[baseSetting] || worldDescriptions.custom;

  const archetypeHook =
    archetypeHooks[baseSetting]?.[archetype] ||
    archetypeHooks.custom["custom-archetype"];

  return t`You are ${characterName}, a ${archetypeName.toLowerCase()} ${archetypeHook}. You exist in ${worldDesc}.`;
}

export function getRandomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

export function generateOpeningPrompt(
  characterName: string,
  archetype: string,
  setting: string,
  tone?: string,
): string {
  const settingOpeners: Record<string, string[]> = {
    fantasy: [
      t`Begin in medias res, ${characterName} is already in trouble. Something has gone wrong: a deal turned sour, a spell misfired, an old enemy resurfaced. Ground the opening in immediate tension and sensory detail. What does ${characterName} see, hear, feel? What decision must they make right now?`,
      t`Open on ${characterName} arriving somewhere significant, a city they have heard stories about, ruins that should not exist, or a place from their past they swore never to return to. The location should feel alive with history and danger. Something is already not quite right.`,
      t`${characterName} wakes to find something has changed overnight, a symbol burned into their door, a letter from someone long dead, a new scar they do not remember getting. Start with this mystery and the immediate question: what happens now?`,
    ],
    mystery: [
      t`Open on the crime scene, or what is left of it. ${characterName} is late to the party. The police tape is already up, the obvious clues already catalogued. But there is something everyone else missed. What small wrongness catches ${characterName}'s eye?`,
      t`Begin with ${characterName} getting a call, a letter, or a visitor they did not expect. Someone needs help with something they refuse to explain over the phone. The address is in a part of town where ${characterName} does not usually do business.`,
      t`${characterName} is following up on something that should be routine, a background check, a missing pet, paperwork for an insurance claim. The first person they talk to is nervous. Too nervous. Then they stop talking at all.`,
    ],
    zombies: [
      t`Open on silence. The wrong kind of silence. ${characterName} has not heard another human voice in three days. Start in the aftermath of a close call, adrenaline fading, hands still shaking, inventory one item shorter than it should be. The immediate question: where is safe to sleep tonight?`,
      t`${characterName} has found signs of other survivors, a campfire still warm, a message painted on a wall, tire tracks in the mud. Following these signs will be a risk. Ignoring them might be worse.`,
      t`Begin in the middle of a supply run gone sideways. ${characterName} is somewhere they should not be, with less time than they thought they had. The exits are limited. The noise they just made was loud.`,
    ],
    scifi: [
      t`Open with a system failure, something critical that should not be able to fail. ${characterName} is the first one to realize something is wrong, or the last one standing who can do something about it. The clock is already ticking.`,
      t`${characterName}'s ship, station, or habitat picks up a signal that should not exist. It is old, far older than it should be, or it is coming from somewhere that should be empty. Someone has to investigate.`,
      t`Begin at a threshold: ${characterName} is about to cross a border, make a deal, or open a door that cannot easily be closed again. Something has brought them to this moment. Something is waiting on the other side.`,
    ],
    horror: [
      t`Open with the first wrong thing, small and dismissible, the kind of detail a rational person explains away. A door that was closed. A photograph with someone extra in the frame. A sound that does not repeat when listened for. ${characterName} almost manages to forget it. Almost.`,
      t`${characterName} has returned to somewhere they have history with, an old family home, a town they left, a place from a memory they would rather not examine. Something drew them back. Something has been waiting.`,
      t`Begin with ${characterName} waking from a dream they cannot quite remember, with the heavy sense that something followed them back. The day starts normally enough. It does not stay that way.`,
    ],
    custom: [
      t`Begin with ${characterName} at a crossroads, literal or figurative. A decision must be made and there is no clear right or wrong option. Ground the opening in sensory detail and immediate stakes.`,
      t`Drop into the middle of a conversation already in progress. ${characterName} is trying to get something and the other party suddenly raises the stakes with a condition or threat. Let the surroundings say as much about the world as the dialogue does.`,
    ],
  };

  const openers = settingOpeners[setting] || settingOpeners.custom;
  const selectedOpener = getRandomElement(openers);

  const archetypeAdditions: Record<string, Record<string, string>> = {
    fantasy: {
      mage: t` The arcane leaves traces. Let ${characterName} sense something others would overlook.`,
      rogue: t` ${characterName}'s instincts are focused on what can be gained and what it will cost.`,
    },
    horror: {
      skeptic: t` ${characterName} has a rational explanation ready. It is not fitting the facts as neatly as it should.`,
      occultist: t` ${characterName} recognizes something in this situation, something from their studies that they hoped would stay theoretical.`,
    },
  };

  let addition = archetypeAdditions[setting]?.[archetype] || "";
  if (addition) {
    addition = addition.replace(/\$\{characterName\}/g, characterName);
  }

  const toneModifiers: Record<string, string> = {
    serious: t`Keep the opening tight and grounded. Limit humor. Let tension build in clear, steady steps.`,
    lighthearted: t`Allow small moments of warmth or levity to color the scene, even if danger is present.`,
    comedic: t`Invite playful exaggeration, awkward situations, and clever asides, but keep the scene moving.`,
    none: "",
  };

  const toneText = tone ? toneModifiers[tone] || "" : "";

  return selectedOpener + addition + (toneText ? " " + toneText : "");
}
