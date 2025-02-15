import type { IRange } from "./IRange";

export interface TTSResponse {
  text: string;
  content: ReadableStream<Uint8Array>;
  contentType: string;
  wordTimestamps: WordTimestamp[];
}

export interface WordTimestamp {
  timeRange: IRange;
  textRange: IRange;
}

export interface TTSOptions {
  abortSignal: AbortSignal;
}

export interface ITTSApiService {
  createSpeech(text: string, options?: Partial<TTSOptions>): Promise<TTSResponse>;
}