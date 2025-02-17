/**
 * MediaController.ts
 *
 * Controls one <audio> or <video> element, enforcing a "preferred" playback state.
 */
import { EventEmitter } from "./EventEmitter";

/**
 * High-level playback states that the user *prefers*.
 * The actual media element may be in a different state, but we try to enforce this.
 */
export enum PlaybackState {
  Play = 'play',
  Pause = 'pause',
  Ended = 'ended',
}

/**
 * Buffering states for the media or chunked streaming:
 * - Buffering = "we are waiting for data or have insufficient data to continue"
 * - Ready = "we have enough data to play or seek"
 */
export enum BufferingState {
  Buffering = 'buffering',
  Ready = 'ready',
}


export class MediaController<T extends HTMLMediaElement> {
  public readonly onStateChange = new EventEmitter<
    (state: PlaybackState) => void
  >();
  public readonly onBufferingStateChange = new EventEmitter<
    (state: BufferingState) => void
  >();
  public readonly onTimeUpdate = new EventEmitter<(time: number) => void>();
  public readonly onSeeking = new EventEmitter<(time: number) => void>();
  public readonly onDurationChange = new EventEmitter<
    (duration: number) => void
  >();

  public readonly media: T;

  private _abortController = new AbortController();
  private _preferredPlaybackState: PlaybackState = PlaybackState.Pause;

  constructor(media: T) {
    this.media = media;

    const signal = this._abortController.signal;

    media.addEventListener("playing", () => this._onPlaying(), { signal });
    media.addEventListener("pause", () => this._onPause(), { signal });
    media.addEventListener("ended", () => this._onEnded(), { signal });
    media.addEventListener("canplay", () => this._onCanplay(), { signal });
    media.addEventListener("stalled", () => this._onStalled(), { signal });
    media.addEventListener("suspend", () => this._onStalled(), { signal });
    media.addEventListener("waiting", () => this._onStalled(), { signal });
    media.addEventListener(
      "seeking",
      () => this.onSeeking.emit(this.media.currentTime),
      { signal },
    );
    media.addEventListener("seeked", () => this._onCanplay(), { signal });
    media.addEventListener("timeupdate", () => this._onTimeUpdate(), {
      signal,
    });
    media.addEventListener("durationchange", () => this._onDurationChange(), {
      signal,
    });
  }

  public [Symbol.dispose](): void {
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

  /**
   * The user wants to play. We set the "preferred" state to Play and
   * attempt to call `media.play()`.
   */
  public async play(): Promise<void> {
    this._preferredPlaybackState = PlaybackState.Play;
    this.onStateChange.emit(this._preferredPlaybackState);

    try {
      if (!this.media.paused && !this.media.ended && this.media.currentTime > 0 && this.media.readyState > HTMLMediaElement.HAVE_CURRENT_DATA) {
        return;
      }

      await this.media.play();
    } catch (err) {
      // Possibly NotAllowedError if no user gesture
      if (err instanceof Error && err.name === "NotAllowedError") {
        this._preferredPlaybackState = PlaybackState.Pause;
        this.onStateChange.emit(this._preferredPlaybackState);
      } else {
        console.error("MediaController: error while playing:", err);
      }
    }
  }

  /**
   * Set "preferred" playback to Pause, and pause the media.
   */
  public pause(): void {
    this._preferredPlaybackState = PlaybackState.Pause;
    this.onStateChange.emit(this._preferredPlaybackState);
    this.media.pause();
  }

  /**
   * Force a particular playback state: Play, Pause, or Ended.
   */
  public setPlaybackState(state: PlaybackState): void {
    if (this._preferredPlaybackState === state) {
      return;
    }
    this._preferredPlaybackState = state;
    this.onStateChange.emit(this._preferredPlaybackState);

    if (state === PlaybackState.Play) {
      void this.play();
    } else if (state === PlaybackState.Pause) {
      this.pause();
    } else if (state === PlaybackState.Ended) {
      this.media.pause();
    }
  }

  public getPlaybackState(): PlaybackState {
    return this._preferredPlaybackState;
  }

  /**
   * Basic buffering check: if readyState < HAVE_FUTURE_DATA => "Buffering"
   */
  public isBuffering(): boolean {
    return this.media.readyState < HTMLMediaElement.HAVE_FUTURE_DATA;
  }

  private _onPlaying(): void {
    // If we *prefer* Pause or Ended, then forcibly pause again
    if (this._preferredPlaybackState !== PlaybackState.Play) {
      this.media.pause();
    }
  }

  private _onPause(): void {
    // If we *prefer* Play, try to resume
    if (this._preferredPlaybackState === PlaybackState.Play) {
      void this.play();
    }
  }

  private _onEnded(): void {
    // The media ended on its own
    this._preferredPlaybackState = PlaybackState.Ended;
    this.onStateChange.emit(this._preferredPlaybackState);
  }

  private _onCanplay(): void {
    // Possibly we are no longer buffering:
    this._emitBufferingState();

    // If we prefer to play, ensure we are playing
    if (
      this._preferredPlaybackState === PlaybackState.Play && this.media.paused
    ) {
      void this.play();
    } else if (this._preferredPlaybackState === PlaybackState.Pause) {
      this.media.pause();
    }
  }

  private _onStalled(): void {
    // Possibly we are buffering
    this._emitBufferingState();
    // If prefer to play, re-attempt
    if (this._preferredPlaybackState === PlaybackState.Play) {
      void this.play();
    } else {
      this.media.pause();
    }
  }

  private _onTimeUpdate(): void {
    this.onTimeUpdate.emit(this.media.currentTime);
  }

  private _onDurationChange(): void {
    this.onDurationChange.emit(this.media.duration);
  }

  private _emitBufferingState(): void {
    const state = this.isBuffering()
      ? BufferingState.Buffering
      : BufferingState.Ready;
    this.onBufferingStateChange.emit(state);
  }
}
