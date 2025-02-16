import { EventEmitter } from "./EventEmitter";
import {
  BufferingState,
  MediaController,
  PlaybackState,
} from "./MediaController";

/**
 * This example shows how you might measure duration by decoding audio.
 * If your chunks are partial or if it’s a video format, you’ll need more complex logic.
 */

interface StoredSegment {
  data: Uint8Array;
  mimeType: string;
  timestamp: number; // The calculated start time of this segment
  duration: number; // Duration of this chunk
}

/** Represents either an offset change or a buffer append operation. */
type Operation =
  | {
    type: "offset";
    offset: number;
    resolve: () => void;
    reject: (error: unknown) => void;
  }
  | {
    type: "append";
    data: Uint8Array;
    resolve: () => void;
    reject: (error: unknown) => void;
  };

export class MediaSourceAppender<T extends HTMLMediaElement> {
  public readonly onError = new EventEmitter<(error: unknown) => void>();

  // Keep a list of segments that have arrived but not yet appended
  private _segments: StoredSegment[] = [];
  private _nextSegmentIndex = 0;

  private _mediaController: MediaController<T>;
  private _mediaSource: MediaSource;
  private _mediaSourceOpen: Promise<void>;
  private _sourceBuffer: SourceBuffer | null = null;

  private _abortController = new AbortController();

  // A queue of offset/append operations to the SourceBuffer
  private _pendingOperations: Operation[] = [];

  // How many seconds of past data to keep in the buffer behind currentTime
  private readonly SLIDING_WINDOW_DURATION = 60; // e.g. 60s behind

  // Track whether we've ended input (reader is done)
  private _inputEnded = false;

  /**
   * We accumulate the timeline position for each new chunk.
   * Each new segment is stamped with the sum of all previous segments' durations.
   */
  private _currentTimestamp = 0;

  // Example offline AudioContext for decoding. Replace or remove if not needed.
  private static _offlineAudioCtx = new (window.OfflineAudioContext ||
    (window as any).webkitOfflineAudioContext)(
    2, // # of channels
    44100, // length in sample-frames
    44100, // sampleRate
  );

  constructor(mediaController: MediaController<T>) {
    this._mediaController = mediaController;
    this._mediaSource = new MediaSource();

    // We'll fulfill this promise when 'sourceopen' fires
    this._mediaSourceOpen = new Promise<void>((resolve) => {
      this._mediaSource.addEventListener("sourceopen", () => resolve(), {
        signal: this._abortController.signal,
        once: true,
      });
    });

    // Assign the MediaSource to the <video>/<audio> element
    this._mediaController.media.src = URL.createObjectURL(this._mediaSource);

    // Listen to MediaController events so we can flush or trim buffers
    this._mediaController.onStateChange.add(this._handleStateChange.bind(this));
    this._mediaController.onBufferingStateChange.add((state) => this._handleBufferingStateChange(state));
    this._mediaController.onTimeUpdate.add(this._handleTimeUpdate.bind(this));
  }

  /**
   * Called by your reader for each chunk of data.
   * Because we might decode the audio to measure duration, this is async.
   */
  public async next(mimeType: string, chunk: Uint8Array): Promise<void> {
    // 1) Estimate the duration
    const chunkDuration = await this._estimateChunkDuration(chunk);

    // 2) Create a segment with an assigned timestamp
    const segment: StoredSegment = {
      data: chunk,
      mimeType,
      timestamp: this._currentTimestamp,
      duration: chunkDuration,
    };

    // 3) Store segment
    this._segments.push(segment);

    // 4) Advance timeline
    this._currentTimestamp += chunkDuration;
  }

  /**
   * Called by your reader once all chunks have been read.
   */
  public end(): void {
    this._inputEnded = true;
  }

  /**
   * Dispose pattern, if needed.
   */
  public [Symbol.dispose]() {
    this._abortController.abort();
    this._sourceBuffer = null;
    this._pendingOperations = [];

    if (this._mediaSource.readyState === "open") {
      this._mediaSource.endOfStream();
    }
  }

  public get duration(): number {
    if (this._segments.length === 0) {
      return 0;
    }

    const lastSegment = this._segments[this._segments.length - 1];
    return lastSegment.timestamp + lastSegment.duration;
  }

  /** Handle play/pause/ended events */
  private _handleStateChange(state: PlaybackState) {
    switch (state) {
      case PlaybackState.Play:
        // Attempt to flush any stored segments if user presses play
        this._flushSegments();
        break;
      case PlaybackState.Pause:
        // Possibly suspend segment flushing if paused
        break;
      case PlaybackState.Ended:
        // Possibly do final cleanup, if needed
        break;
    }
  }

  private _handleBufferingStateChange(state: BufferingState) {
    try {
      switch (state) {
        case BufferingState.Buffering:
          this._flushSegments();
          break;
        case BufferingState.Ready:
          // If we're ready, we might want to resume appending
          break;
      }
    } catch (err) {
      console.error(err);
      this.onError.emit(err);
    }
  }

  /** Called on each timeupdate event to maintain a sliding window etc. */
  private _handleTimeUpdate(time: number) {
    // Clean older data
    this._trimBuffer(false);
    // Optionally flush new segments
    if (this._mediaController.getPlaybackState() === PlaybackState.Play) {
      this._flushSegments();
    }
  }

  /**
   * For each un-flushed segment, queue up an offset operation and then an append operation.
   */
  private async _flushSegments(): Promise<void> {
    await this._mediaSourceOpen;

    // If we have no SourceBuffer yet, create one from the first segment
    if (!this._sourceBuffer && this._segments.length > 0) {
      const firstSegment = this._segments[0];
      this._sourceBuffer = this._mediaSource.addSourceBuffer(
        firstSegment.mimeType,
      );
      this._sourceBuffer.mode = "sequence";

      // We'll call _processNextOperation after each updateend
      this._sourceBuffer.addEventListener("updateend", () => {
        this._processNextOperation();
      }, { signal: this._abortController.signal });
    }

    // If there's an error on the media element, bail
    if (this._mediaController.error) {
      return;
    }

    // Add offset+append ops for all remaining segments
    while (this._nextSegmentIndex < this._segments.length) {
      const segment = this._segments[this._nextSegmentIndex];

      // 1) Queue an operation to set the timestampOffset
      this._pendingOperations.push({
        type: "offset",
        offset: segment.timestamp,
        resolve: () => {},
        reject: () => {},
      });

      // 2) Queue an operation to append the data
      this._pendingOperations.push({
        type: "append",
        data: segment.data,
        resolve: () => {},
        reject: () => {},
      });

      this._nextSegmentIndex++;
    }

    // Kick off the queue
    if (this._sourceBuffer && !this._sourceBuffer.updating) {
      this._processNextOperation();
    }
  }

  /**
   * Walks through the queue of operations (offset or append) and executes them in order,
   * waiting for the SourceBuffer to finish updating between operations.
   */
  private _processNextOperation() {
    // If we have no buffer or it's busy, do nothing yet
    if (!this._sourceBuffer || this._sourceBuffer.updating) {
      return;
    }
    if (this._mediaController.error) {
      return;
    }
    if (this._pendingOperations.length === 0) {
      return;
    }

    const operation = this._pendingOperations.shift();
    if (!operation) {
      return;
    }

    // Perform the operation
    if (operation.type === "offset") {
      try {
        // We can only set the offset if the buffer is NOT parsing a segment
        // (which we verified above, because .updating === false).
        this._sourceBuffer.timestampOffset = operation.offset;
        operation.resolve();
        // Move on to the next op
        this._processNextOperation();
      } catch (error) {
        operation.reject(error);
        this.onError.emit(error);
      }
    } else if (operation.type === "append") {
      try {
        this._sourceBuffer.appendBuffer(operation.data);
        // The actual completion (resolve) happens once 'updateend' fires
        // so we do that in the event listener (which calls _processNextOperation).
        operation.resolve();
      } catch (error) {
        operation.reject(error);
        if (error instanceof Error && error.name !== "InvalidStateError") {
          // Keep processing so the queue isn't stuck
          this._processNextOperation();
        }
        this.onError.emit(error);
      }
    }
  }

  /** Remove data behind the currentTime to maintain a sliding window */
  private async _trimBuffer(aggressive = false): Promise<void> {
    if (!this._sourceBuffer || this._sourceBuffer.buffered.length === 0) {
      return;
    }
    const currentTime = this._mediaController.currentTime;

    const start = this._sourceBuffer.buffered.start(0);
    const cutoff = aggressive
      ? currentTime - this.SLIDING_WINDOW_DURATION / 2
      : currentTime - this.SLIDING_WINDOW_DURATION;

    if (cutoff > start) {
      await this._removeBufferRange(start, cutoff);
    }
  }

  /** Utility to remove a time range from the SourceBuffer safely */
  private async _removeBufferRange(start: number, end: number): Promise<void> {
    if (!this._sourceBuffer || end <= start) {
      return;
    }

    return new Promise((resolve) => {
      if (!this._sourceBuffer) {
        resolve();
        return;
      }

      const doRemove = () => {
        if (!this._sourceBuffer) {
          resolve();
          return;
        }
        try {
          this._sourceBuffer.remove(start, end);
        } catch (error) {
          this.onError.emit(error);
        }
        resolve();
      };

      if (this._sourceBuffer.updating) {
        this._sourceBuffer.addEventListener("updateend", doRemove, {
          once: true,
          signal: this._abortController.signal,
        });
      } else {
        doRemove();
      }
    });
  }

  /**
   * Example method to decode audio and find the actual duration of the chunk.
   * If your chunks are partial or from a video container, you'll need more complex logic.
   */
  private async _estimateChunkDuration(chunk: Uint8Array): Promise<number> {
    try {
      // Force a copy of the chunk data into a brand-new ArrayBuffer.
      const arrayBuffer = new ArrayBuffer(chunk.byteLength);
      new Uint8Array(arrayBuffer).set(chunk);

      // Attempt to decode in an OfflineAudioContext
      const audioBuffer = await MediaSourceAppender._offlineAudioCtx
        .decodeAudioData(arrayBuffer);
      return audioBuffer.duration; // in seconds
    } catch (err) {
      console.error("Unable to decode audio chunk.", err);
      return 0; // fallback
    }
  }
}
