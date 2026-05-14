import { z } from "zod";

import { storageGet, storageSet } from "./ExtensionStorage";

export type TTSBackendType = "kokoro" | "openai";

export type VoiceProfile = {
  id: string;
  name: string;
  type: TTSBackendType;
  apiURL: string;
  model: string;
  voice: string;
  voiceAudio?: string;
};

export type VoiceProfilesSettings = {
  version: 1;
  profiles: VoiceProfile[];
  activeProfileId: string | null;
};

const VoiceProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.union([z.literal("kokoro"), z.literal("openai")]),
  apiURL: z.string().min(1),
  model: z.string().min(1),
  voice: z.string(),
  voiceAudio: z.string().optional(),
});

const VoiceProfilesSettingsSchema = z.object({
  version: z.literal(1),
  profiles: z.array(VoiceProfileSchema),
  activeProfileId: z.string().nullable(),
});

const STORAGE_KEY = "kokotts.voiceProfiles.v1";

function getId(): string {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now()) + "-" + Math.random().toString(16).slice(2);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter((v) => v.length > 0))];
}

export class VoiceProfilesService {
  public static defaultSettings(): VoiceProfilesSettings {
    const defaultKokoro: VoiceProfile = {
      id: getId(),
      name: "Kokoro (local)",
      type: "kokoro",
      apiURL: "http://127.0.0.1:8880",
      model: "kokoro",
      voice: "af_heart",
    };

    const defaultOpenAI: VoiceProfile = {
      id: getId(),
      name: "OpenAI (local)",
      type: "openai",
      apiURL: "http://127.0.0.1:8000",
      model: "openai",
      voice: "alloy",
    };

    return {
      version: 1,
      profiles: [defaultKokoro, defaultOpenAI],
      activeProfileId: defaultKokoro.id,
    };
  }

  public static async load(): Promise<VoiceProfilesSettings> {
    const defaults = VoiceProfilesService.defaultSettings();
    const stored = await storageGet<unknown>(STORAGE_KEY, defaults);
    const parsed = VoiceProfilesSettingsSchema.safeParse(stored);
    if (!parsed.success) {
      await VoiceProfilesService.save(defaults);
      return defaults;
    }

    // Ensure activeProfileId points to an existing profile (or null).
    const settings = parsed.data;
    const activeExists =
      settings.activeProfileId === null ||
      settings.profiles.some((p) => p.id === settings.activeProfileId);
    if (!activeExists) {
      settings.activeProfileId = settings.profiles[0]?.id ?? null;
      await VoiceProfilesService.save(settings);
    }

    return settings;
  }

  public static async save(settings: VoiceProfilesSettings): Promise<void> {
    await storageSet(STORAGE_KEY, settings);
  }

  public static getActiveProfile(settings: VoiceProfilesSettings): VoiceProfile | null {
    if (settings.activeProfileId === null) {
      return null;
    }
    return settings.profiles.find((p) => p.id === settings.activeProfileId) ?? null;
  }

  public static setActiveProfile(
    profileId: string,
    settings: VoiceProfilesSettings,
  ): VoiceProfilesSettings {
    if (!settings.profiles.some((p) => p.id === profileId)) {
      return settings;
    }
    const next: VoiceProfilesSettings = { ...settings, activeProfileId: profileId };
    return next;
  }

  public static removeProfile(
    profileId: string,
    settings: VoiceProfilesSettings,
  ): VoiceProfilesSettings {
    const nextProfiles = settings.profiles.filter((p) => p.id !== profileId);
    const nextActive =
      settings.activeProfileId === profileId
        ? (nextProfiles[0]?.id ?? null)
        : settings.activeProfileId;

    const next: VoiceProfilesSettings = {
      ...settings,
      profiles: nextProfiles,
      activeProfileId: nextActive,
    };
    return next;
  }

  public static upsertProfile(
    profile: Omit<VoiceProfile, "id"> & { id?: string },
    settings: VoiceProfilesSettings,
  ): { settings: VoiceProfilesSettings; profile: VoiceProfile } {
    const normalized: VoiceProfile = {
      id: profile.id ?? getId(),
      name: profile.name.trim(),
      type: profile.type,
      apiURL: profile.apiURL.trim().replace(/\/+$/, ""),
      model: profile.model.trim(),
      voice: profile.voice.trim(),
      ...(profile.voiceAudio !== undefined ? { voiceAudio: profile.voiceAudio } : {}),
    };

    const idx = settings.profiles.findIndex((p) => p.id === normalized.id);
    const nextProfiles =
      idx === -1
        ? [...settings.profiles, normalized]
        : settings.profiles.map((p, i) => (i === idx ? normalized : p));

    const next: VoiceProfilesSettings = { ...settings, profiles: nextProfiles };
    return { settings: next, profile: normalized };
  }

  public static getKnownHosts(type: TTSBackendType, settings: VoiceProfilesSettings): string[] {
    return uniqueStrings(settings.profiles.filter((p) => p.type === type).map((p) => p.apiURL));
  }
}
