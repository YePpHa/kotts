export interface TextSegment {
  texts: Text[];
}

export interface ITextExtractor {
  extractText(): TextSegment[];
}