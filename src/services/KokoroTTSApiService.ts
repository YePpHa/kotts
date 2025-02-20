import { z } from "zod";
import type {
  ITTSApiService,
  TTSOptions,
  TTSResponse,
  WordTimestamp,
} from "../types/ITTSApiService";
import { firstMatch } from "../utils/Text";

export type KokoroTTSApiServiceOptions = {
  apiURL: string;
  voice: string;
  speed: number;
  langCode?: string;
};

const WordTimestampSchema = z.object({
  word: z.string(),
  start_time: z.number(),
  end_time: z.number(),
});

export class KokoroTTSApiService implements ITTSApiService {
  private _apiURL: string;
  private _voice: string;
  private _speed: number;
  private _langCode?: string;

  constructor(options: Partial<KokoroTTSApiServiceOptions> = {}) {
    this._apiURL = options.apiURL ?? "http://127.0.0.1:8880";
    this._voice = options.voice ?? "af_heart";
    this._speed = options.speed ?? 1.0;
    this._langCode = options.langCode;
  }

  public async createSpeech(
    text: string,
    options: Partial<TTSOptions> = {},
  ): Promise<TTSResponse> {
    const response = await fetch(`${this._apiURL}/dev/captioned_speech`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      mode: "cors",

      body: JSON.stringify({
        "model": "kokoro",
        "input": text,
        "voice": this._voice,
        "speed": this._speed,
        "lang_code": this._langCode,
        "response_format": "mp3",
        "return_download_link": false,
      }),
      signal: options.signal,
    });

    const wordTimestamps = await this._getWordTimestamps(
      text,
      response.headers,
    );

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

  private async _getWordTimestamps(
    text: string,
    headers: Headers,
  ): Promise<WordTimestamp[]> {
    if (headers.has("X-Word-Timestamps")) {
      return this._parseWordTimestamps(
        text,
        JSON.parse(String(headers.get("X-Word-Timestamps"))),
      );
    }

    if (headers.has("X-Timestamps-Path")) {
      const response = await fetch(
        `${this._apiURL}/dev/timestamps/${headers.get("X-Timestamps-Path")}`,
      );
      return this._parseWordTimestamps(text, JSON.parse(await response.text()));
    }

    return [];
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

      const range = firstMatch(timestamp.word, text, offset);
      if (range === null) {
        continue;
      }
      if (range.start === text.length && i < timestamps.length - 1) {
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
