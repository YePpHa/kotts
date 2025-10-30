import type { ITextRange } from "./ITextRange";

export interface TextSegment {
  texts: ITextRange[];
  container: Node;
}

export interface ITextExtractor {
  extractText(): TextSegment[];
}
