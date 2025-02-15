import type { IRange } from "../types/IRange";
import { EventEmitter } from "./EventEmitter";
import { type BufferingState, Media, PlaybackState } from "./Media";
import { MediaSourceAppender } from "./MediaSourceAppender";

export type AudioStreamOptions = {
  autoPlay: boolean;
};

export type StreamData = {
  type: string;
  stream: ReadableStream<Uint8Array>;
}

export interface StreamChapter {
  timeRange: IRange;
}

export class AudioStream {
  public readonly onStateChange = new EventEmitter<(state: PlaybackState) => void>();
  public readonly onBufferingStateChange = new EventEmitter<(state: BufferingState) => void>();
  public readonly onTimeUpdate = new EventEmitter<(time: number) => void>();
  public readonly onDurationChange = new EventEmitter<(duration: number) => void>();
  public readonly onStreamFinished = new EventEmitter<() => void>();

  public readonly onError = new EventEmitter<(error: unknown) => void>();

  private _abortController = new AbortController();
  private _audio = new Media(new Audio());
  private _mediaSourceAppender = new MediaSourceAppender(this._audio);

  private _streams: AsyncIterable<StreamData, void, void>;
  private _streamChapters: StreamChapter[] = [];

  private _streamFinished = false;

  constructor(streams: AsyncIterable<StreamData, void, void>, options: Partial<AudioStreamOptions> = {}) {
    const playbackState = options.autoPlay ? PlaybackState.Play : PlaybackState.Pause;

    this._audio.onStateChange.add(state => this.onStateChange.emit(state));
    this._audio.onBufferingStateChange.add(state => this.onBufferingStateChange.emit(state));
    this._audio.onTimeUpdate.add((currentTime) => this.onTimeUpdate.emit(currentTime));
    this._audio.onDurationChange.add(duration => this.onDurationChange.emit(duration));

    this._audio.setPlaybackState(playbackState);

    this._streams = streams;

    this._audio.media.addEventListener("error", evt => {
      const error = this._audio.media.error;
      if (error) {
        this.onError.emit(error);
      }
    }, {
      signal: this._abortController.signal
    });

    (async () => {
      try {
        await this._processStreams();
      } catch (err) {
        if (err instanceof Error) {
          if (err.name === "AbortError") {
            return;
          }
        }

        this.onError.emit(err);
      }
    })();
  }

  private async _processStreams(): Promise<void> {
    for await (const { type, stream } of this._streams) {
      const start = this._mediaSourceAppender.duration;

      const reader = stream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        await this._mediaSourceAppender.next(type, value);
      }

      reader.releaseLock();

      const end = this._mediaSourceAppender.duration;

      this._streamChapters.push({
        timeRange: {
          start,
          end
        }
      });
    }

    this._mediaSourceAppender.end();

    this._streamFinished = true;
    this.onStreamFinished.emit();
  }

  public [Symbol.dispose]() {
    this._abortController.abort();

    this._audio[Symbol.dispose]();
    this._mediaSourceAppender[Symbol.dispose]();
  }

  public getStreamChapters(): StreamChapter[] {
    return this._streamChapters;
  }

  public get streamFinished(): boolean {
    return this._streamFinished;
  }

  public get state(): PlaybackState {
    return this._audio.getPlaybackState();
  }

  public set state(value: PlaybackState) {
    this._audio.setPlaybackState(value);
  }

  public get isBuffering(): boolean {
    return this._audio.isBuffering();
  }

  public get duration(): number {
    return this._mediaSourceAppender.duration;
  }

  public get currentTime(): number {
    return this._audio.currentTime;
  }

  public set currentTime(value: number) {
    this._audio.currentTime = value;
  }

  public get volume(): number {
    return this._audio.volume;
  }

  public set volume(value: number) {
    this._audio.volume = value;
  }

  public play(): void {
    this._audio.play();
  }

  public pause(): void {
    this._audio.pause();
  }
}