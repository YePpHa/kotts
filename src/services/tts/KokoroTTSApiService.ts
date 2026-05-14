import { z } from "zod";

import type {
  ITTSApiService,
  TTSOptions,
  TTSResponse,
  WordTimestamp,
} from "../../types/ITTSApiService";
import { firstMatch } from "../../utils/Text";

export type KokoroTTSApiServiceOptions = {
  apiURL: string;
  model: string;
  voice: string;
  speed: number;
  langCode?: string;
};

const WordTimestampSchema = z.object({
  word: z.string(),
  start_time: z.number(),
  end_time: z.number(),
  start_index: z.number().optional(),
  end_index: z.number().optional(),
});

const OpenAIListSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    object: z.literal("list"),
    data: z.array(itemSchema),
  });

const KokoroVoicesResponseSchema = z.union([
  z.object({ voices: z.array(z.string()) }),
  z.array(z.string()),
  z.array(
    z.object({
      id: z.string(),
    }),
  ),
  OpenAIListSchema(
    z.object({
      id: z.string(),
    }),
  ),
]);

const KokoroModelsResponseSchema = z.union([
  // /dev/models variants
  z.array(z.string()),
  z.array(
    z.object({
      name: z.string(),
    }),
  ),
  // OpenAI-compatible /v1/models
  OpenAIListSchema(
    z.object({
      id: z.string(),
    }),
  ),
  // Also allow an OpenAI-ish custom shape: { models: [...], default: "..." }
  z.object({
    models: z.array(z.string()).optional(),
    default: z.string().optional(),
  }),
]);

async function fetchFirstOkJson(
  apiURL: string,
  paths: string[],
  options: Partial<TTSOptions> = {},
): Promise<unknown> {
  let lastError: unknown = null;
  for (const path of paths) {
    try {
      const response = await fetch(new URL(path, apiURL), {
        method: "GET",
        signal: options.signal,
      });
      if (!response.ok) {
        lastError = new Error(`Failed to fetch ${path}`);
        continue;
      }
      return (await response.json()) as unknown;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Failed to fetch");
}

export class KokoroTTSApiService implements ITTSApiService {
  private _apiURL: string;
  private _model: string;
  private _voice: string;
  private _speed: number;
  private _langCode?: string;

  constructor(options: Partial<KokoroTTSApiServiceOptions> = {}) {
    this._apiURL = options.apiURL ?? "http://127.0.0.1:8880";
    this._model = options.model ?? "kokoro";
    this._voice = options.voice ?? "af_heart";
    this._speed = options.speed ?? 1.0;
    this._langCode = options.langCode;
  }

  public static async getAvailableVoices(
    apiURL: string,
    options: Partial<TTSOptions> = {},
  ): Promise<string[]> {
    const raw = await fetchFirstOkJson(apiURL, ["/v1/audio/voices", "/dev/voices"], options);

    const data = KokoroVoicesResponseSchema.parse(raw);

    // Supports:
    // - { voices: ["af_heart", ...] }
    // - ["af_heart", ...]
    // - [{ id: "af_heart", ... }, ...]
    // - { object:"list", data:[{ id:"af_heart", ... }, ...] }
    const voices: string[] = Array.isArray(data)
      ? typeof data[0] === "string"
        ? (data as string[])
        : (data as { id: string }[]).map((v) => v.id)
      : "voices" in data
        ? (data as { voices: string[] }).voices
        : (data as { data: { id: string }[] }).data.map((v) => v.id);

    return voices.map((v) => v.trim()).filter((v) => v.length > 0);
  }

  public static async getAvailableModels(
    apiURL: string,
    options: Partial<TTSOptions> = {},
  ): Promise<{ models: string[]; defaultModel: string | null }> {
    const raw = await fetchFirstOkJson(apiURL, ["/v1/models", "/dev/models"], options);
    const data = KokoroModelsResponseSchema.parse(raw);

    // Supports:
    // - ["kokoro", ...]
    // - [{ name:"kokoro", ... }, ...]
    // - { object:"list", data:[{ id:"tts-1", ... }, ...] }
    // - { models:[...], default:"..." }
    let models: string[] = [];
    let defaultModel: string | null = null;

    if (Array.isArray(data)) {
      if (typeof data[0] === "string") {
        models = data as string[];
      } else {
        models = (data as { name: string }[]).map((m) => m.name);
      }
      models = models.map((m) => m.trim()).filter((m) => m.length > 0);
      defaultModel = models[0] ?? null;
      return { models, defaultModel };
    }

    if ("data" in data) {
      models = (data as { data: { id: string }[] }).data
        .map((m) => m.id.trim())
        .filter((m) => m.length > 0);
      defaultModel = models[0] ?? null;
      return { models, defaultModel };
    }

    // { models?: string[], default?: string }
    models = (data.models ?? []).map((m) => m.trim()).filter((m) => m.length > 0);
    defaultModel =
      typeof data.default === "string" && data.default.trim().length > 0
        ? data.default.trim()
        : (models[0] ?? null);
    return { models, defaultModel };
  }

  public async getAvailableVoices(options: Partial<TTSOptions> = {}): Promise<string[]> {
    return KokoroTTSApiService.getAvailableVoices(this._apiURL, options);
  }

  public async getAvailableModels(
    options: Partial<TTSOptions> = {},
  ): Promise<{ models: string[]; defaultModel: string | null }> {
    return KokoroTTSApiService.getAvailableModels(this._apiURL, options);
  }

  public async createSpeech(text: string, options: Partial<TTSOptions> = {}): Promise<TTSResponse> {
    const normText = text.replace(/\b[\p{Lu}\p{Lt}]+\b/gu, (match) => match.toLowerCase());

    const response = await fetch(`${this._apiURL}/dev/captioned_speech`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      mode: "cors",

      body: JSON.stringify({
        model: this._model,
        input: normText,
        voice: this._voice,
        speed: this._speed,
        lang_code: this._langCode,
        response_format: "mp3",
        return_download_link: false,
      }),
      signal: options.signal,
    });

    const wordTimestamps = await this._getWordTimestamps(normText, response.headers);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail?.message || "Failed to generate speech");
    }

    if (response.body === null) {
      throw new Error("No body in response");
    }

    return {
      text,
      content: response.body,
      contentType: response.headers.get("Content-Type") ?? "audio/mpeg",
      wordTimestamps,
    };
  }

  private async _getWordTimestamps(text: string, headers: Headers): Promise<WordTimestamp[]> {
    if (headers.has("X-Word-Timestamps")) {
      return this._parseWordTimestamps(text, JSON.parse(String(headers.get("X-Word-Timestamps"))));
    }

    if (headers.has("X-Timestamps-Path")) {
      const response = await fetch(
        `${this._apiURL}/dev/timestamps/${headers.get("X-Timestamps-Path")}`,
      );
      return this._parseWordTimestamps(text, JSON.parse(await response.text()));
    }

    return [];
  }

  private _getRangeForTimestamp(
    text: string,
    timestamp: z.infer<typeof WordTimestampSchema>,
    offset: number,
  ): { start: number; end: number } | null {
    if (timestamp.start_index !== undefined && timestamp.end_index !== undefined) {
      if (timestamp.start_index === -1 || timestamp.end_index === -1) {
        return null;
      }

      return { start: timestamp.start_index, end: timestamp.end_index };
    }

    const range = firstMatch(timestamp.word, text, offset);
    console.warn("Using fallback matching for word", timestamp);
    if (range === null) {
      return null;
    }

    return range;
  }

  private _parseWordTimestamps(
    text: string,
    timestamps: z.infer<typeof WordTimestampSchema>[],
  ): WordTimestamp[] {
    const wordTimestamps: WordTimestamp[] = [];
    let offset = 0;
    for (let i = 0; i < timestamps.length; i++) {
      const timestamp = timestamps[i];
      if (timestamp.word.match(/^\W+$/)) {
        continue;
      }

      const range = this._getRangeForTimestamp(text, timestamp, offset);
      if (range === null) {
        continue;
      }
      if (
        timestamp.start_index !== undefined &&
        range.start === text.length &&
        i < timestamps.length - 1
      ) {
        console.warn("Failed to find range for word", timestamp.word);
        range.start = offset + timestamp.word.length;
        range.end = offset + timestamp.word.length;
      }

      wordTimestamps.push({
        timeRange: {
          start: timestamp.start_time,
          end: timestamp.end_time,
        },
        textRange: range,
      });
      offset = range.end;
    }

    return wordTimestamps;
  }
}
