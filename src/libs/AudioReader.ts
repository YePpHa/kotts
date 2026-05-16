import type { IRange } from "../types/IRange";
import type { IStreamingMedia } from "../types/IStreamingMedia";
import { concatBuffers } from "../utils/Buffer";

export type StreamData = {
  type: string;
  stream: ReadableStream<Uint8Array<ArrayBuffer>>;
};

export interface StreamChapter {
  timeRange: IRange;
  error?: unknown;
}

export class AudioReader {
  private _streams: AsyncIterable<StreamData, void, void>;

  constructor(streams: AsyncIterable<StreamData, void, void>) {
    this._streams = streams;
  }

  public async *load(audio: IStreamingMedia): AsyncGenerator<StreamChapter, void, void> {
    for await (const { type, stream } of this._streams) {
      const start = audio.duration;

      const reader = stream.getReader();
      const buffers: Uint8Array<ArrayBuffer>[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffers.push(value);
      }

      reader.releaseLock();

      let error: unknown;
      if (buffers.length > 0) {
        try {
          await audio.next(type, concatBuffers(buffers));
        } catch (err) {
          error = err;
        }
      }

      const end = audio.duration;

      yield {
        timeRange: {
          start,
          end,
        },
        error,
      };
    }

    audio.end();
  }
}
