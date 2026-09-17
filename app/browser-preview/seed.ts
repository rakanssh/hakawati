import { upsertScenario } from "@/repositories/scenario.repository";
import { createTale } from "@/repositories/tale.repository";
import { scenarioContentToEditorFields } from "@/lib/scenario-content";
import {
  GameMode,
  PromptComponentType,
  StorybookCategory,
  type Scenario,
} from "@/types/context.type";
import { LogEntryMode, LogEntryRole } from "@/types/log.type";

const samples = [
  {
    name: "The Lantern Market",
    gameMode: GameMode.GM,
    description:
      "A night market appears in the old city only when the moon disappears. Tonight, someone is selling a memory that belongs to you.",
    opening:
      'The last call to prayer fades behind the rooftops as you step beneath an arch of blue glass lanterns. Stalls crowd the narrow street, offering bottled rain, maps of forgotten rooms, and keys without locks.\n\nAn elderly bookseller raises her eyes. **"You are late,"** she says. **"Someone has already asked for your story."**',
    action: "Ask the bookseller who came looking for me.",
    reply:
      'She closes the book with one careful finger between its pages. "A woman with a silver umbrella. She paid with tomorrow\'s rain."\n\nBehind her, a brass door stands slightly open. From the other side comes the sound of a familiar lullaby.',
  },
  {
    name: "Signal from the Quiet Sea",
    gameMode: GameMode.STORY_TELLER,
    description:
      "Alone aboard an ocean research station, you receive a transmission from a vessel that vanished thirty years ago.",
    opening:
      'At 03:17, the radio wakes you. Static gives way to three measured knocks, then a voice: **"Station Nine, we can see your lights. Please don\'t turn them off."**\n\nBeyond the glass, the sea is perfectly still. Your radar shows nothing.',
    action: "Answer the transmission and ask for the ship's name.",
    reply:
      '"The *Meridian*," the voice replies. You know the name from the memorial plaque downstairs.\n\nThe desk lamp dims. On the horizon, a single yellow light appears, then another. A ship is taking shape where there was only darkness.',
  },
  {
    name: "A Small Spell for Sunday",
    gameMode: GameMode.STORY_TELLER,
    description:
      "You inherit a neighborhood tea shop where every blend grants a tiny, inconvenient wish. A cozy story about finding your place.",
    opening:
      "The shop smells of cardamom and rain. On the counter sits a note in your aunt's handwriting: **Never serve the blue tin after sunset. Be kind to the cat. It used to be the landlord.**\n\nThe bell above the door rings. Your first customer has brought an empty cup and a very unusual request.",
    action: "Welcome the customer and put the kettle on.",
    reply:
      '"I\'d like to remember a song," he says, turning the cup in his hands. "Just long enough to sing it to someone." The cat opens one eye. On the shelf behind you, a green tin begins to hum.',
  },
];

export async function seedPreview() {
  let lastTaleId: string | null = null;
  for (const [index, sample] of samples.entries()) {
    const id = `00000000-0000-4000-8000-00000000000${index + 1}`;
    const scenario: Scenario = {
      id,
      name: sample.name,
      initialGameMode: sample.gameMode,
      description: sample.description,
      content: [
        {
          type: "prompt_component",
          version: 1,
          id: `${id}-plot`,
          promptType: PromptComponentType.PLOT,
          content: sample.description,
        },
        {
          type: "prompt_component",
          version: 1,
          id: `${id}-opening`,
          promptType: PromptComponentType.OPENING,
          content: sample.opening,
        },
        {
          type: "prompt_component",
          version: 1,
          id: `${id}-note`,
          promptType: PromptComponentType.AUTHOR_NOTE,
          content:
            "Use vivid sensory detail. Give the player room to choose. Keep the tone curious and grounded.",
        },
        {
          type: "story_card",
          version: 1,
          id: `${id}-card`,
          title: "The stranger",
          triggers: ["stranger", "visitor"],
          content:
            "A visitor who knows more about the protagonist than they admit. Helpful, but reluctant to explain why.",
          category: StorybookCategory.CHARACTER,
          isPinned: false,
        },
        ...(sample.gameMode === GameMode.GM
          ? [
              {
                type: "stat" as const,
                version: 1 as const,
                id: `${id}-health`,
                name: "Health",
                value: 85,
                range: [0, 100] as [number, number],
              },
              {
                type: "stat" as const,
                version: 1 as const,
                id: `${id}-courage`,
                name: "Courage",
                value: 6,
                range: [0, 10] as [number, number],
              },
              {
                type: "inventory_item" as const,
                version: 1 as const,
                id: `${id}-key`,
                name: "Brass key",
                description:
                  "Warm to the touch, with a crescent carved into its bow.",
              },
            ]
          : []),
      ],
    };
    await upsertScenario(scenario, id);
    if (index === 2) continue;
    const fields = scenarioContentToEditorFields(scenario.content, Date.now());
    lastTaleId = await createTale({
      scenarioId: id,
      name: sample.name,
      description: sample.description,
      components: fields.components,
      storyCards: fields.initialStoryCards,
      stats: fields.initialStats,
      inventory: scenario.content.flatMap((item) =>
        item.type === "inventory_item"
          ? [{ id: item.id, name: item.name, description: item.description }]
          : [],
      ),
      gameMode: sample.gameMode,
      undoStack: [],
      log: [
        {
          id: crypto.randomUUID(),
          role: LogEntryRole.GM,
          text: sample.opening,
        },
        {
          id: crypto.randomUUID(),
          role: LogEntryRole.PLAYER,
          mode: LogEntryMode.DO,
          text: sample.action,
        },
        { id: crypto.randomUUID(), role: LogEntryRole.GM, text: sample.reply },
      ],
    });
  }
  return lastTaleId;
}
