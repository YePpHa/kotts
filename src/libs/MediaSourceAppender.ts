import { EventEmitter } from "./EventEmitter";
import { Media } from "./Media";

interface Operation {
  chunk: Uint8Array;
  resolve: () => void;
  reject: (error: unknown) => void;
}

export class MediaSourceAppender<T extends HTMLMediaElement> {
  public readonly onError = new EventEmitter<(error: unknown) => void>();

  private _media: Media<T>;

  private _abortController = new AbortController();

  private _mediaSource: MediaSource;
  private _mediaSourceOpen: Promise<void>;
  private _sourceBuffer: SourceBuffer | null = null;

  private _pendingOperations: Operation[] = [];

  constructor(media: Media<T>) {
    this._media = media;
    this._mediaSource = new MediaSource();
    this._mediaSourceOpen = new Promise<void>((resolve) => {
      this._mediaSource.addEventListener("sourceopen", () => resolve(), {
        signal: this._abortController.signal,
        once: true,
      });
    });

    this._media.media.src = URL.createObjectURL(this._mediaSource);
  }

  public [Symbol.dispose]() {
    this._abortController.abort();
    this._sourceBuffer = null;
    this._pendingOperations = [];

    if (this._mediaSource.readyState === "open") {
      this._mediaSource.endOfStream();
    }
  }

  public get duration(): number {
    if (this._sourceBuffer === null) {
      return 0;
    }

    return this._sourceBuffer.timestampOffset;
  }

  public async next(
    type: string,
    chunk: Uint8Array,
  ): Promise<void> {
    await this._mediaSourceOpen;

    if (this._sourceBuffer === null) {
      this._sourceBuffer = this._mediaSource.addSourceBuffer(type);
      this._sourceBuffer.mode = "sequence";

      this._sourceBuffer.addEventListener("updateend", () => {
        this._processNextOperation();
      }, { signal: this._abortController.signal });
    }

    if (this._media.error !== null) {
      throw this._media.error;
    }

    try {
      // Only remove old data if we're hitting quota errors
      if (this._sourceBuffer.buffered.length > 0) {
        const currentTime = this._media.currentTime;
        const start = this._sourceBuffer.buffered.start(0);

        // Only remove if we have a lot of historical data
        if (currentTime - start > 30) {
          const removeEnd = Math.max(start, currentTime - 15);
          if (removeEnd > start) {
            await this._removeBufferRange(start, removeEnd);
          }
        }
      }

      await this._appendChunk(chunk);
    } catch (err) {
      if (!(err instanceof Error)) {
        throw err;
      }

      if (err.name !== "QuotaExceededError") {
        throw err;
      }

      console.log("Quota exceeded, trying more aggressive cleanup");

      // If we hit quota, try more aggressive cleanup
      if (this._sourceBuffer.buffered.length > 0) {
        const currentTime = this._media.currentTime;
        const start = this._sourceBuffer.buffered.start(0);
        const removeEnd = Math.max(start, currentTime - 5);
        if (removeEnd > start) {
          await this._removeBufferRange(start, removeEnd);
          // Retry append after removing data
          try {
            await this._appendChunk(chunk);
          } catch (retryError) {
            console.warn("Buffer error after cleanup:", retryError);
          }
        }
      }
    }

    if (this._sourceBuffer.updating) {
      await new Promise<void>((resolve) => {
        if (this._sourceBuffer === null) {
          resolve();
          return;
        }

        this._sourceBuffer.addEventListener("updateend", () => {
          resolve();
        }, { once: true, signal: this._abortController.signal });
      });
    }
  }

  public end(): void {
    this._abortController.abort();
    this._sourceBuffer = null;
    this._pendingOperations = [];

    if (this._mediaSource.readyState === "open") {
      this._mediaSource.endOfStream();
    }
  }

  private async _removeBufferRange(start: number, end: number): Promise<void> {
    // Double check that end is greater than start
    if (end <= start) {
      console.warn("Invalid buffer remove range:", { start, end });
      return;
    }

    return new Promise((resolve) => {
      if (this._sourceBuffer === null) {
        return;
      }

      const doRemove = () => {
        if (this._sourceBuffer === null) {
          return;
        }

        try {
          this._sourceBuffer.remove(start, end);
        } catch (e) {
          this.onError.emit(e);
        }
        resolve();
      };

      if (this._sourceBuffer.updating) {
        this._sourceBuffer.addEventListener("updateend", () => {
          doRemove();
        }, { once: true, signal: this._abortController.signal });
      } else {
        doRemove();
      }
    });
  }

  private async _appendChunk(chunk: Uint8Array): Promise<void> {
    if (this._media.error) {
      return;
    }

    return new Promise((resolve, reject) => {
      if (this._sourceBuffer === null) {
        reject(new Error("SourceBuffer is null"));
        return;
      }
      const operation = { chunk, resolve, reject };
      this._pendingOperations.push(operation);

      if (!this._sourceBuffer.updating) {
        this._processNextOperation();
      }
    });
  }

  private _processNextOperation() {
    if (
      this._sourceBuffer === null || this._sourceBuffer.updating ||
      this._pendingOperations.length === 0
    ) {
      return;
    }

    if (this._media.error) {
      return;
    }

    const operation = this._pendingOperations.shift();
    if (!operation) {
      return;
    }

    try {
      this._sourceBuffer.appendBuffer(operation.chunk);
      operation.resolve();
    } catch (error) {
      operation.reject(error);
      if (error instanceof Error && error.name !== "InvalidStateError") {
        this._processNextOperation();
      }
    }
  }
}
