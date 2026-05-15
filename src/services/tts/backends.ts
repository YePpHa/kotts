import type { ITTSApiService } from "../../types/ITTSApiService";
import type { VoiceProfile } from "../VoiceProfilesService";
import { KokoroTTSApiService } from "./KokoroTTSApiService";
import type { BackendInfo } from "./OpenAITTSApiService";
import { OpenAITTSApiService } from "./OpenAITTSApiService";

export type BackendType = "kokoro" | "openai";

export type BackendDef = {
  type: BackendType;
  label: string;
  createService: (profile: VoiceProfile) => ITTSApiService;
  /** Whether the backend supports server-side voice management (list/create/delete/clone). */
  hasVoiceManagement: boolean;
  /** Discover voices from this backend. Returns an array of voice IDs. */
  discoverVoices: (
    apiURL: string,
    opts?: { signal?: AbortSignal; authorization?: string },
  ) => Promise<string[]>;
  /** Discover available models from this backend. */
  discoverModels: (
    apiURL: string,
    opts?: { signal?: AbortSignal; authorization?: string },
  ) => Promise<{ models: string[]; defaultModel: string | null }>;
  /** For voice-management backends: discover full backends info. */
  discoverBackends?: (
    apiURL: string,
    opts?: { signal?: AbortSignal; authorization?: string },
  ) => Promise<BackendInfo[]>;
};

export const BACKENDS: Record<BackendType, BackendDef> = {
  kokoro: {
    type: "kokoro",
    label: "Kokoro",
    createService: (profile) =>
      new KokoroTTSApiService({
        apiURL: profile.apiURL,
        model: profile.model,
        voice: profile.voice,
        authorization: profile.authorization,
      }),
    hasVoiceManagement: false,
    discoverVoices: (apiURL, opts) =>
      KokoroTTSApiService.getAvailableVoices(apiURL, {
        signal: opts?.signal,
        authorization: opts?.authorization,
      }),
    discoverModels: (apiURL, opts) =>
      KokoroTTSApiService.getAvailableModels(apiURL, {
        signal: opts?.signal,
        authorization: opts?.authorization,
      }),
  },
  openai: {
    type: "openai",
    label: "OpenAI API",
    createService: (profile) =>
      new OpenAITTSApiService({
        apiURL: profile.apiURL,
        model: profile.model,
        voice: profile.voice,
        authorization: profile.authorization,
      }),
    hasVoiceManagement: true,
    discoverVoices: (apiURL, opts) =>
      OpenAITTSApiService.getAvailableVoices(apiURL, {
        signal: opts?.signal,
        authorization: opts?.authorization,
      }).then((profiles) => profiles.map((p) => p.id)),
    discoverModels: (apiURL, opts) =>
      OpenAITTSApiService.getAvailableModels(apiURL, {
        signal: opts?.signal,
        authorization: opts?.authorization,
      }),
    discoverBackends: (apiURL, opts) =>
      OpenAITTSApiService.getBackends(apiURL, {
        signal: opts?.signal,
        authorization: opts?.authorization,
      }),
  },
};

export const BACKEND_TYPES = Object.keys(BACKENDS) as BackendType[];

export function createTTSApiService(profile: VoiceProfile): ITTSApiService {
  const backend = BACKENDS[profile.type];
  if (!backend) {
    throw new Error(`Unknown backend type: ${profile.type}`);
  }
  return backend.createService(profile);
}
