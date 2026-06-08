import { msg } from "@lingui/core/macro";
import { MessageDescriptor } from "@lingui/core";

export type QuickstartOption = {
  id: string;
  name: MessageDescriptor;
};

export const QUICKSTART_WORLD_OPTIONS: QuickstartOption[] = [
  {
    id: "fantasy",
    name: msg`Fantasy`,
  },
  {
    id: "mystery",
    name: msg`Mystery`,
  },
  {
    id: "zombies",
    name: msg`Zombies`,
  },
  {
    id: "scifi",
    name: msg`Sci-Fi`,
  },
  {
    id: "horror",
    name: msg`Horror`,
  },
];

export const QUICKSTART_ARCHETYPE_OPTIONS: Record<string, QuickstartOption[]> =
  {
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
  };

export const QUICKSTART_TONE_OPTIONS: QuickstartOption[] = [
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
];
