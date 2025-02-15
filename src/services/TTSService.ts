import { EventEmitter } from "../libs/EventEmitter";
import { PlaybackState } from "../libs/Media";
import { IRange } from "../types/IRange";
import type { ITextExtractor, TextSegment } from "../types/ITextExtractor";
import type { ITTSApiService } from "../types/ITTSApiService";
import { AudioService } from "./AudioService";
import { HighligherService } from "./HighlighterService";

export class TTSService {
  public readonly onStateChange = new EventEmitter<
    (state: PlaybackState) => void
  >();
  public readonly onTimeUpdate = new EventEmitter<(time: number) => void>();
  public readonly onDurationChange = new EventEmitter<
    (duration: number) => void
  >();
  public readonly onAutoScrollingChange = new EventEmitter<
    (enabled: boolean) => void
  >();

  private _abortController = new AbortController();

  private _audioService: AudioService;
  private _textExtractor: ITextExtractor;
  private _segments: TextSegment[];
  private _highlighter = new HighligherService();
  private _lastHighlightedWord: {
    streamIndex: number;
    textRange: IRange;
    startTime: number;
  } | null = null;

  private _playing = false;

  constructor(ttsApiService: ITTSApiService, textExtractor: ITextExtractor) {
    this._textExtractor = textExtractor;
    this._segments = this._textExtractor.extractText();

    const texts = this._segments.map(
      (x) => x.texts.map((y) => y.textContent).join(""),
    );

    this._audioService = new AudioService(ttsApiService, texts);
    this._audioService.onStateChange.add((state) => this._onStateChange(state));
    this._audioService.onTimeUpdate.add((time) => this.onTimeUpdate.emit(time));
    this._audioService.onDurationChange.add((duration) =>
      this.onDurationChange.emit(duration)
    );

    window.addEventListener("wheel", () => {
      this._highlighter.setAutoScrolling(false);

      this.onAutoScrollingChange.emit(false);
    }, {
      signal: this._abortController.signal,
    });
  }

  public [Symbol.dispose]() {
    this._audioService[Symbol.dispose]();
    this._abortController.abort();
  }

  public play(): void {
    this._audioService.play();
  }

  public pause(): void {
    this._audioService.pause();
    
    if (this._lastHighlightedWord !== null) {
      this._audioService.currentTime = this._lastHighlightedWord.startTime;
    }
  }

  public isPlaying(): boolean {
    return this._playing;
  }

  public setAutoScrolling(enabled: boolean): void {
    this._highlighter.setAutoScrolling(enabled);

    const currentHighlight = document.querySelector(".kokotts-highlight");
    currentHighlight?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });

    this.onAutoScrollingChange.emit(enabled);
  }

  public isAutoScrolling(): boolean {
    return this._highlighter.isAutoScrolling();
  }

  public get currentTime(): number {
    return this._audioService.currentTime;
  }

  public get duration(): number {
    return this._audioService.duration;
  }

  private _onStateChange(state: PlaybackState): void {
    if (state === PlaybackState.Ended) {
      this._highlighter.clear();
    }

    this._playing = state === PlaybackState.Play;
    if (this._playing) {
      this._highlightLoop();
    }

    this.onStateChange.emit(state);
  }

  private _highlightLoop(): void {
    if (!this._playing) {
      return;
    }

    this._updateHighlight();
    window.requestAnimationFrame(() => this._highlightLoop());
  }

  private _updateHighlight(): void {
    const word = this._getWordAtTime(this._audioService.currentTime);
    if (word === null) {
      return;
    }

    const range = this._getSegmentBrowserRange(
      word.streamIndex,
      word.textRange,
    );
    if (range === null) {
      return;
    }

    if (
      this._lastHighlightedWord &&
      word.streamIndex === this._lastHighlightedWord.streamIndex &&
      word.textRange.start === this._lastHighlightedWord.textRange.start &&
      word.textRange.end === this._lastHighlightedWord.textRange.end
    ) {
      return;
    }

    this._lastHighlightedWord = word;

    const prevElement = document.querySelector(".kokotts-highlight");
    const rect = prevElement?.getBoundingClientRect();

    this._highlighter.clear();
    this._highlighter.highlightBrowserRange(range, rect);
  }

  private _getSegmentBrowserRange(
    segmentIndex: number,
    range: IRange,
  ): Range | null {
    const segment = this._segments[segmentIndex];

    let startContainer: Text | null = null;
    let startOffset = 0;
    let endContainer: Text | null = null;
    let endOffset = 0;

    let offset = 0;
    for (let i = 0; i < segment.texts.length; i++) {
      const text = segment.texts[i];
      const textLength = text.textContent?.length ?? 0;

      if (offset + textLength <= range.start) {
        offset += textLength;
        continue;
      }

      if (startContainer === null) {
        startContainer = text;
        startOffset = range.start - offset;
      }

      if (offset + textLength >= range.end) {
        endContainer = text;
        endOffset = range.end - offset;
        break;
      }

      offset += textLength;
    }

    if (startContainer === null || endContainer === null) {
      throw new Error("Failed to find range");
    }

    const newRange = document.createRange();
    newRange.setStart(startContainer, startOffset);
    newRange.setEnd(endContainer, endOffset);
    return newRange;
  }

  private _getWordAtTime(
    time: number,
  ): { streamIndex: number; textRange: IRange, startTime: number } | null {
    const chapters = this._audioService.getStreamChapters();
    const ttsResponses = this._audioService.getTtsResponses();
    const chapterIndex = this._getChapterIndexAtTime(time);
    if (
      chapterIndex === -1 ||
      chapterIndex >= chapters.length ||
      chapterIndex >= ttsResponses.length
    ) {
      return null;
    }

    const chapter = chapters[chapterIndex];
    const ttsResponse = ttsResponses[chapterIndex];

    const relativeTime = time - chapter.timeRange.start;

    const wordTimestamps = ttsResponse.wordTimestamps;
    for (let i = 0; i < wordTimestamps.length; i++) {
      const wordTimestamp = wordTimestamps[i];
      if (
        wordTimestamp.timeRange.start <= relativeTime &&
        relativeTime < wordTimestamp.timeRange.end
      ) {
        return {
          streamIndex: chapterIndex,
          textRange: wordTimestamp.textRange,
          startTime: chapter.timeRange.start + wordTimestamp.timeRange.start,
        };
      }
    }

    return null;
  }

  private _getChapterIndexAtTime(time: number): number {
    const chapters = this._audioService.getStreamChapters();
    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];
      if (chapter.timeRange.start <= time && time <= chapter.timeRange.end) {
        return i;
      }
    }
    return -1;
  }
}
