import { z } from "zod";

import type {
  ITTSApiService,
  TTSOptions,
  TTSResponse,
  WordTimestamp,
} from "../../types/ITTSApiService";

export type TadaTTSApiServiceOptions = {
  apiURL: string;
  language: string; // = model field from profile
  promptText: string; // = voice field from profile (optional transcript)
  audio: string; // = voiceAudio field from profile (base64)
};

// Languages the /synthesize endpoint supports (used for offline discovery).
export const TADA_LANGUAGES = ["en", "de", "ja", "fr", "ko", "zh", "es", "pt"];

const WordTimestampSchema = z.object({
  text_start_index: z.number(),
  text_end_index: z.number(),
  start: z.number(),
  end: z.number(),
});

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

export class TadaTTSApiService implements ITTSApiService {
  private _apiURL: string;
  private _language: string;
  private _promptText: string;
  private _audio: string;

  constructor(options: Partial<TadaTTSApiServiceOptions> = {}) {
    this._apiURL = options.apiURL ?? "http://127.0.0.1:8880";
    this._language = options.language ?? "en";
    this._promptText = options.promptText ?? "";
    this._audio = options.audio ?? "";
  }

  public static async getAvailableVoices(
    _apiURL: string,
    _options: Partial<TTSOptions> = {},
  ): Promise<string[]> {
    return [];
  }

  public static async getAvailableModels(
    _apiURL: string,
    _options: Partial<TTSOptions> = {},
  ): Promise<{ models: string[]; defaultModel: string | null }> {
    return { models: TADA_LANGUAGES, defaultModel: "en" };
  }

  public async getAvailableVoices(options: Partial<TTSOptions> = {}): Promise<string[]> {
    return TadaTTSApiService.getAvailableVoices(this._apiURL, options);
  }

  public async getAvailableModels(
    options: Partial<TTSOptions> = {},
  ): Promise<{ models: string[]; defaultModel: string | null }> {
    return TadaTTSApiService.getAvailableModels(this._apiURL, options);
  }

  public async createSpeech(text: string, options: Partial<TTSOptions> = {}): Promise<TTSResponse> {
    const audioBlob = base64ToBlob(this._audio, "audio/wav");

    const form = new FormData();
    form.append("audio", audioBlob, "reference.wav");
    form.append("text", text);
    form.append("language", this._language);
    form.append("timestamps", "true");
    form.append("prompt_text", this._promptText);

    const response = await fetch(new URL("/synthesize", this._apiURL), {
      method: "POST",
      mode: "cors",
      body: form,
      signal: options.signal,
    });

    if (!response.ok) {
      let message = "Failed to generate speech";
      try {
        const err = (await response.json()) as { detail?: string; message?: string };
        message = err.detail ?? err.message ?? message;
      } catch {
        // ignore
      }
      throw new Error(message);
    }

    if (response.body === null) {
      throw new Error("No body in response");
    }

    const wordTimestamps = this._parseTimestamps(text, response.headers);

    return {
      text,
      content: response.body,
      contentType: response.headers.get("Content-Type") ?? "audio/wav",
      wordTimestamps,
    };
  }

  private _parseTimestamps(text: string, headers: Headers): WordTimestamp[] {
    const raw = headers.get("X-Word-Timestamps");
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
      const result = WordTimestampSchema.safeParse(item);
      if (!result.success) continue;
      const { text_start_index, text_end_index, start, end } = result.data;
      // Clamp indices to text bounds.
      const s = Math.max(0, Math.min(text_start_index, text.length));
      const e = Math.max(s, Math.min(text_end_index, text.length));
      timestamps.push({
        timeRange: { start, end },
        textRange: { start: s, end: e },
      });
    }
    return timestamps;
  }
}
