import { AudioStream, StreamChapter, type StreamData } from "../libs/AudioStream";
import { EventEmitter } from "../libs/EventEmitter";
import { PlaybackState } from "../libs/MediaController";
import type { ITTSApiService, TTSResponse } from "../types/ITTSApiService";

export class AudioService {
  public readonly onTimeUpdate = new EventEmitter<(currentTime: number) => void>();
  public readonly onDurationChange = new EventEmitter<(duration: number) => void>();
  public readonly onStateChange = new EventEmitter<(state: PlaybackState) => void>();

  private _audioStream: AudioStream;

  private _ttsApiService: ITTSApiService;
  private _ttsResponses: TTSResponse[] = [];

  private _abortController = new AbortController();

  constructor(ttsApiService: ITTSApiService, texts: Iterable<string, void, void>|AsyncIterable<string, void, void>) {
    this._ttsApiService = ttsApiService;

    this._audioStream = new AudioStream(this._createStreams(texts), {
      autoPlay: true
    });
    this._audioStream.onTimeUpdate.add((currentTime) => this.onTimeUpdate.emit(currentTime));
    this._audioStream.onStateChange.add((state) => this.onStateChange.emit(state));
    this._audioStream.onDurationChange.add((duration) => this.onDurationChange.emit(duration));
  }

  public [Symbol.dispose]() {
    this._audioStream[Symbol.dispose]();
    this._abortController.abort();
  }

  public get currentTime(): number {
    return this._audioStream.currentTime;
  }

  public set currentTime(value: number) {
    this._audioStream.currentTime = value;
  }

  public get duration(): number {
    return this._audioStream.duration;
  }

  public play(): void {
    this._audioStream.play();
  }

  public pause(): void {
    this._audioStream.pause();
  }

  public getStreamChapters(): StreamChapter[] {
    return this._audioStream.getStreamChapters();
  }

  public getTtsResponses(): TTSResponse[] {
    return this._ttsResponses;
  }

  private async *_createStreams(texts: Iterable<string, void, void>|AsyncIterable<string, void, void>): AsyncIterable<StreamData, void, void> {
    for await (const text of texts) {
      const ttsResponse = await this._ttsApiService.createSpeech(text, {
        abortSignal: this._abortController.signal
      });
      this._ttsResponses.push(ttsResponse);
      yield {
        type: ttsResponse.contentType,
        stream: ttsResponse.content
      };
    }
  }

  public seekToIndex(index: number): void {

  }
}