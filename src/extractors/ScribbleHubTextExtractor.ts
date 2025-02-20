import type { ITextExtractor } from "../types/ITextExtractor";
import { TextNodeExtractor } from "./TextNodeExtractor";

export class ScribbleHubTextExtractor extends TextNodeExtractor
  implements ITextExtractor {
  constructor() {
    super("#chp_raw");
  }
}
