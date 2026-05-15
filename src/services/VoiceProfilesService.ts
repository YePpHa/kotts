import { z } from "zod";

import { storageGet, storageSet } from "./ExtensionStorage";
import type { BackendType } from "./tts/backends";

export type TTSBackendType = BackendType;

export type TTSProvider = {
  id: string;
  name: string;
  type: TTSBackendType;
  apiURL: string;
  authorization?: string;
};

export type SavedVoice = {
  id: string;
  providerId: string;
  name: string;
  model: string;
  voice: string;
};

export type VoiceProfile = SavedVoice & {
  type: TTSBackendType;
  apiURL: string;
  authorization?: string;
};

export type VoiceSettings = {
  version: 2;
  providers: TTSProvider[];
  voices: SavedVoice[];
  activeVoiceId: string | null;
};

const TTSProviderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.union([z.literal("kokoro"), z.literal("openai")]),
  apiURL: z.string().min(1),
  authorization: z.string().optional(),
});

const SavedVoiceSchema = z.object({
  id: z.string().min(1),
  providerId: z.string().min(1),
  name: z.string().min(1),
  model: z.string().min(1),
  voice: z.string(),
});

const VoiceSettingsSchema = z.object({
  version: z.literal(2),
  providers: z.array(TTSProviderSchema),
  voices: z.array(SavedVoiceSchema),
  activeVoiceId: z.string().nullable(),
});

const v1ProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.union([z.literal("kokoro"), z.literal("openai")]),
  apiURL: z.string().min(1),
  model: z.string().min(1),
  voice: z.string(),
  voiceAudio: z.string().optional(),
});

const v1SettingsSchema = z.object({
  version: z.literal(1),
  profiles: z.array(v1ProfileSchema),
  activeProfileId: z.string().nullable(),
});

const STORAGE_KEY = "kokotts.voiceProfiles.v1";

function getId(): string {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now()) + "-" + Math.random().toString(16).slice(2);
}

export class VoiceProfilesService {
  public static defaultSettings(): VoiceSettings {
    const defaultKokoroProvider: TTSProvider = {
      id: getId(),
      name: "Kokoro (local)",
      type: "kokoro",
      apiURL: "http://127.0.0.1:8880",
    };

    const defaultOpenAIProvider: TTSProvider = {
      id: getId(),
      name: "OpenAI (local)",
      type: "openai",
      apiURL: "http://127.0.0.1:8000",
    };

    const kokoroVoice: SavedVoice = {
      id: getId(),
      providerId: defaultKokoroProvider.id,
      name: "Kokoro (local)",
      model: "kokoro",
      voice: "af_heart",
    };

    const openaiVoice: SavedVoice = {
      id: getId(),
      providerId: defaultOpenAIProvider.id,
      name: "OpenAI (local)",
      model: "openai",
      voice: "alloy",
    };

    return {
      version: 2,
      providers: [defaultKokoroProvider, defaultOpenAIProvider],
      voices: [kokoroVoice, openaiVoice],
      activeVoiceId: kokoroVoice.id,
    };
  }

  private static migrateV1ToV2(v1: z.infer<typeof v1SettingsSchema>): VoiceSettings {
    const providerMap = new Map<string, TTSProvider>();

    for (const profile of v1.profiles) {
      const key = `${profile.type}|${profile.apiURL.trim().replace(/\/+$/, "")}`;
      if (!providerMap.has(key)) {
        providerMap.set(key, {
          id: getId(),
          name: `${profile.type.toUpperCase()} @ ${profile.apiURL}`,
          type: profile.type,
          apiURL: profile.apiURL.trim().replace(/\/+$/, ""),
        });
      }
    }

    const voices: SavedVoice[] = v1.profiles.map((profile) => {
      const key = `${profile.type}|${profile.apiURL.trim().replace(/\/+$/, "")}`;
      const provider = providerMap.get(key)!;
      return {
        id: profile.id,
        providerId: provider.id,
        name: profile.name,
        model: profile.model,
        voice: profile.voice,
      };
    });

    const activeVoiceId =
      v1.activeProfileId && voices.some((v) => v.id === v1.activeProfileId)
        ? v1.activeProfileId
        : (voices[0]?.id ?? null);

    return {
      version: 2,
      providers: [...providerMap.values()],
      voices,
      activeVoiceId,
    };
  }

  public static async load(): Promise<VoiceSettings> {
    const defaults = VoiceProfilesService.defaultSettings();
    const stored = await storageGet<unknown>(STORAGE_KEY, defaults);

    const v2parsed = VoiceSettingsSchema.safeParse(stored);
    if (v2parsed.success) {
      const settings = v2parsed.data;
      const activeExists =
        settings.activeVoiceId === null ||
        settings.voices.some((v) => v.id === settings.activeVoiceId);
      if (!activeExists) {
        settings.activeVoiceId = settings.voices[0]?.id ?? null;
        await VoiceProfilesService.save(settings);
      }
      return settings;
    }

    const v1parsed = v1SettingsSchema.safeParse(stored);
    if (v1parsed.success) {
      const migrated = VoiceProfilesService.migrateV1ToV2(v1parsed.data);
      await VoiceProfilesService.save(migrated);
      return migrated;
    }

    await VoiceProfilesService.save(defaults);
    return defaults;
  }

  public static async save(settings: VoiceSettings): Promise<void> {
    await storageSet(STORAGE_KEY, settings);
  }

  public static getActiveProfile(settings: VoiceSettings): VoiceProfile | null {
    if (settings.activeVoiceId === null) {
      return null;
    }
    const voice = settings.voices.find((v) => v.id === settings.activeVoiceId);
    if (!voice) {
      return null;
    }
    const provider = settings.providers.find((p) => p.id === voice.providerId);
    if (!provider) {
      return null;
    }
    return {
      ...voice,
      type: provider.type,
      apiURL: provider.apiURL,
      authorization: provider.authorization,
    };
  }

  public static setActiveVoice(voiceId: string, settings: VoiceSettings): VoiceSettings {
    if (!settings.voices.some((v) => v.id === voiceId)) {
      return settings;
    }
    return { ...settings, activeVoiceId: voiceId };
  }

  public static removeVoice(voiceId: string, settings: VoiceSettings): VoiceSettings {
    const nextVoices = settings.voices.filter((v) => v.id !== voiceId);
    const nextActive =
      settings.activeVoiceId === voiceId ? (nextVoices[0]?.id ?? null) : settings.activeVoiceId;

    return {
      ...settings,
      voices: nextVoices,
      activeVoiceId: nextActive,
    };
  }

  public static upsertVoice(
    voice: Omit<SavedVoice, "id"> & { id?: string },
    settings: VoiceSettings,
  ): { settings: VoiceSettings; voice: SavedVoice } {
    const normalized: SavedVoice = {
      id: voice.id ?? getId(),
      name: voice.name.trim(),
      providerId: voice.providerId,
      model: voice.model.trim(),
      voice: voice.voice.trim(),
    };

    const idx = settings.voices.findIndex((v) => v.id === normalized.id);
    const nextVoices =
      idx === -1
        ? [...settings.voices, normalized]
        : settings.voices.map((v, i) => (i === idx ? normalized : v));

    return { settings: { ...settings, voices: nextVoices }, voice: normalized };
  }

  public static upsertProvider(
    provider: Omit<TTSProvider, "id"> & { id?: string },
    settings: VoiceSettings,
  ): { settings: VoiceSettings; provider: TTSProvider } {
    const normalized: TTSProvider = {
      id: provider.id ?? getId(),
      name: provider.name.trim(),
      type: provider.type,
      apiURL: provider.apiURL.trim().replace(/\/+$/, ""),
      ...(provider.authorization !== undefined ? { authorization: provider.authorization } : {}),
    };

    const idx = settings.providers.findIndex((p) => p.id === normalized.id);
    const nextProviders =
      idx === -1
        ? [...settings.providers, normalized]
        : settings.providers.map((p, i) => (i === idx ? normalized : p));

    return { settings: { ...settings, providers: nextProviders }, provider: normalized };
  }

  public static removeProvider(providerId: string, settings: VoiceSettings): VoiceSettings {
    const nextProviders = settings.providers.filter((p) => p.id !== providerId);
    const nextVoices = settings.voices.filter((v) => v.providerId !== providerId);
    const nextActive = nextVoices.some((v) => v.id === settings.activeVoiceId)
      ? settings.activeVoiceId
      : (nextVoices[0]?.id ?? null);

    return {
      ...settings,
      providers: nextProviders,
      voices: nextVoices,
      activeVoiceId: nextActive,
    };
  }
}
