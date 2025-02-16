import { EventEmitter } from "./EventEmitter";

export enum PlaybackState {
  Play = "play",
  Pause = "pause",
  Ended = "ended"
}

export enum BufferingState {
  Buffering = "buffering",
  Ready = "ready"
}

export class MediaController<T extends HTMLMediaElement> {
  public readonly onStateChange = new EventEmitter<(state: PlaybackState) => void>();
  public readonly onBufferingStateChange = new EventEmitter<(state: BufferingState) => void>();
  public readonly onTimeUpdate = new EventEmitter<(time: number) => void>();
  public readonly onDurationChange = new EventEmitter<(duration: number) => void>();

  public readonly media: T;

  private _abortController = new AbortController();

  private _preferredPlaybackState: PlaybackState = PlaybackState.Pause;
  
  constructor(media: T) {
    this.media = media;

    this.media.addEventListener("playing", () => this._onPlaying(), {
      signal: this._abortController.signal
    });

    this.media.addEventListener("pause", () => this._onPause(), {
      signal: this._abortController.signal
    });

    this.media.addEventListener("ended", () => this._onEnded(), {
      signal: this._abortController.signal
    });

    this.media.addEventListener("canplay", () => this._onCanplay(), {
      signal: this._abortController.signal
    });

    this.media.addEventListener("stalled", () => this._onStalled(), {
      signal: this._abortController.signal
    });

    this.media.addEventListener("suspend", () => this._onStalled(), {
      signal: this._abortController.signal
    });

    this.media.addEventListener("waiting", () => this._onStalled(), {
      signal: this._abortController.signal
    });

    this.media.addEventListener("seeked", () => this._onCanplay(), {
      signal: this._abortController.signal
    });

    this.media.addEventListener("timeupdate", () => this._onTimeUpdate(), {
      signal: this._abortController.signal
    });

    this.media.addEventListener("durationchange", () => this._onDurationChange(), {
      signal: this._abortController.signal
    });
  }

  public [Symbol.dispose]() {
    this._abortController.abort();
    this.media.pause();
    this.media.src = "";
  }

  public get error(): MediaError | null {
    return this.media.error;
  }

  public get duration(): number {
    return this.media.duration;
  }

  public get currentTime(): number {
    return this.media.currentTime;
  }

  public set currentTime(value: number) {
    this.media.currentTime = value;
  }

  public get volume(): number {
    return this.media.volume;
  }

  public set volume(value: number) {
    this.media.volume = value;
  }

  public async play(): Promise<void> {
    this._preferredPlaybackState = PlaybackState.Play;
    this.onStateChange.emit(this._preferredPlaybackState);

    try {
      await this.media.play();
    } catch (err) {
      if (!(err instanceof Error)) {
        console.error("Error occurred on audio play", err);
        throw err;
      }

      if (err.name === "NotAllowedError") {
        this._preferredPlaybackState = PlaybackState.Pause;
        this.onStateChange.emit(this._preferredPlaybackState);
      }
    }
  }

  public pause(): void {
    this._preferredPlaybackState = PlaybackState.Pause;
    this.onStateChange.emit(this._preferredPlaybackState);

    this.media.pause();
  }

  public setPlaybackState(state: PlaybackState) {
    if (this._preferredPlaybackState === state) {
      return;
    }

    this._preferredPlaybackState = state;
    this.onStateChange.emit(this._preferredPlaybackState);
  }

  public getPlaybackState() {
    return this._preferredPlaybackState;
  }

  public isBuffering(): boolean {
    return this.media.readyState < HTMLMediaElement.HAVE_FUTURE_DATA;
  }

  private _onPlaying(): void {
    const state = this._preferredPlaybackState;
    if (state !== PlaybackState.Pause) {
      return;
    }

    this.media.pause();
  }

  private _onPause(): void {
    const state = this._preferredPlaybackState;
    if (state === PlaybackState.Play) {
      return;
    }

    this._preferredPlaybackState = PlaybackState.Pause;
    this.onStateChange.emit(this._preferredPlaybackState);
  }

  private _onEnded(): void {
    this._preferredPlaybackState = PlaybackState.Ended;
    this.onStateChange.emit(this._preferredPlaybackState);
  }

  private _onCanplay(): void {
    this.onBufferingStateChange.emit(this.isBuffering() ? BufferingState.Buffering : BufferingState.Ready);

    if (this._preferredPlaybackState === PlaybackState.Pause) {
      this.media.pause();
      return;
    }

    this.play();
  }

  private _onStalled(): void {
    this.onBufferingStateChange.emit(this.isBuffering() ? BufferingState.Buffering : BufferingState.Ready);

    if (!this.isBuffering()) {
      return;
    }

    if (this._preferredPlaybackState === PlaybackState.Pause) {
      this.media.pause();
      return;
    }

    this.play();
  }

  private _onTimeUpdate(): void {
    this.onTimeUpdate.emit(this.media.currentTime);
  }

  private _onDurationChange(): void {
    this.onDurationChange.emit(this.media.duration);
  }
}