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
};

const AlignItemSchema = z.object({
  word: z.string(),
  text_start: z.number(),
  text_end: z.number(),
  audio_start: z.number(),
  audio_end: z.number(),
});

const VoiceProfileSchema = z.object({
  id: z.string(),
});

const VoicesResponseSchema = z.object({
  voices: z.array(VoiceProfileSchema),
});

const BackendInfoSchema = z.object({
  name: z.string(),
});

const BackendsResponseSchema = z.array(BackendInfoSchema);

const OpenAIListSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    object: z.literal("list"),
    data: z.array(itemSchema),
  });

const ModelsResponseSchema = z.union([
  BackendsResponseSchema,
  OpenAIListSchema(z.object({ id: z.string() })),
  z.object({
    models: z.array(z.string()).optional(),
    default: z.string().optional(),
  }),
]);

export class OpenAITTSApiService implements ITTSApiService {
  private _apiURL: string;
  private _model: string;
  private _voice: string;
  private _speed: number;
  private _langCode?: string;

  constructor(options: Partial<OpenAITTSApiServiceOptions> = {}) {
    this._apiURL = options.apiURL ?? "http://127.0.0.1:8000";
    this._model = options.model ?? "openai";
    this._voice = options.voice ?? "alloy";
    this._speed = options.speed ?? 1.0;
    this._langCode = options.langCode;
  }

  public static async getAvailableVoices(
    apiURL: string,
    options: Partial<TTSOptions> = {},
  ): Promise<string[]> {
    try {
      const response = await fetch(new URL("/v1/audio/voices", apiURL), {
        method: "GET",
        signal: options.signal,
      });
      if (!response.ok) return [];

      const data = VoicesResponseSchema.parse(await response.json());
      return data.voices.map((v) => v.id.trim()).filter((v) => v.length > 0);
    } catch {
      return [];
    }
  }

  public static async getAvailableModels(
    apiURL: string,
    options: Partial<TTSOptions> = {},
  ): Promise<{ models: string[]; defaultModel: string | null }> {
    let raw: unknown;
    try {
      const response = await fetch(new URL("/v1/backends", apiURL), {
        method: "GET",
        signal: options.signal,
      });
      if (!response.ok) throw new Error("Failed to fetch backends");
      raw = await response.json();
    } catch {
      try {
        const response = await fetch(new URL("/v1/models", apiURL), {
          method: "GET",
          signal: options.signal,
        });
        if (!response.ok) throw new Error("Failed to fetch models");
        raw = await response.json();
      } catch {
        return { models: [], defaultModel: null };
      }
    }

    const data = ModelsResponseSchema.parse(raw);

    let models: string[] = [];

    if (Array.isArray(data)) {
      models = (data as { name: string }[]).map((m) => m.name.trim()).filter((m) => m.length > 0);
    } else if ("data" in data) {
      models = (data as { data: { id: string }[] }).data
        .map((m) => m.id.trim())
        .filter((m) => m.length > 0);
    } else {
      models = (data.models ?? []).map((m) => m.trim()).filter((m) => m.length > 0);
    }

    const defaultModel: string | null = models[0] ?? null;
    return { models, defaultModel };
  }

  public async getAvailableVoices(options: Partial<TTSOptions> = {}): Promise<string[]> {
    return OpenAITTSApiService.getAvailableVoices(this._apiURL, options);
  }

  public async getAvailableModels(
    options: Partial<TTSOptions> = {},
  ): Promise<{ models: string[]; defaultModel: string | null }> {
    return OpenAITTSApiService.getAvailableModels(this._apiURL, options);
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
      headers: {
        "Content-Type": "application/json",
      },
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
    const raw = headers.get("x-world-tts-alignment");
    if (!raw) return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }

    if (!Array.isArray(parsed)) return [];

    const timestamps: WordTimestamp[] = [];
    for (const item of parsed) {
      const result = AlignItemSchema.safeParse(item);
      if (!result.success) continue;
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
