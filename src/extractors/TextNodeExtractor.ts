import type { ITextExtractor, TextSegment } from "../types/ITextExtractor";
import {
  findNearestNonInlineElement,
  getCommonAncestor,
  isElementNode,
  isTextNode,
} from "../utils/Node";

export class TextNodeExtractor implements ITextExtractor {
  private _selector: string;

  constructor(selector: string) {
    this._selector = selector;
  }

  extractText(): TextSegment[] {
    const chapterContent = document.querySelector<HTMLElement>(this._selector);
    if (!chapterContent) {
      throw new Error("Chapter content not found");
    }

    const walker = document.createTreeWalker(
      chapterContent,
      NodeFilter.SHOW_TEXT,
    );

    // Get all text nodes in order

    const textNodes: Text[] = [];
    while (walker.nextNode()) {
      if (!isTextNode(walker.currentNode)) {
        continue;
      }
      textNodes.push(walker.currentNode);
    }

    // Group text nodes into paragraphs
    const texts: Text[][] = [];
    for (let i = 0; i < textNodes.length; i++) {
      const textNode = textNodes[i];
      if (
        textNode.parentElement === null ||
        textNode.parentElement.offsetParent === null
      ) {
        continue;
      }

      if (texts.length === 0) {
        texts.push([textNode]);
        continue;
      }

      const prevNode = textNodes[i - 1];
      if (!this._isTextInSameParagraph(prevNode, textNode)) {
        texts.push([]);
      }
      texts[texts.length - 1].push(textNode);
    }

    // Remove empty paragraphs
    for (let i = texts.length - 1; i >= 0; i--) {
      const text = texts[i].map((text) => text.textContent).join("");
      if (text.trim().length === 0) {
        texts.splice(i, 1);
      }
    }

    const segments: TextSegment[] = [];
    for (const textNodes of texts) {
      let commonAncestor: Node = textNodes[0];
      for (let i = 1; i < textNodes.length; i++) {
        const cm = getCommonAncestor(commonAncestor, textNodes[i]);
        if (cm === null) {
          throw new Error("Common ancestor not found");
        }

        commonAncestor = cm;
      }
      if (isTextNode(commonAncestor) && commonAncestor.parentElement !== null) {
        commonAncestor = commonAncestor.parentElement;
      }
      if (!isElementNode(commonAncestor)) {
        throw new Error("Common ancestor is not an element");
      }

      segments.push({
        texts: textNodes,
        container: commonAncestor,
      });
    }

    return segments;
  }

  private _isTextInSameParagraph(text1: Text, text2: Text): boolean {
    const ancestor = getCommonAncestor(text1, text2);

    const parent1 = text1.parentNode;
    const parent2 = text2.parentNode;
    if (ancestor === null || parent1 === null || parent2 === null) {
      return false;
    }

    const nonInline1 = findNearestNonInlineElement(parent1, ancestor);
    const nonInline2 = findNearestNonInlineElement(parent2, ancestor);

    return nonInline1 === null && nonInline2 === null;
  }
}
