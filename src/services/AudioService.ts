import { AudioReader, StreamChapter, StreamData } from "../libs/AudioReader";
import { EventEmitter } from "../libs/EventEmitter";
import { StreamingAudio } from "../libs/StreamingAudio";
import type { ITTSApiService, TTSResponse } from "../types/ITTSApiService";

const RETRY = 3;

export class AudioService {
  public readonly onError = new EventEmitter<(error: unknown) => void>();
  public readonly onSegmentLoad = new EventEmitter<() => void>();
  public readonly onSegmentEnd = new EventEmitter<() => void>();

  public readonly audio = new StreamingAudio();

  private _audioReader: AudioReader;
  private _chapters: StreamChapter[] = [];
  private _completed: boolean = false;

  private _ttsApiService: ITTSApiService;
  private _ttsResponses: TTSResponse[] = [];

  private _abortController = new AbortController();

  constructor(
    ttsApiService: ITTSApiService,
    texts: Iterable<string, void, void> | AsyncIterable<string, void, void>,
  ) {
    this._ttsApiService = ttsApiService;

    this._audioReader = new AudioReader(this._createStreams(texts));
    this._load();
  }

  public [Symbol.dispose]() {
    this._abortController.abort();
  }

  private async _load() {
    try {
      for await (const chapter of this._audioReader.load(this.audio)) {
        this._chapters.push(chapter);
        this.onSegmentLoad.emit();
      }
    } catch (err) {
      this.onError.emit(err);
    }
    this._completed = true;
    this.onSegmentEnd.emit();
  }

  public get completed(): boolean {
    return this._completed;
  }

  public getStreamChapters(): StreamChapter[] {
    return this._chapters;
  }

  public getTtsResponses(): TTSResponse[] {
    return this._ttsResponses;
  }

  private async *_createStreams(
    texts: Iterable<string, void, void> | AsyncIterable<string, void, void>
  ): AsyncIterable<StreamData, void, void> {
    for await (const text of texts) {
      a: {
        let lastError = null;
        for (let i = 0; i < RETRY; i++) {
          try {
            const ttsResponse = await this._ttsApiService.createSpeech(text, {
              signal: this._abortController.signal,
            });
            this._ttsResponses.push(ttsResponse);
            yield {
              type: ttsResponse.contentType,
              stream: ttsResponse.content,
            };
            break a;
          } catch (err) {
            lastError = err;
            console.warn({ error: err }, `Failed to create speech. Retrying ${i + 1}/${RETRY}...`);
          }
        }

        throw lastError;
      }
    }
  }
}
