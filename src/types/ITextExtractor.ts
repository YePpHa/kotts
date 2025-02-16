export interface TextSegment {
  texts: Text[];
  container: HTMLElement;
}

export interface ITextExtractor {
  extractText(): TextSegment[];
}