/**
 * StreamingAudio.ts
 *
 * A multi-chunk orchestrator that:
 *  - uses OfflineAudioContext to measure chunk durations,
 *  - appends them in sequence,
 *  - delegates actual media logic to MediaController,
 *  - tracks a single "preferred" playback state for the entire timeline.
 */

import { EventEmitter } from "./EventEmitter";
import {
  BufferingState,
  MediaController,
  PlaybackState,
} from "./MediaController";

/**
 * Definition of a chunk of audio in the streaming timeline.
 */
export interface AudioChunk {
  /** MIME type of the chunk (e.g., 'audio/mpeg', 'audio/ogg'). */
  type: string;

  /** Binary data for this chunk. */
  data: Uint8Array;

  /**
   * Start time (seconds) in the overall timeline where this chunk will begin.
   * This is assigned by the player based on previously buffered duration.
   */
  start: number;

  /**
   * End time (seconds) in the overall timeline where this chunk ends
   * (i.e. start + duration).
   */
  end: number;

  objectUrl?: string;

  mediaController?: MediaController<HTMLAudioElement>;
}

export class StreamingAudio {
  // --- Public event emitters ---
  public readonly onStateChange = new EventEmitter<
    (state: PlaybackState) => void
  >();
  public readonly onBufferingStateChange = new EventEmitter<
    (state: BufferingState) => void
  >();
  public readonly onTimeUpdate = new EventEmitter<(time: number) => void>();
  public readonly onDurationChange = new EventEmitter<
    (duration: number) => void
  >();
  public readonly onBufferAppended = new EventEmitter<() => void>();
  public readonly onBufferEnd = new EventEmitter<() => void>();
  public readonly onSeeking = new EventEmitter<(time: number) => void>();

  private _chunks: AudioChunk[] = [];
  private _duration: number = 0; // sum of chunk durations
  private _currentTime: number = 0; // global playback position
  private _ended: boolean = false; // whether we've called .end()

  // The top-level "preferred" state for the entire timeline:
  private _preferredPlaybackState: PlaybackState = PlaybackState.Pause;

  private _bufferingState: BufferingState = BufferingState.Ready;

  // Index of whichever chunk is currently active (-1 if none)
  private _currentChunkIndex: number = -1;

  private _offlineContext = new OfflineAudioContext(2, 2, 44100);

  public [Symbol.dispose]() {
    // Stop everything, remove resources
    this._preferredPlaybackState = PlaybackState.Pause;
    this.onStateChange.emit(PlaybackState.Pause);

    // Dispose each chunk’s mediaController
    for (const chunk of this._chunks) {
      if (chunk.mediaController) {
        chunk.mediaController[Symbol.dispose]();
        chunk.mediaController = undefined;
      }
      if (chunk.objectUrl) {
        URL.revokeObjectURL(chunk.objectUrl);
        chunk.objectUrl = undefined;
      }
    }

    // Clear arrays
    this._chunks = [];

    // Clear event emitters
    this.onStateChange.clear();
    this.onBufferingStateChange.clear();
    this.onTimeUpdate.clear();
    this.onDurationChange.clear();
    this.onBufferAppended.clear();
    this.onBufferEnd.clear();
    this.onSeeking.clear();
  }

  public get duration(): number {
    return this._duration;
  }

  public get currentTime(): number {
    const chunk = this._chunks.at(this._currentChunkIndex);
    if (!chunk || !chunk.mediaController) {
      return this._currentTime;
    }

    return chunk.start + chunk.mediaController.currentTime;
  }

  public set currentTime(value: number) {
    this._seekTo(value);
  }

  public get endedPlayback(): boolean {
    return this._preferredPlaybackState === PlaybackState.Ended;
  }

  public get paused(): boolean {
    return this._preferredPlaybackState !== PlaybackState.Play;
  }

  /**
   * Append a chunk of audio data. We decode with OfflineAudioContext
   * to find out how long the chunk is, then push it onto the timeline.
   */
  public async next(type: string, data: Uint8Array): Promise<void> {
    const chunkDuration = await this._decodeAudioDuration(type, data);

    const start = this._duration;
    const end = start + chunkDuration;
    const chunk: AudioChunk = { type, data, start, end };
    this._chunks.push(chunk);

    this._duration = end;
    this.onBufferAppended.emit();
    this.onDurationChange.emit(this._duration);

    // If we were waiting for data to cover currentTime, we might resume:
    this._maybeResumePlayback();
  }

  /**
   * Signal that no more chunks will arrive.
   */
  public end(): void {
    this._ended = true;
    this.onBufferEnd.emit();

    // If we're stuck waiting, we might finalize as ended if currentTime >= duration
    if (this._currentTime >= this._duration) {
      this.setPlaybackState(PlaybackState.Ended);
    }
  }

  // --- Playback Control ---

  public async play(): Promise<void> {
    if (this._preferredPlaybackState === PlaybackState.Ended) {
      // if we're already ended, we set currentTime to 0
      this._seekTo(0);
    }

    this._preferredPlaybackState = PlaybackState.Play;
    this.onStateChange.emit(this._preferredPlaybackState);

    // Attempt to play the active chunk
    await this._selectActiveChunkAndPlay();
  }

  public pause(): void {
    if (this._preferredPlaybackState === PlaybackState.Ended) {
      // pausing when ended does nothing
      return;
    }

    this._preferredPlaybackState = PlaybackState.Pause;
    this.onStateChange.emit(this._preferredPlaybackState);

    // Pause the current chunk’s controller
    const chunk = this._chunks.at(this._currentChunkIndex);
    if (chunk?.mediaController) {
      chunk.mediaController.setPlaybackState(PlaybackState.Pause);
    }
  }

  public setPlaybackState(state: PlaybackState): void {
    if (this._preferredPlaybackState === state) {
      return;
    }

    if (state === PlaybackState.Ended) {
      this._preferredPlaybackState = state;
      this.onStateChange.emit(this._preferredPlaybackState);

      // forcibly end
      const chunk = this._chunks.at(this._currentChunkIndex);
      if (chunk?.mediaController) {
        chunk.mediaController.setPlaybackState(PlaybackState.Ended);
      }
    } else if (state === PlaybackState.Play) {
      void this.play();
    } else {
      this.pause();
    }
  }

  public getPlaybackState(): PlaybackState {
    return this._preferredPlaybackState;
  }

  public getBufferingState(): BufferingState {
    return this._bufferingState;
  }

  /**
   * Offline decode to determine chunk duration.
   */
  private async _decodeAudioDuration(
    type: string,
    data: Uint8Array,
  ): Promise<number> {
    const arrayBuffer = data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength,
    );
    const audioBuffer = await this._offlineContext.decodeAudioData(
      arrayBuffer as ArrayBuffer,
    );
    return audioBuffer.duration;
  }

  /**
   * Seek to a position in the overall timeline.
   */
  private _seekTo(value: number): void {
    this._currentTime = value;

    // If we’re beyond known data:
    if (this._currentTime > this._duration) {
      if (!this._ended) {
        // Not ended => we wait for more data
      } else {
        // ended => clamp to final end
        this._currentTime = this._duration;
        this.setPlaybackState(PlaybackState.Ended);
      }
    }

    this.onSeeking.emit(this._currentTime);
    this.onTimeUpdate.emit(this._currentTime);

    // If we still have data for this time, select that chunk & set offset
    if (this._currentTime <= this._duration && !this.endedPlayback) {
      void this._selectChunkForCurrentTime(true);
    }
  }

  /**
   * If we prefer play, find the chunk for currentTime, ensure we have a controller,
   * and set its playback state to Play.
   */
  private async _selectActiveChunkAndPlay(): Promise<void> {
    if (this._preferredPlaybackState !== PlaybackState.Play) {
      return;
    }

    await this._selectChunkForCurrentTime();
    const chunk = this._chunks.at(this._currentChunkIndex);
    if (chunk?.mediaController) {
      chunk.mediaController.setPlaybackState(PlaybackState.Play);
    }
  }

  /**
   * Picks the chunk covering _currentTime (if any). If we change chunks,
   * we initialize a MediaController if needed and set the correct local offset.
   */
  private async _selectChunkForCurrentTime(
    force: boolean = false,
  ): Promise<void> {
    const idx = this._findChunkIndexForTime(this._currentTime);
    if (idx === this._currentChunkIndex && !force) {
      return;
    }

    if (idx < 0 && !this._ended) {
      // We're waiting => buffer
      this._emitBufferingState(BufferingState.Buffering);
      this._currentChunkIndex = -1;
      return;
    }

    if (idx < 0 && this._ended) {
      this.setPlaybackState(PlaybackState.Ended);
      return;
    }

    // Pause the current chunk
    const currentChunk = this._chunks.at(this._currentChunkIndex);

    // Switch to the new chunk before setting playback state on old chunk to
    // prevent the old chunk from telling us it paused.
    this._currentChunkIndex = idx;

    if (currentChunk?.mediaController) {
      currentChunk.mediaController.setPlaybackState(PlaybackState.Pause);
    }

    await this._ensureMediaController(idx);

    // Adjust the local time
    const chunk = this._chunks[idx];
    const mediaController = chunk.mediaController;
    if (!mediaController) {
      throw new Error("MediaController not initialized for chunk");
    }

    const localOffset = this._currentTime - chunk.start;
    mediaController.currentTime = localOffset;

    // Set the chunk's preferred state to match ours (play/pause/ended)
    if (this._preferredPlaybackState === PlaybackState.Play) {
      mediaController.setPlaybackState(PlaybackState.Play);
    } else if (this._preferredPlaybackState === PlaybackState.Pause) {
      mediaController.setPlaybackState(PlaybackState.Pause);
    } else if (this._preferredPlaybackState === PlaybackState.Ended) {
      mediaController.setPlaybackState(PlaybackState.Ended);
    }
  }

  /**
   * Create the MediaController for the chunk if not already done,
   * and hook up event listeners.
   */
  private async _ensureMediaController(idx: number): Promise<void> {
    const chunk = this._chunks.at(idx);
    if (!chunk || chunk.mediaController) {
      return;
    }

    // 1) Create an <audio> element from the chunk data
    const blob = new Blob([chunk.data], { type: chunk.type });
    const url = URL.createObjectURL(blob);
    chunk.objectUrl = url;

    const audio = new Audio(url);
    audio.preload = "auto";
    audio.hidden = true;
    audio.autoplay = false;

    // 2) Wrap in MediaController
    const controller = new MediaController(audio);
    chunk.mediaController = controller;

    // 3) Listen to events
    controller.onTimeUpdate.add((localTime) => {
      if (this._currentChunkIndex !== idx) {
        return;
      }

      // Convert localTime => global
      this._currentTime = chunk.start + localTime;
      this.onTimeUpdate.emit(this._currentTime);
    });

    controller.onStateChange.add((state) => {
      if (this._currentChunkIndex !== idx) {
        return;
      }

      // If chunk ended => check if we have next chunk
      if (state === PlaybackState.Ended) {
        this._onChunkEnded(idx);
      } else if (
        state === PlaybackState.Play || state === PlaybackState.Pause
      ) {
        // If the chunk spontaneously paused but we prefer play, or vice versa,
        // the MediaController will keep trying to enforce local preference.
        // But *our* streaming audio is the top-level boss.
        // Typically we do NOT forcibly override here unless we want more complexity.
      }
      // If user forcibly ended chunk while the top-level was in play, we might
      // want to unify that logic, but let's keep it simple.
    });

    controller.onBufferingStateChange.add((bufState) => {
      if (this._currentChunkIndex !== idx) {
        return;
      }

      // If this chunk is the current chunk, forward the buffering state
      if (idx === this._currentChunkIndex) {
        this._emitBufferingState(bufState);
      }
    });
  }

  /**
   * Called when the chunk’s MediaController transitions to ended.
   */
  private async _onChunkEnded(chunkIndex: number): Promise<void> {
    const nextIndex = chunkIndex + 1;
    // If we have a next chunk, move to it
    if (nextIndex < this._chunks.length) {
      // Jump currentTime to the end of this chunk
      this._currentTime = this._chunks[chunkIndex].end;
      this.onTimeUpdate.emit(this._currentTime);
      this._currentChunkIndex = nextIndex;

      await this._ensureMediaController(nextIndex);

      const nextChunk = this._chunks.at(nextIndex);
      if (!nextChunk) {
        throw new Error("Next chunk not found");
      }
      const mediaController = nextChunk.mediaController;
      if (!mediaController) {
        throw new Error("Next chunk's MediaController not initialized");
      }

      mediaController.currentTime = 0;
      if (this._preferredPlaybackState === PlaybackState.Play) {
        mediaController.setPlaybackState(PlaybackState.Play);
      }
    } else {
      // No more chunks. If we've called end() and currentTime >= duration,
      // we finalize the entire playback as ended
      if (this._ended && this._currentTime >= this._duration) {
        this.setPlaybackState(PlaybackState.Ended);
      } else {
        // Otherwise, we are "waiting for more data" => buffering
        this._emitBufferingState(BufferingState.Buffering);
      }
    }
  }

  /**
   * If we are "Play" preference but no chunk covers currentTime, we might wait
   * for new data. Once new data arrives covering that time, we resume.
   */
  private _maybeResumePlayback(): void {
    if (this._preferredPlaybackState === PlaybackState.Play) {
      void this._selectActiveChunkAndPlay();
    }
  }

  private _findChunkIndexForTime(time: number): number {
    return this._chunks.findIndex((c) => time >= c.start && time < c.end);
  }

  private _emitBufferingState(state: BufferingState): void {
    this._bufferingState = state;
    this.onBufferingStateChange.emit(state);
  }
}
