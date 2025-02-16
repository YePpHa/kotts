import type { IRange } from "../types/IRange";
import { EventEmitter } from "./EventEmitter";
import { type BufferingState, MediaController, PlaybackState } from "./MediaController";
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
  private _audioController = new MediaController(new Audio());
  private _mediaSourceAppender = new MediaSourceAppender(this._audioController);

  private _streams: AsyncIterable<StreamData, void, void>;
  private _streamChapters: StreamChapter[] = [];

  private _streamFinished = false;

  constructor(streams: AsyncIterable<StreamData, void, void>, options: Partial<AudioStreamOptions> = {}) {
    const playbackState = options.autoPlay ? PlaybackState.Play : PlaybackState.Pause;

    this._audioController.onStateChange.add(state => this.onStateChange.emit(state));
    this._audioController.onBufferingStateChange.add(state => this.onBufferingStateChange.emit(state));
    this._audioController.onTimeUpdate.add((currentTime) => this.onTimeUpdate.emit(currentTime));
    this._audioController.onDurationChange.add(duration => this.onDurationChange.emit(duration));

    this._audioController.setPlaybackState(playbackState);

    this._streams = streams;

    this._audioController.media.addEventListener("error", evt => {
      const error = this._audioController.media.error;
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
        console.error(err);
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

      let buffer: Uint8Array | null = null;

      const reader = stream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        if (buffer === null) {
          buffer = new Uint8Array(value.byteLength);
          buffer.set(value, 0);
        } else {
          const prevBuffer: Uint8Array = buffer;
          buffer = new Uint8Array(prevBuffer.byteLength + value.byteLength);
          buffer.set(prevBuffer, 0);
          buffer.set(value, prevBuffer.byteLength);
        }
      }

      if (buffer !== null) {
        await this._mediaSourceAppender.next(type, buffer);
      }

      reader.releaseLock();

      const end = this._mediaSourceAppender.duration;
      if (start !== end) {
        this.onDurationChange.emit(this.duration);
      }

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

    this._audioController[Symbol.dispose]();
    this._mediaSourceAppender[Symbol.dispose]();
  }

  public getStreamChapters(): StreamChapter[] {
    return this._streamChapters;
  }

  public get streamFinished(): boolean {
    return this._streamFinished;
  }

  public get state(): PlaybackState {
    return this._audioController.getPlaybackState();
  }

  public set state(value: PlaybackState) {
    this._audioController.setPlaybackState(value);
  }

  public get isBuffering(): boolean {
    return this._audioController.isBuffering();
  }

  public get duration(): number {
    return this._mediaSourceAppender.duration;
  }

  public get currentTime(): number {
    return this._audioController.currentTime;
  }

  public set currentTime(value: number) {
    this._audioController.currentTime = value;
  }

  public get volume(): number {
    return this._audioController.volume;
  }

  public set volume(value: number) {
    this._audioController.volume = value;
  }

  public play(): void {
    this._audioController.play();
  }

  public pause(): void {
    this._audioController.pause();
  }
}