import type { ITTSApiService, TTSOptions, TTSResponse } from "../../types/ITTSApiService";

export type TwoCentTTSApiServiceOptions = {
  apiURL: string;
  model: string;
  audioText: string;
  audio: string;
};

export class TwoCentTTSApiService implements ITTSApiService {
  private _apiURL: string;
  private _model: string;
  private _audioText: string;
  private _audio: string;

  constructor(options: Partial<TwoCentTTSApiServiceOptions> = {}) {
    this._apiURL = options.apiURL ?? "http://127.0.0.1:8080";
    this._model = options.model ?? "tts-1";
    this._audioText = options.audioText ?? "";
    this._audio = options.audio ?? "";
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
      const data = (await response.json()) as unknown;
      if (Array.isArray(data)) {
        return (data as unknown[])
          .filter((v): v is string => typeof v === "string")
          .map((v) => v.trim())
          .filter((v) => v.length > 0);
      }
      return [];
    } catch {
      return [];
    }
  }

  public static async getAvailableModels(
    apiURL: string,
    options: Partial<TTSOptions> = {},
  ): Promise<{ models: string[]; defaultModel: string | null }> {
    try {
      const response = await fetch(new URL("/v1/models", apiURL), {
        method: "GET",
        signal: options.signal,
      });
      if (!response.ok) {
        return { models: ["tts-1"], defaultModel: "tts-1" };
      }
      const data = (await response.json()) as unknown;
      // OpenAI list format: { object: "list", data: [{ id: "..." }, ...] }
      if (
        typeof data === "object" &&
        data !== null &&
        "data" in data &&
        Array.isArray((data as { data: unknown }).data)
      ) {
        const models = (data as { data: unknown[] }).data
          .filter((m): m is { id: string } => typeof (m as { id?: unknown }).id === "string")
          .map((m) => m.id.trim())
          .filter((m) => m.length > 0);
        return { models, defaultModel: models[0] ?? "tts-1" };
      }
      return { models: ["tts-1"], defaultModel: "tts-1" };
    } catch {
      return { models: ["tts-1"], defaultModel: "tts-1" };
    }
  }

  public async getAvailableVoices(options: Partial<TTSOptions> = {}): Promise<string[]> {
    return TwoCentTTSApiService.getAvailableVoices(this._apiURL, options);
  }

  public async getAvailableModels(
    options: Partial<TTSOptions> = {},
  ): Promise<{ models: string[]; defaultModel: string | null }> {
    return TwoCentTTSApiService.getAvailableModels(this._apiURL, options);
  }

  public async createSpeech(text: string, options: Partial<TTSOptions> = {}): Promise<TTSResponse> {
    const normText = text.replace(/\b[\p{Lu}\p{Lt}]+\b/gu, (match) => match.toLowerCase());

    const response = await fetch(new URL("/v1/audio/voice-cloning", this._apiURL), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      mode: "cors",
      body: JSON.stringify({
        model: this._model,
        input: normText,
        audio_text: this._audioText,
        audio: this._audio,
        response_format: "wav",
      }),
      signal: options.signal,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        (error as { detail?: { message?: string } }).detail?.message || "Failed to generate speech",
      );
    }

    if (response.body === null) {
      throw new Error("No body in response");
    }

    return {
      text,
      content: response.body,
      contentType: response.headers.get("Content-Type") ?? "audio/wav",
      wordTimestamps: [],
    };
  }
}
