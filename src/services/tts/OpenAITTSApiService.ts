import { z } from "zod";

import type {
  ITTSApiService,
  TTSOptions,
  TTSResponse,
  WordTimestamp,
} from "../../types/ITTSApiService";

export type OpenAITTSApiServiceOptions = {
  apiURL: string;
  model: string;
  voice: string;
  speed: number;
  langCode?: string;
  authorization?: string;
};

export type BackendCapabilities = {
  has_preset_voices: boolean;
  supports_voice_design: boolean;
  supports_voice_cloning: boolean;
  supports_streaming: boolean;
};

export type BackendInfo = {
  name: string;
  type: string;
  local: boolean;
  capabilities: BackendCapabilities;
  languages: string[] | null;
  preset_voices: string[] | null;
};

export type VoiceProfileData = {
  id: string;
  name: string;
  backend: string;
  voice_type: "preset" | "cloned" | "designed";
  voice_ref: string | null;
  ref_text: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

const AlignItemSchema = z.object({
  word: z.string(),
  text_start: z.number(),
  text_end: z.number(),
  audio_start: z.number(),
  audio_end: z.number(),
});

const VoiceProfileDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  backend: z.string(),
  voice_type: z.enum(["preset", "cloned", "designed"]),
  voice_ref: z.string().nullable(),
  ref_text: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
  created_at: z.string(),
  updated_at: z.string(),
});

const VoicesListResponseSchema = z.object({
  voices: z.array(VoiceProfileDataSchema),
});

const BackendCapabilitiesSchema = z.object({
  has_preset_voices: z.boolean().optional().default(false),
  supports_voice_design: z.boolean().optional().default(false),
  supports_voice_cloning: z.boolean().optional().default(false),
  supports_streaming: z.boolean().optional().default(false),
});

const BackendInfoSchema = z.object({
  name: z.string(),
  type: z.string(),
  local: z.boolean(),
  capabilities: BackendCapabilitiesSchema,
  languages: z.array(z.string()).nullable().optional().default(null),
  preset_voices: z.array(z.string()).nullable().optional().default(null),
});

const BackendsResponseSchema = z.array(BackendInfoSchema);

function getHeaders(
  authorization?: string,
  extra?: Record<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  if (authorization) {
    headers["Authorization"] = authorization;
  }
  return headers;
}

export class OpenAITTSApiService implements ITTSApiService {
  private _apiURL: string;
  private _model: string;
  private _voice: string;
  private _speed: number;
  private _langCode?: string;
  private _authorization?: string;

  constructor(options: Partial<OpenAITTSApiServiceOptions> = {}) {
    this._apiURL = options.apiURL ?? "http://127.0.0.1:8000";
    this._model = options.model ?? "openai";
    this._voice = options.voice ?? "alloy";
    this._speed = options.speed ?? 1.0;
    this._langCode = options.langCode;
    this._authorization = options.authorization;
  }

  public static async getAvailableVoices(
    apiURL: string,
    options: Partial<TTSOptions> & { backend?: string; authorization?: string } = {},
  ): Promise<VoiceProfileData[]> {
    try {
      const url = new URL("/v1/audio/voices", apiURL);
      if (options.backend) {
        url.searchParams.set("backend", options.backend);
      }
      const response = await fetch(url, {
        method: "GET",
        headers: getHeaders(options.authorization),
        signal: options.signal,
      });
      if (!response.ok) {
        return [];
      }

      const data = VoicesListResponseSchema.parse(await response.json());
      return data.voices;
    } catch {
      return [];
    }
  }

  public static async getBackends(
    apiURL: string,
    options: Partial<TTSOptions> & { authorization?: string } = {},
  ): Promise<BackendInfo[]> {
    try {
      const response = await fetch(new URL("/v1/backends", apiURL), {
        method: "GET",
        headers: getHeaders(options.authorization),
        signal: options.signal,
      });
      if (!response.ok) {
        return [];
      }
      return BackendsResponseSchema.parse(await response.json());
    } catch {
      return [];
    }
  }

  public static async getAvailableModels(
    apiURL: string,
    options: Partial<TTSOptions> & { authorization?: string } = {},
  ): Promise<{ models: string[]; defaultModel: string | null }> {
    const backends = await OpenAITTSApiService.getBackends(apiURL, options);
    const models = backends.map((b) => b.name);
    const defaultModel = models[0] ?? null;
    return { models, defaultModel };
  }

  public static async createVoice(
    apiURL: string,
    data: { name: string; backend: string; voice_type: "preset" | "designed"; voice_ref: string },
    options: Partial<TTSOptions> & { authorization?: string } = {},
  ): Promise<VoiceProfileData> {
    const response = await fetch(new URL("/v1/audio/voices", apiURL), {
      method: "POST",
      headers: getHeaders(options.authorization, { "Content-Type": "application/json" }),
      body: JSON.stringify(data),
      signal: options.signal,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        (error as { detail?: { message?: string } }).detail?.message || "Failed to create voice",
      );
    }
    return VoiceProfileDataSchema.parse(await response.json());
  }

  public static async deleteVoice(
    apiURL: string,
    voiceId: string,
    options: Partial<TTSOptions> & { authorization?: string } = {},
  ): Promise<void> {
    const response = await fetch(
      new URL(`/v1/audio/voices/${encodeURIComponent(voiceId)}`, apiURL),
      {
        method: "DELETE",
        headers: getHeaders(options.authorization),
        signal: options.signal,
      },
    );
    if (!response.ok && response.status !== 204) {
      throw new Error("Failed to delete voice");
    }
  }

  public static async cloneVoice(
    apiURL: string,
    data: { name: string; backend: string; audio: File; ref_text?: string },
    options: Partial<TTSOptions> & { authorization?: string } = {},
  ): Promise<VoiceProfileData> {
    const formData = new FormData();
    formData.append("name", data.name);
    formData.append("backend", data.backend);
    formData.append("audio", data.audio);
    if (data.ref_text) {
      formData.append("ref_text", data.ref_text);
    }

    const response = await fetch(new URL("/v1/audio/voices/clone", apiURL), {
      method: "POST",
      headers: getHeaders(options.authorization),
      body: formData,
      signal: options.signal,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        (error as { detail?: { message?: string } }).detail?.message || "Failed to clone voice",
      );
    }
    return VoiceProfileDataSchema.parse(await response.json());
  }

  public async getAvailableVoices(options: Partial<TTSOptions> = {}): Promise<VoiceProfileData[]> {
    return OpenAITTSApiService.getAvailableVoices(this._apiURL, {
      ...options,
      authorization: this._authorization,
    });
  }

  public async getAvailableModels(
    options: Partial<TTSOptions> = {},
  ): Promise<{ models: string[]; defaultModel: string | null }> {
    return OpenAITTSApiService.getAvailableModels(this._apiURL, {
      ...options,
      authorization: this._authorization,
    });
  }

  public async createSpeech(text: string, options: Partial<TTSOptions> = {}): Promise<TTSResponse> {
    const body: Record<string, unknown> = {
      model: this._model,
      input: text,
      voice: this._voice,
      speed: this._speed,
      response_format: "wav",
      stream: false,
      _alignment: true,
    };

    if (this._langCode) {
      body._language = this._langCode;
    }

    const response = await fetch(new URL("/v1/audio/speech", this._apiURL), {
      method: "POST",
      headers: getHeaders(this._authorization, { "Content-Type": "application/json" }),
      mode: "cors",
      body: JSON.stringify(body),
      signal: options.signal,
    });

    if (!response.ok) {
      let message = "Failed to generate speech";
      try {
        const error = (await response.json()) as { detail?: { message?: string } };
        message = error.detail?.message || message;
      } catch {
        // ignore
      }
      throw new Error(message);
    }

    if (response.body === null) {
      throw new Error("No body in response");
    }

    const wordTimestamps = this._parseAlignment(text, response.headers);

    return {
      text,
      content: response.body,
      contentType: response.headers.get("Content-Type") ?? "audio/wav",
      wordTimestamps,
    };
  }

  private _parseAlignment(text: string, headers: Headers): WordTimestamp[] {
    const raw = headers.get("x-word-timings");
    if (!raw) {
      return [];
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }

    if (!Array.isArray(parsed)) {
      return [];
    }

    const timestamps: WordTimestamp[] = [];
    for (const item of parsed) {
      const result = AlignItemSchema.safeParse(item);
      if (!result.success) {
        continue;
      }
      const { text_start, text_end, audio_start, audio_end } = result.data;
      const s = Math.max(0, Math.min(text_start, text.length));
      const e = Math.max(s, Math.min(text_end, text.length));
      timestamps.push({
        timeRange: { start: audio_start, end: audio_end },
        textRange: { start: s, end: e },
      });
    }
    return timestamps;
  }
}
