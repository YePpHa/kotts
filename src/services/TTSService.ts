import { EventEmitter } from "../libs/EventEmitter";
import { BufferingState, PlaybackState } from "../libs/MediaController";
import { StreamingAudio } from "../libs/StreamingAudio";
import { IRange } from "../types/IRange";
import type { ITextExtractor, TextSegment } from "../types/ITextExtractor";
import type { ITTSApiService } from "../types/ITTSApiService";
import { throttle } from "../utils/Timings";
import { AudioService } from "./AudioService";
import { HighligherService } from "./HighlighterService";

export class TTSService {
  public readonly onAutoScrollingChange = new EventEmitter<
    (result: { direction: "up" | "down"; enabled: boolean }) => void
  >();
  public readonly onSegmentHighlight = new EventEmitter<
    (segmentIndex: number, segmentElement: HTMLElement | null) => void
  >();
  public readonly onBufferingStateChange = new EventEmitter<
    (state: BufferingState) => void
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
  private _lastScrollDirection: "up" | "down" = "up";

  private _playSegmentIndex = -1;

  constructor(ttsApiService: ITTSApiService, textExtractor: ITextExtractor) {
    this._textExtractor = textExtractor;
    this._segments = this._textExtractor.extractText();

    const texts = this._segments.map(
      (x) => x.texts.map((y) => y.textContent).join(""),
    );

    this._audioService = new AudioService(ttsApiService, texts);
    this._audioService.onError.add((err) => console.error(err));

    window.addEventListener("scroll", () => this._handleScroll(), {
      signal: this._abortController.signal,
    });

    window.addEventListener("wheel", () => this._handleScroll(true), {
      signal: this._abortController.signal,
    });

    document.addEventListener(
      "mousemove",
      (evt) => this._handleMouseMove(evt),
      {
        signal: this._abortController.signal,
      },
    );

    this.audio.onStateChange.add((state) => this._onStateChange(state));
    this.audio.onBufferingStateChange.add((state) =>
      this.onBufferingStateChange.emit(state)
    );
    this._audioService.onSegmentLoad.add(() => this._onBufferAppended());
    this._audioService.onSegmentEnd.add(() => this._onBufferEnd());
    this._highlighter.onHighlightChange.add(() =>
      this._handleHighlightChange()
    );
  }

  public get audio(): StreamingAudio {
    return this._audioService.audio;
  }

  public [Symbol.dispose]() {
    this._audioService[Symbol.dispose]();
    this._abortController.abort();
  }

  public getScrollDirection(): "up" | "down" {
    return this._lastScrollDirection;
  }

  public getBufferingState(): BufferingState {
    if (this._playSegmentIndex !== -1) {
      return BufferingState.Buffering;
    }

    return this.audio.getBufferingState();
  }

  public playSegment(index: number): void {
    if (index < 0 || index >= this._segments.length) {
      return;
    }

    const chapters = this._audioService.getStreamChapters();
    if (index >= chapters.length) {
      if (this._audioService.completed) {
        console.warn("Stream is finished, cannot play segment");
        return;
      }

      this.audio.pause();

      this._playSegmentIndex = index;
      this.onBufferingStateChange.emit(BufferingState.Buffering);
      return;
    }

    const chapter = chapters[index];
    this.audio.currentTime = chapter.timeRange.start;

    this.audio.play();
  }

  public setAutoScrolling(enabled: boolean): void {
    this._highlighter.setAutoScrolling(enabled);

    if (enabled) {
      const currentHighlight = document.querySelector<HTMLElement>(
        ".kokotts-highlight",
      );
      if (currentHighlight) {
        this._highlighter.scrollIntoView(currentHighlight);
      }
    }

    this.onAutoScrollingChange.emit({ direction: "up", enabled });
  }

  private _handleHighlightChange() {
    if (this._highlighter.isAutoScrolling()) {
      return;
    }

    this._handleScroll();
  }

  private _handleScroll(forceOff: boolean = false) {
    if (
      this._highlighter.scrolling && !forceOff ||
      this._audioService.audio.getPlaybackState() !== PlaybackState.Play
    ) {
      return;
    }

    let direction: "up" | "down" = "up";
    const currentHighlight = document.querySelector<HTMLElement>(
      ".kokotts-highlight",
    );
    if (currentHighlight) {
      const rect = currentHighlight.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const isAboveCenter = rect.top < viewportHeight / 2;
      direction = isAboveCenter ? "up" : "down";
    }

    const lastAutoScrolling = this._highlighter.isAutoScrolling();

    if (lastAutoScrolling || this._lastScrollDirection !== direction) {
      this._lastScrollDirection = direction;
      this._highlighter.setAutoScrolling(false);
      this.onAutoScrollingChange.emit({ direction, enabled: false });
    }
  }

  public isAutoScrolling(): boolean {
    return this._highlighter.isAutoScrolling();
  }

  private _onBufferAppended(): void {
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
    this.audio.currentTime = chapter.timeRange.start;

    this.audio.play();
  }

  private _onBufferEnd(): void {
    if (this._playSegmentIndex === -1) {
      return;
    }

    this._playSegmentIndex = -1;
    this.onBufferingStateChange.emit(this.getBufferingState());
    console.error("Buffering ended without playing segment");
  }

  private _onStateChange(state: PlaybackState): void {
    if (state === PlaybackState.Ended) {
      this._highlighter.clear();
    }

    if (state === PlaybackState.Play) {
      this._highlightLoop();
    }

    this._playSegmentIndex = -1;
  }

  private _highlightLoop(): void {
    if (this.audio.getPlaybackState() !== PlaybackState.Play) {
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
    const word = this._getWordAtTime(this.audio.currentTime);
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
  }, 33);

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
