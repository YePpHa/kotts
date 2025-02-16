import { EventEmitter } from "./EventEmitter";
import {
  BufferingState,
  MediaController,
  PlaybackState,
} from "./MediaController";

/**
 * This revised version keeps a master array of all segments (`_segments`) but only appends
 * those needed for the current playback window.
 *
 * The general approach:
 *
 * 1) On seeking:
 *    - Cancel current append operations
 *    - Identify which segments are needed from [seekTime, seekTime + FUTURE_BUFFER_SECONDS]
 *    - Queue those segments
 *    - Flush
 *
 * 2) On timeupdate (while playing):
 *    - Ensure the next portion (from currentTime to currentTime + FUTURE_BUFFER_SECONDS)
 *      is buffered or at least enqueued
 *    - Flush
 *    - Optionally remove older segments behind the playhead if desired.
 *
 * 3) On QuotaExceededError or other triggers:
 *    - Remove old data behind currentTime more aggressively.
 *
 * This example code is simplified; a real solution may fetch segments from the server on-demand
 * instead of storing them all in `_segments`.
 */

interface StoredSegment {
  data: Uint8Array;
  mimeType: string;
  timestamp: number; // The calculated start time of this segment
  duration: number; // Duration of this chunk
}

/**
 * This interface is used internally to queue actual appends to SourceBuffer.
 */
interface Operation {
  segment: StoredSegment;
  resolve: () => void;
  reject: (error: unknown) => void;
}

export class MediaSourceAppender<T extends HTMLMediaElement> {
  public readonly onError = new EventEmitter<(error: unknown) => void>();

  /**
   * A master list of all segments we have. The user or the code might push them here.
   * In a real app, you might not store them all in memory. Instead, you'd keep references
   * (URLs) or partial data and fetch them on demand.
   */
  private _segments: StoredSegment[] = [];

  // This is the portion that we plan to append next.
  private _segmentsToAppend: StoredSegment[] = [];
  private _segmentsToAppendIndex = 0;

  // We'll store how far we've read segments from the source (just for demonstration)
  private _currentTimestamp = 0;

  private _mediaController: MediaController<T>;
  private _mediaSource: MediaSource;
  private _mediaSourceOpen: Promise<void>;
  private _sourceBuffer: SourceBuffer | null = null;
  private _abortController = new AbortController();

  // A queue of actual "append" operations (offset+append) on the SourceBuffer.
  private _pendingOperations: Operation[] = [];

  // Keep a sliding window of X seconds behind the currentTime
  private readonly SLIDING_WINDOW_DURATION = 60; // e.g. keep 60s behind
  // We also want to buffer up to X seconds ahead of the playhead
  private readonly FUTURE_BUFFER_SECONDS = 30; // e.g. buffer 30s ahead

  // Track whether we've ended input (the reader is done producing segments)
  private _inputEnded = false;

  // If you want to decode audio for duration estimates, create an (Offline)AudioContext.
  private static _offlineAudioCtx = new (window.OfflineAudioContext ||
    (window as any).webkitOfflineAudioContext)(
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

    // Assign the MediaSource to the <video>/<audio> element
    this._mediaController.media.src = URL.createObjectURL(this._mediaSource);

    // Listen to MediaController events so we can handle seeking, time updates, etc.
    this._mediaController.onStateChange.add((state) => this._handleStateChange(state));
    this._mediaController.onTimeUpdate.add((time) => this._handleTimeUpdate(time));

    // If your MediaController has an onSeeking event, attach it:
    this._mediaController.onSeeking.add((time) => this._handleSeeking(time));
  }

  /**
   * Called by your reader for each chunk of data.
   * Because we might decode audio to measure duration, this is async.
   */
  public async next(mimeType: string, chunk: Uint8Array): Promise<void> {
    // 1) Estimate the duration of this chunk.
    const chunkDuration = await this._estimateChunkDuration(chunk);

    // 2) Create a segment entry with the next available timestamp
    const segment: StoredSegment = {
      data: chunk,
      mimeType,
      timestamp: this._currentTimestamp,
      duration: chunkDuration,
    };

    // 3) Add it to our master array of segments
    this._segments.push(segment);

    // 4) Advance the timeline so the next chunk is placed after this one.
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
    this._sourceBuffer?.abort();
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
   * Cancel current append operations. This will clear the queue,
   * but note we do not forcibly abort the SourceBuffer if it's currently updating.
   * (One could do _sourceBuffer.abort() if needed, but that might require other checks.)
   */
  private _cancelAppending() {
    // Clear pending operations
    this._pendingOperations = [];
    // Also clear anything in our segments-to-append list
    this._segmentsToAppend = [];
    this._segmentsToAppendIndex = 0;
  }

  /**
   * On seeking:
   *  1) Cancel current operations
   *  2) Determine which segments are needed from [seekTime, seekTime + FUTURE_BUFFER_SECONDS]
   *  3) Enqueue those segments
   *  4) Flush
   */
  private _handleSeeking(time: number) {
    // 1) Cancel current operations
    this._cancelAppending();

    // 2) Make sure we have the relevant segments queued.
    this._ensureSegmentsForRange(time, time + this.FUTURE_BUFFER_SECONDS);

    // 3) Flush them
    this._flushSegments();
  }

  private _handleStateChange(state: PlaybackState): void {
    if (state !== PlaybackState.Play) {
      return;
    }

    this._handleTimeUpdate(this._mediaController.currentTime);
  }

  /**
   * On timeupdate (fired frequently as playback progresses):
   *  1) Maintain a sliding window
   *  2) If playing, ensure the next future window is buffered
   *  3) Flush any newly queued segments
   */
  private _handleTimeUpdate(time: number) {
    // 1) Possibly remove older data behind currentTime
    // We'll do this only if it doesn't break short rewinds.
    this._trimBuffer(false);

    // 2) If user is playing, ensure we buffer up to [time, time + FUTURE_BUFFER_SECONDS]
    if (this._mediaController.getPlaybackState() === PlaybackState.Play) {
      this._ensureSegmentsForRange(time, time + this.FUTURE_BUFFER_SECONDS);
    }

    // 3) Flush new segments
    this._flushSegments();
  }

  /**
   * Identify segments that fall within [start, end) and queue them if they are not buffered.
   */
  private _ensureSegmentsForRange(start: number, end: number) {
    // For each segment in the master array:
    for (const seg of this._segments) {
      const segStart = seg.timestamp;
      const segEnd = seg.timestamp + seg.duration;

      // Check if it overlaps [start, end)
      if (segEnd > start && segStart < end) {
        // If it's not already buffered:
        if (
          !this._isTimeBuffered(segStart) ||
          !this._isTimeBuffered(segEnd - 0.01)
        ) {
          // Also check if we already queued it
          const alreadyQueued = this._segmentsToAppend.includes(seg);
          if (!alreadyQueued) {
            // Add to the list of segments to be appended
            this._segmentsToAppend.push(seg);
          }
        }
      }
    }
  }

  /**
   * Flushes any segments in _segmentsToAppend that haven't been appended yet.
   * We'll do it in chronological order.
   */
  private async _flushSegments(): Promise<void> {
    await this._mediaSourceOpen;

    // If we have no SourceBuffer yet, create one from the first segment we plan to append
    if (!this._sourceBuffer && this._segmentsToAppend.length > 0) {
      const firstSeg = this._segmentsToAppend[0];
      this._sourceBuffer = this._mediaSource.addSourceBuffer(firstSeg.mimeType);

      this._sourceBuffer.addEventListener("updateend", () => {
        this._processNextOperation();
      }, { signal: this._abortController.signal });
    }

    // If there's an error on the media element, bail.
    if (this._mediaController.error) {
      return;
    }

    // Add each new segment from _segmentsToAppend, from _segmentsToAppendIndex onward.
    while (this._segmentsToAppendIndex < this._segmentsToAppend.length) {
      // If we're busy or no sourceBuffer, break.
      if (!this._sourceBuffer || this._sourceBuffer.updating) {
        break;
      }

      const seg = this._segmentsToAppend[this._segmentsToAppendIndex];

      // 1) Set timestampOffset to seg.timestamp.
      //    Must do this only when .updating is false.
      try {
        this._sourceBuffer.timestampOffset = seg.timestamp;
      } catch (e) {
        console.warn("Failed to set timestampOffset.", e);
        // Possibly means we can't set offset now.
      }

      // 2) Actually append.
      try {
        await this._appendChunk(seg);
        // Mark it done.
        this._segmentsToAppendIndex++;

        // Possibly trim if needed.
        await this._trimBuffer(false);
      } catch (err) {
        if (err instanceof Error && err.name === "QuotaExceededError") {
          console.warn("Quota exceeded: remove old data.");
          await this._trimBuffer(true);
          // Retry appending the same segment after trimming
          continue;
        } else {
          console.error("Error appending segment:", err);
          this.onError.emit(err);
          break;
        }
      }
    }
  }

  /**
   * Actually queue an append operation for the given segment.
   * We'll set up the Operation, then if .updating === false, we do the actual .appendBuffer().
   */
  private async _appendChunk(segment: StoredSegment): Promise<void> {
    if (this._mediaController.error) {
      return;
    }

    return new Promise((resolve, reject) => {
      if (!this._sourceBuffer) {
        return reject(new Error("SourceBuffer is null"));
      }

      const operation: Operation = { segment, resolve, reject };
      this._pendingOperations.push(operation);

      if (!this._sourceBuffer.updating) {
        this._processNextOperation();
      }
    });
  }

  /**
   * Called after "updateend". We'll append the next queued Operation if any.
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
    if (!operation) return;

    try {
      this._sourceBuffer.appendBuffer(operation.segment.data);
      operation.resolve();
    } catch (error) {
      operation.reject(error);
      if (error instanceof Error && error.name !== "InvalidStateError") {
        // Continue processing the queue so we don't get stuck
        this._processNextOperation();
      }
    }
  }

  /**
   * Removes data behind the currentTime, or more aggressively if we get QuotaExceededError.
   */
  private async _trimBuffer(aggressive = false): Promise<void> {
    if (!this._sourceBuffer || this._sourceBuffer.buffered.length === 0) {
      return;
    }
    const currentTime = this._mediaController.currentTime;

    // Decide how far behind currentTime to remove.
    const start = this._sourceBuffer.buffered.start(0);
    const cutoff = aggressive
      ? currentTime - this.SLIDING_WINDOW_DURATION / 2
      : currentTime - this.SLIDING_WINDOW_DURATION;

    if (cutoff > start) {
      await this._removeBufferRange(start, cutoff);
    }
  }

  /**
   * Utility for removing data in [start, end) from the SourceBuffer.
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
   * This requires that each chunk is independently decodable.
   * If your chunks are partial, you may need to buffer them until you have a full container.
   */
  private async _estimateChunkDuration(chunk: Uint8Array): Promise<number> {
    try {
      // Force a copy of the chunk data into a brand-new ArrayBuffer.
      const arrayBuffer = new ArrayBuffer(chunk.byteLength);
      new Uint8Array(arrayBuffer).set(chunk);

      // Attempt to decode.
      const audioBuffer = await MediaSourceAppender._offlineAudioCtx
        .decodeAudioData(arrayBuffer);
      return audioBuffer.duration; // in seconds
    } catch (err) {
      console.error("Unable to decode audio chunk.", err);
      return 0;
    }
  }

  /**
   * Quick helper to check if a specific time is already in the buffered range.
   */
  private _isTimeBuffered(time: number): boolean {
    if (!this._sourceBuffer) return false;
    const sb = this._sourceBuffer;
    for (let i = 0; i < sb.buffered.length; i++) {
      const start = sb.buffered.start(i);
      const end = sb.buffered.end(i);
      if (time >= start && time < end) {
        return true;
      }
    }
    return false;
  }
}
