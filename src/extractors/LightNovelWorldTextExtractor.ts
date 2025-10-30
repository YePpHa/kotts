import type { ITextExtractor } from "../types/ITextExtractor";
import { TextNodeExtractor } from "./TextNodeExtractor";

export class LightNovelWorldTextExtractor extends TextNodeExtractor
  implements ITextExtractor {
  constructor() {
    super("#chapter-container");
  }
}
