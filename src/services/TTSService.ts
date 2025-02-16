import { EventEmitter } from "../libs/EventEmitter";
import { BufferingState, PlaybackState } from "../libs/MediaController";
import { IRange } from "../types/IRange";
import type { ITextExtractor, TextSegment } from "../types/ITextExtractor";
import type { ITTSApiService } from "../types/ITTSApiService";
import { getCommonAncestor, isElementNode, isTextNode } from "../utils/Node";
import { throttle } from "../utils/Timings";
import { AudioService } from "./AudioService";
import { HighligherService } from "./HighlighterService";

export class TTSService {
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
  public readonly onAutoScrollingChange = new EventEmitter<
    (enabled: boolean) => void
  >();
  public readonly onSegmentHighlight = new EventEmitter<
    (segmentIndex: number, segmentElement: HTMLElement) => void
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
  private _buffering = false;
  private _notLoadedBuffering = false;

  private _playSegmentIndex = -1;

  constructor(ttsApiService: ITTSApiService, textExtractor: ITextExtractor) {
    this._textExtractor = textExtractor;
    this._segments = this._textExtractor.extractText();

    const texts = this._segments.map(
      (x) => x.texts.map((y) => y.textContent).join(""),
    );

    this._audioService = new AudioService(ttsApiService, texts);
    this._audioService.onStateChange.add((state) => this._onStateChange(state));
    this._audioService.onTimeUpdate.add((time) => this.onTimeUpdate.emit(time));
    this._audioService.onBufferingStateChange.add((state) => {
      const isBuffering = this.buffering;

      this._buffering = state === BufferingState.Buffering;
      if (isBuffering !== this.buffering) {
        this.onBufferingStateChange.emit(state);
      }
    });
    this._audioService.onDurationChange.add((duration) =>
      this.onDurationChange.emit(duration)
    );
    this._audioService.onStreamUpdate.add(() => this._onStreamUpdate());

    window.addEventListener("wheel", () => {
      this._highlighter.setAutoScrolling(false);

      this.onAutoScrollingChange.emit(false);
    }, {
      signal: this._abortController.signal,
    });

    document.addEventListener(
      "mousemove",
      (evt) => this._handleMouseMove(evt),
      {
        signal: this._abortController.signal,
      },
    );
  }

  public [Symbol.dispose]() {
    this._audioService[Symbol.dispose]();
    this._abortController.abort();
  }

  public get buffering(): boolean {
    return this._notLoadedBuffering || this._buffering;
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

  public playSegment(index: number): void {
    if (index < 0 || index >= this._segments.length) {
      return;
    }

    const chapters = this._audioService.getStreamChapters();
    if (index >= chapters.length) {
      if (this._audioService.streamFinished) {
        console.warn("Stream is finished, cannot play segment");
        return;
      }

      this.pause();

      this._notLoadedBuffering = true;
      this.onBufferingStateChange.emit(BufferingState.Buffering);
      this._playSegmentIndex = index;
      return;
    }

    const chapter = chapters[index];
    this._audioService.currentTime = chapter.timeRange.start;
    const isBuffering = this.buffering;
    if (isBuffering) {
      this._notLoadedBuffering = false;
      if (!this._buffering) {
        this.onBufferingStateChange.emit(BufferingState.Ready);
      }
    }
    this.play();
  }

  private _onStreamUpdate(): void {
    if (this._playSegmentIndex === -1) {
      return;
    }
    const segmentIndex = this._playSegmentIndex;
    this._playSegmentIndex = -1;

    const chapters = this._audioService.getStreamChapters();
    if (segmentIndex >= chapters.length) {
      this._playSegmentIndex = segmentIndex;
      return;
    }

    const chapter = chapters[segmentIndex];
    this._audioService.currentTime = chapter.timeRange.start;
    const isBuffering = this.buffering;
    if (isBuffering) {
      this._notLoadedBuffering = false;
      if (!this._buffering) {
        this.onBufferingStateChange.emit(BufferingState.Ready);
      }
    }

    this.play();
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

    this._playSegmentIndex = -1;

    this.onStateChange.emit(state);
  }

  private _highlightLoop(): void {
    if (!this._playing) {
      return;
    }

    try {
      this._updateHighlight();
    } catch (err) {
      console.error("Error on highlighting word", err);
    }
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
  ): { streamIndex: number; textRange: IRange; startTime: number } | null {
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

  private _handleMouseMove = throttle((evt: MouseEvent): void => {
    const element = evt.target;
    if (element === null || !(element instanceof Node)) {
      return;
    }

    const segmentIndex = this._getSegmentIndexAtElement(element);
    if (segmentIndex === -1) {
      return;
    }

    const { container } = this._segments[segmentIndex];
    this.onSegmentHighlight.emit(segmentIndex, container);
  });

  private _getSegmentIndexAtElement(element: Node): number {
    let focusedIndex = -1;
    for (let i = 0; i < this._segments.length; i++) {
      const segment = this._segments[i];
      const firstContainer = segment.container;
      if (element.contains(firstContainer)) {
        if (focusedIndex !== -1) {
          return -1;
        }

        focusedIndex = i;
        if (i === this._segments.length - 1) {
          return focusedIndex;
        }
        continue;
      }

      if (focusedIndex !== -1) {
        return focusedIndex;
      }
    }
    return -1;
  }
}
