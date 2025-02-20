import type { ITextExtractor } from "../types/ITextExtractor";
import { TextNodeExtractor } from "./TextNodeExtractor";

export class FanFictionTextExtractor extends TextNodeExtractor
  implements ITextExtractor {
  constructor() {
    super("#storytext");
  }
}
