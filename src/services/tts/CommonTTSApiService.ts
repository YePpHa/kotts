import { z } from "zod";

import type {
  ITTSApiService,
  TTSOptions,
  TTSResponse,
  WordTimestamp,
} from "../../types/ITTSApiService";

const WordTimingSchema = z.object({
  start: z.number(),
  end: z.number(),
  text_start: z.number(),
  text_end: z.number(),
});

const WordTimingDataSchema = z.object({
  words: z.array(WordTimingSchema),
});

export type CommonTTSApiServiceOptions = {
  apiURL: string;
  model: string;
  voice: string;
  speed: number;
  langCode?: string;
};

export class CommonTTSApiService implements ITTSApiService {
  private _apiURL: string;
  private _model: string;
  private _voice: string;
  private _speed: number;
  private _langCode?: string;

  constructor(options: Partial<CommonTTSApiServiceOptions> = {}) {
    this._apiURL = options.apiURL ?? "http://127.0.0.1:8000";
    this._model = options.model ?? "echo-tts";
    this._voice = options.voice ?? "Amelia";
    this._speed = options.speed ?? 1.0;
    this._langCode = options.langCode;
  }

  public static async getAvailableVoices(
    apiURL: string,
    options: Partial<TTSOptions> = {},
  ): Promise<string[]> {
    const response = await fetch(new URL("/v1/audio/voices", apiURL), {
      method: "GET",
      signal: options.signal,
    });
    if (!response.ok) {
      throw new Error("Failed to fetch voices");
    }

    const data = (await response.json()) as unknown;
    if (
      typeof data !== "object" ||
      data === null ||
      !("voices" in data) ||
      !Array.isArray((data as { voices: unknown }).voices)
    ) {
      throw new Error("Invalid voices response");
    }

    const voices = (data as { voices: unknown[] }).voices
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
    return voices;
  }

  public static async getAvailableModels(
    apiURL: string,
    options: Partial<TTSOptions> = {},
  ): Promise<{ models: string[]; defaultModel: string | null }> {
    const response = await fetch(new URL("/v1/audio/models", apiURL), {
      method: "GET",
      signal: options.signal,
    });
    if (!response.ok) {
      throw new Error("Failed to fetch models");
    }

    const data = (await response.json()) as unknown;
    if (typeof data !== "object" || data === null) {
      throw new Error("Invalid models response");
    }

    const rawModels = (data as { models?: unknown }).models;
    const rawDefault = (data as { default?: unknown }).default;
    const models = Array.isArray(rawModels)
      ? rawModels
          .filter((m): m is string => typeof m === "string")
          .map((m) => m.trim())
          .filter((m) => m.length > 0)
      : [];
    const defaultModel =
      typeof rawDefault === "string" && rawDefault.trim().length > 0 ? rawDefault.trim() : null;

    return { models, defaultModel };
  }

  public async getAvailableVoices(options: Partial<TTSOptions> = {}): Promise<string[]> {
    return CommonTTSApiService.getAvailableVoices(this._apiURL, options);
  }

  public async getAvailableModels(
    options: Partial<TTSOptions> = {},
  ): Promise<{ models: string[]; defaultModel: string | null }> {
    return CommonTTSApiService.getAvailableModels(this._apiURL, options);
  }

  private _getTimingsId(): string {
    return crypto.randomUUID
      ? crypto.randomUUID()
      : String(Date.now()) + "-" + Math.random().toString(16).slice(2);
  }

  public async createSpeech(text: string, options: Partial<TTSOptions> = {}): Promise<TTSResponse> {
    const normText = text.replace(/\b[\p{Lu}\p{Lt}]+\b/gu, (match) => match.toLowerCase());

    const timingsId = this._getTimingsId();

    const response = await fetch(new URL("/v1/audio/speech", this._apiURL), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      mode: "cors",

      body: JSON.stringify({
        model: this._model,
        input: normText,
        voice: this._voice,
        response_format: "mp3",
        stream: false,
        extra_body: {
          timing_id: timingsId,
          timings_mode: "ctc_chunk",
          timings_unit: "words",
        },
      }),
      signal: options.signal,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail?.message || "Failed to generate speech");
    }

    const audioBytes = await response.bytes();
    const audioStream = new ReadableStream({
      start(controller) {
        controller.enqueue(audioBytes);
        controller.close();
      },
      type: "bytes",
    });

    const wordTimestamps = await this._getWordTimestamps(timingsId, options);

    return {
      text,
      content: audioStream,
      contentType: response.headers.get("Content-Type") ?? "audio/mpeg",
      wordTimestamps,
    };
  }

  private async _getWordTimestamps(
    timingId: string,
    options: Partial<TTSOptions> = {},
  ): Promise<WordTimestamp[]> {
    const response = await fetch(
      new URL(`/v1/audio/speech/timings/${encodeURIComponent(timingId)}`, this._apiURL),
      {
        method: "GET",
        signal: options.signal,
      },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail?.message || "Failed to generate speech");
    }

    if (response.body === null) {
      throw new Error("No body in response");
    }

    const text = await response.text();
    const events = this._parseEvents(text);
    const wordsEventData = events.find((event) => event.type === "words");
    if (wordsEventData === undefined) {
      throw new Error("Words event not found");
    }

    const parsedData = WordTimingDataSchema.parse(JSON.parse(wordsEventData.data));

    const wordTimestamps: WordTimestamp[] = [];
    for (const word of parsedData.words) {
      wordTimestamps.push({
        timeRange: {
          start: word.start,
          end: word.end,
        },
        textRange: {
          start: word.text_start,
          end: word.text_end,
        },
      });
    }

    return wordTimestamps;
  }

  private _parseEvents(text: string): { type: string; data: string }[] {
    const events: { type: string; data: string }[] = [];
    for (const chunk of text.split("\n\n")) {
      if (chunk.trim().length === 0) {
        continue;
      }

      const lines = chunk.split("\n");
      const kv = lines.map((line) => this._parseEventLine(line));
      const event = kv.find((kv) => kv.name === "event");
      const data = kv.find((kv) => kv.name === "data");
      if (event === undefined || data === undefined) {
        continue;
      }

      events.push({ type: event.value, data: data.value });
    }
    return events;
  }

  private _parseEventLine(line: string): { name: string; value: string } {
    const match = line.match(/^([^:]+):/);
    if (match === null) {
      throw new Error("Invalid event line");
    }
    const name = match[1];
    const value = line.slice(name.length + 1).trim();
    return { name, value };
  }
}
