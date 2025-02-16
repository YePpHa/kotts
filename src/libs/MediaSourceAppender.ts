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

interface Operation {
  segment: StoredSegment;
  resolve: () => void;
  reject: (error: unknown) => void;
}

export class MediaSourceAppender<T extends HTMLMediaElement> {
  public readonly onError = new EventEmitter<(error: unknown) => void>();

  // Keep a list of segments that have arrived but not yet appended
  private _segments: StoredSegment[] = [];
  // Index of the next segment to flush
  private _nextSegmentIndex = 0;

  private _mediaController: MediaController<T>;
  private _mediaSource: MediaSource;
  private _mediaSourceOpen: Promise<void>;
  private _sourceBuffer: SourceBuffer | null = null;

  private _abortController = new AbortController();

  // A queue of actual "append" operations to the SourceBuffer.
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

  // If you want to decode audio for duration estimates, create an (Offline)AudioContext.
  // This is just an example; in real code you may want dynamic sample rates.
  private static _offlineAudioCtx = new window.OfflineAudioContext(
    2, // # of channels
    44100, // length (in sample-frames)
    44100, // sampleRate
  );

  constructor(mediaController: MediaController<T>) {
    this._mediaController = mediaController;
    this._mediaSource = new MediaSource();

    this._mediaSourceOpen = new Promise<void>((resolve) => {
      this._mediaSource.addEventListener("sourceopen", () => resolve(), {
        signal: this._abortController.signal,
        once: true,
      });
    });

    // Assign the MediaSource to the <video>/<audio> src
    this._mediaController.media.src = URL.createObjectURL(this._mediaSource);

    // Listen to MediaController events so we know when to flush, trim, etc.
    this._mediaController.onStateChange.add(this._handleStateChange.bind(this));
    this._mediaController.onBufferingStateChange.add((state) => this._handleBufferingStateChange(state));
    this._mediaController.onTimeUpdate.add(this._handleTimeUpdate.bind(this));
  }

  /**
   * Called by your reader for each chunk of data.
   * Because we might decode the audio to measure duration, this is async.
   */
  public async next(mimeType: string, chunk: Uint8Array): Promise<void> {
    // 1) Estimate the duration of this chunk (asynchronously)
    const chunkDuration = await this._estimateChunkDuration(chunk);

    // 2) Create a segment entry with the next available timestamp
    const segment: StoredSegment = {
      data: chunk,
      mimeType,
      timestamp: this._currentTimestamp,
      duration: chunkDuration,
    };

    // 3) Push it into our list of not-yet-appended segments
    this._segments.push(segment);

    // 4) Advance our timeline
    this._currentTimestamp += chunkDuration;
  }

  /**
   * Called by your reader once all chunks have been read.
   */
  public end(): void {
    this._inputEnded = true;
  }

  /**
   * Release resources if needed (dispose pattern).
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

  /**
   * Handle changes in PlaybackState (Play, Pause, Ended, etc.)
   * so we can decide whether to flush more data, etc.
   */
  private _handleStateChange(state: PlaybackState) {
    try {
      switch (state) {
        case PlaybackState.Play:
          // Attempt to flush any stored segments if user presses play
          this._flushSegments();
          break;
        case PlaybackState.Pause:
          // Possibly suspend segment flushing if paused (optional)
          break;
        case PlaybackState.Ended:
          // Possibly do final cleanup, if needed
          break;
      }
    } catch (err) {
      console.error(err);
      this.onError.emit(err);
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

  /**
   * Called whenever the media's currentTime changes (timeupdate).
   * We can trim the buffer behind currentTime to maintain a sliding window.
   */
  private _handleTimeUpdate(time: number) {
    try {
      // Remove data behind currentTime
      this._trimBuffer(false);
      // Optionally, flush new segments if playing
      if (this._mediaController.getPlaybackState() === PlaybackState.Play) {
        this._flushSegments();
      }
    } catch (err) {
      console.error(err);
      this.onError.emit(err);
    }
  }

  /**
   * Append all segments that haven't been appended yet.
   * We set the .timestampOffset before each append so
   * each segment is placed at the correct timeline position.
   */
  private async _flushSegments(): Promise<void> {
    await this._mediaSourceOpen;

    // If we have no SourceBuffer yet, create one based on the first segment
    // This assumes all segments have the same MIME type.
    // If you have multiple types, you'll need multiple SourceBuffers.
    if (!this._sourceBuffer && this._segments.length > 0) {
      const firstSegment = this._segments[0];
      this._sourceBuffer = this._mediaSource.addSourceBuffer(
        firstSegment.mimeType,
      );
      this._sourceBuffer.mode = "segments";

      this._sourceBuffer.addEventListener("updateend", () => {
        this._processNextOperation();
      }, { signal: this._abortController.signal });
    }

    // If there's an error on the media element, bail out
    if (this._mediaController.error) {
      return;
    }

    // Append segments in order until all are appended or we run into an error
    while (this._nextSegmentIndex < this._segments.length) {
      // Safety check: if we're updating or no SourceBuffer, break out
      if (!this._sourceBuffer || this._sourceBuffer.updating) {
        break;
      }

      const segment = this._segments[this._nextSegmentIndex];

      try {
        // Actually append segment data
        await this._appendChunk(segment);

        // Mark it done
        this._nextSegmentIndex++;

        // Maintain a sliding window behind currentTime
        await this._trimBuffer(false);
      } catch (err) {
        if (err instanceof Error && err.name === "QuotaExceededError") {
          // On QuotaExceededError, remove more behind the live point
          console.warn("Quota exceeded. Doing an aggressive trim...");
          await this._trimBuffer(true);
          // Retry appending same segment after trimming
          continue;
        } else {
          // Some other error
          console.error("Error appending segment:", err);
          this.onError.emit(err);
          break;
        }
      }
    }
  }

  /**
   * Actually queue an append operation for the given StoredSegment.
   */
  private async _appendChunk(segment: StoredSegment): Promise<void> {
    if (this._mediaController.error) {
      return;
    }

    return new Promise((resolve, reject) => {
      if (!this._sourceBuffer) {
        return reject(new Error("SourceBuffer is null"));
      }

      const operation = { segment, resolve, reject };
      this._pendingOperations.push(operation);

      // If the SourceBuffer is not busy, process immediately
      if (!this._sourceBuffer.updating) {
        this._processNextOperation();
      }
    });
  }

  /**
   * Called after "updateend" to append the next queued segment operation.
   */
  private _processNextOperation() {
    if (!this._sourceBuffer || this._sourceBuffer.updating) {
      return;
    }
    if (this._pendingOperations.length === 0) {
      return;
    }
    if (this._mediaController.error) {
      return;
    }

    const operation = this._pendingOperations.shift();
    if (!operation) {
      return;
    }

    try {
      this._sourceBuffer.timestampOffset = operation.segment.timestamp;
      this._sourceBuffer.appendBuffer(operation.segment.data);
      operation.resolve();
    } catch (error) {
      operation.reject(error);
      // If not an InvalidStateError, keep processing the queue
      if (error instanceof Error && error.name !== "InvalidStateError") {
        this._processNextOperation();
      }
    }
  }

  /**
   * Remove data behind the currentTime to maintain a sliding window,
   * or remove more aggressively if we hit QuotaExceededError.
   */
  private async _trimBuffer(aggressive = false): Promise<void> {
    if (!this._sourceBuffer || this._sourceBuffer.buffered.length === 0) {
      return;
    }
    const currentTime = this._mediaController.currentTime;

    // Decide how far behind currentTime to remove
    const start = this._sourceBuffer.buffered.start(0);
    const cutoff = aggressive
      ? currentTime - this.SLIDING_WINDOW_DURATION / 2
      : currentTime - this.SLIDING_WINDOW_DURATION;

    // Only remove if there's buffer behind "cutoff"
    if (cutoff > start) {
      await this._removeBufferRange(start, cutoff);
    }
  }

  /**
   * Utility for removing a time range from the SourceBuffer.
   */
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
   * Example: decoding audio to find the actual duration of the chunk.
   * This requires that each chunk is independently decodable!
   * If your chunks are partial, you may need to buffer them until you have a full container.
   *
   * This approach uses an OfflineAudioContext to decode. The chunk must be a complete audio frame.
   */
  private async _estimateChunkDuration(chunk: Uint8Array): Promise<number> {
    try {
      // Force a copy of the chunk data into a brand-new ArrayBuffer.
      // This ensures we get an ArrayBuffer (not a SharedArrayBuffer).
      const arrayBuffer = new ArrayBuffer(chunk.byteLength);
      new Uint8Array(arrayBuffer).set(chunk);

      // Attempt to decode.
      const audioBuffer = await MediaSourceAppender._offlineAudioCtx
        .decodeAudioData(arrayBuffer);
      // The decode gives us an AudioBuffer with .duration in seconds.
      return audioBuffer.duration;
    } catch (err) {
      console.error("Unable to decode audio chunk.", err);
      // If we fail to decode, return a fallback. Could be 0 or guess.
      return 0;
    }
  }
}
