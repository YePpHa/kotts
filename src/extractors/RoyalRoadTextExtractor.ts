import type { ITextExtractor } from "../types/ITextExtractor";
import { TextNodeExtractor } from "./TextNodeExtractor";

export class RoyalRoadTextExtractor extends TextNodeExtractor implements ITextExtractor {
  constructor() {
    super(".chapter-content");
  }
}
