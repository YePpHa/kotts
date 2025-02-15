import type { ITextExtractor, TextSegment } from "../types/ITextExtractor";
import { findNearestNonInlineElement, getCommonAncestor, isTextNode } from "../utils/Node";

export class RoyalRoadTextExtractor implements ITextExtractor {
  extractText(): TextSegment[] {
    const chapterContent = document.querySelector<HTMLElement>(".chapter-content");
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
    const segments: TextSegment[] = [];
    for (let i = 0; i < textNodes.length; i++) {
      const textNode = textNodes[i];
      if (textNode.parentElement === null || textNode.parentElement.offsetParent === null) {
        continue;
      }

      if (segments.length === 0) {
        segments.push({
          texts: [textNode]
        });
        continue;
      }

      const prevNode = textNodes[i - 1];
      if (!this._isTextInSameParagraph(prevNode, textNode)) {
        segments.push({
          texts: []
        });
      }
      segments[segments.length - 1].texts.push(textNode);
    }

    // Remove empty paragraphs
    for (let i = segments.length - 1; i >= 0; i--) {
      const text = segments[i].texts.map(text => text.textContent).join("");
      if (text.trim().length === 0) {
        segments.splice(i, 1);
      }
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