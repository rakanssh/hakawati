import { msg } from "@lingui/core/macro";
import { MessageDescriptor } from "@lingui/core";

export type Setting = {
  id: string;
  name: MessageDescriptor;
  icon: string;
};

export type Archetype = {
  id: string;
  name: MessageDescriptor;
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
    { id: "warrior", name: msg`Warrior` },
    { id: "mage", name: msg`Mage` },
    { id: "rogue", name: msg`Rogue` },
    { id: "ranger", name: msg`Ranger` },
  ],
  mystery: [
    { id: "detective", name: msg`Detective` },
    { id: "journalist", name: msg`Journalist` },
    { id: "psychic", name: msg`Psychic` },
  ],
  zombies: [
    { id: "survivor", name: msg`Survivor` },
    { id: "medic", name: msg`Medic` },
    { id: "soldier", name: msg`Soldier` },
  ],
  scifi: [
    { id: "pilot", name: msg`Pilot` },
    { id: "scientist", name: msg`Scientist` },
    { id: "marine", name: msg`Space Marine` },
  ],
  horror: [
    { id: "investigator", name: msg`Investigator` },
    { id: "occultist", name: msg`Occultist` },
    { id: "skeptic", name: msg`Skeptic` },
  ],
  custom: [{ id: "custom-archetype", name: msg`Custom` }],
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
  {
    id: "custom-tone",
    name: msg`Custom`,
  },
];

export function getRandomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}
