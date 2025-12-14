import { ApiPreset, ApiProfileSettings } from "@/types";
import { msg } from "@lingui/core/macro";
import { MessageDescriptor } from "@lingui/core";

export interface ApiPresetHelp {
  description: MessageDescriptor;
  signupUrl?: string;
  apiKeyUrl?: string;
  steps: MessageDescriptor[];
}

export interface ApiPresetConfig {
  id: ApiPreset;
  label: MessageDescriptor;
  baseUrl: string;
  /** Whether the base URL can be edited by the user */
  editableUrl: boolean;
  help?: ApiPresetHelp;
}

export const apiPresets: ApiPresetConfig[] = [
  {
    id: ApiPreset.OPENROUTER,
    label: msg`OpenRouter`,
    baseUrl: "https://openrouter.ai/api/v1",
    editableUrl: false,
    help: {
      description: msg`Multi-provider AI gateway with access to hundreds of models from major and minor providers. Pay-as-you-go pricing. Generous free tier after charging once.`,
      signupUrl: "https://openrouter.ai/auth",
      apiKeyUrl: "https://openrouter.ai/settings/keys",
      steps: [
        msg`Sign up for an account at OpenRouter`,
        msg`Add credits to your account (To access non-free models)`,
        msg`Go to Settings → Keys`,
        msg`Create a new API key and paste it here`,
      ],
    },
  },
  {
    id: ApiPreset.NANOGPT,
    label: msg`NanoGPT`,
    baseUrl: "https://nano-gpt.com/api/v1",
    editableUrl: false,
    help: {
      description: msg`Privacy-focused provider with multiple models on offer. Account optional. Offers subscription plan with unlimited usage on some models.`,
      signupUrl: "https://nano-gpt.com/",
      apiKeyUrl: "https://nano-gpt.com/api",
      steps: [
        msg`Visit NanoGPT (Account optional)`,
        msg`Add funds or subscribe to a plan`,
        msg`Go to the API section in the dashboard`,
        msg`Copy your API key and paste it here`,
      ],
    },
  },
  {
    id: ApiPreset.VENICE,
    label: msg`Venice AI`,
    baseUrl: "https://api.venice.ai/api/v1",
    editableUrl: false,
    help: {
      description: msg`Pay-as-you-go Privacy-focused provider with multiple models on offer.`,
      signupUrl: "https://venice.ai/sign-up",
      apiKeyUrl: "https://venice.ai/settings/api",
      steps: [
        msg`Sign up for an account at Venice AI`,
        msg`Add API funds`,
        msg`Go to the API section in the dashboard`,
        msg`Generate an API key and paste it here`,
      ],
    },
  },
  {
    id: ApiPreset.OPENAI,
    label: msg`OpenAI`,
    baseUrl: "https://api.openai.com/v1",
    editableUrl: false,
    help: {
      description: msg`The Official OpenAI API. Requires an OpenAI account with charged credits.`,
      signupUrl: "https://platform.openai.com/signup",
      apiKeyUrl: "https://platform.openai.com/api-keys",
      steps: [
        msg`Create an OpenAI account`,
        msg`Add API funds`,
        msg`Go to API Keys in the dashboard`,
        msg`Create a new secret key and paste it here`,
      ],
    },
  },
  {
    id: ApiPreset.GENERIC,
    label: msg`Generic OpenAI`,
    baseUrl: "",
    editableUrl: true,
    help: {
      description: msg`Connect to any other OpenAI-compatible API. Enter the base URL and API key for your provider.`,
      steps: [
        msg`Get the base URL from your API provider (usually ends with /v1)`,
        msg`Enter the base URL in the URL field`,
        msg`Enter your API key (If required)`,
      ],
    },
  },
  {
    id: ApiPreset.LOCAL,
    label: msg`Local`,
    baseUrl: "",
    editableUrl: true,
    help: {
      description: msg`This preset includes auto-detection of local servers (They must expose an OpenAI-compatible endpoint). LM Studio, Ollama, LocalAI, etc.`,
      steps: [
        msg`Install a tool that exposes a local inference server`,
        msg`Download a model`,
        msg`If the tool requires auth, look up how to generate a key (Ollama requires this)`,
        msg`Start the server (Different tools have different ways to start the server, look up your tool's documentation)`,
        msg`Use the Rescan button to detect your server (This will only work if the server is running and accessible)`,
      ],
    },
  },
];

/** Map of preset ID to config for quick lookup */
export const apiPresetMap = Object.fromEntries(
  apiPresets.map((p) => [p.id, p]),
) as Record<ApiPreset, ApiPresetConfig>;

export function createDefaultProfiles(): Record<ApiPreset, ApiProfileSettings> {
  return Object.fromEntries(
    apiPresets.map((preset) => [
      preset.id,
      {
        baseUrl: preset.baseUrl,
        apiKey: "",
        model: undefined,
      },
    ]),
  ) as Record<ApiPreset, ApiProfileSettings>;
}
