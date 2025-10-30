import type { ITextExtractor, TextSegment } from "../types/ITextExtractor";
import type { ITextRange } from "../types/ITextRange";
import {
  findNearestNonInlineElement,
  getCommonAncestor,
  isTextNode,
} from "../utils/Node";

export class TextNodeExtractor implements ITextExtractor {
  private _selector: string;

  constructor(selector: string) {
    this._selector = selector;
  }

  private _getTotalTextNodes(node: Node): number {
    const walker = document.createTreeWalker(
      node,
      NodeFilter.SHOW_TEXT,
    );

    let totalTextNodes = 0;
    while (walker.nextNode() !== null) {
      totalTextNodes++;
    }

    return totalTextNodes;
  }

  public extractText(): TextSegment[] {
    const chapterContent = document.querySelector<HTMLElement>(this._selector);
    if (!chapterContent) {
      throw new Error("Chapter content not found");
    }

    const highlightContainer = document.querySelector(".kokotts-highlight-container");

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
      if (highlightContainer?.contains(walker.currentNode)) {
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
      if (
        !this._isTextInSameParagraph(prevNode, textNode) ||
        prevNode.nextElementSibling &&
          prevNode.nextElementSibling.tagName === "BR"
      ) {
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
        const totalTextNodes = this._getTotalTextNodes(
          commonAncestor.parentElement,
        );

        if (totalTextNodes === textNodes.length) {
          commonAncestor = commonAncestor.parentElement;
        }
      }

      let texts: ITextRange[] = [];
      for (const text of textNodes) {
        const str = text.textContent ?? "";
        const regex = /(\r?\n){2,}/g;
        let m: RegExpExecArray | null = null;
        let start = 0;
        // biome-ignore lint/suspicious/noAssignInExpressions: best way to do it
        while ((m = regex.exec(str)) !== null) {
          // This is necessary to avoid infinite loops with zero-width matches
          if (m.index === regex.lastIndex) {
            regex.lastIndex++;
          }

          const end = m.index;
          if (end > start) {
            if (this._isTextAllowed(str.substring(start, end))) {
              texts.push({ start, end, text });
            }

            if (texts.length > 0) {
              segments.push({
                texts,
                container: commonAncestor,
              });
              texts = [];
            }
          }
          start = regex.lastIndex;
        }

        if (start < str.length) {
          if (this._isTextAllowed(str.substring(start))) {
            texts.push({ start, end: str.length, text });
          }
        }
      }

      if (texts.length > 0) {
        segments.push({
          texts,
          container: commonAncestor,
        });
      }
    }

    console.log(segments);

    return segments;
  }

  private _isTextAllowed(text: string): boolean {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return false;
    }

    // Check if the text contains at least one letter or number
    const regex = /[\p{LC}\p{Ll}\p{Lm}\p{Lo}\p{Lt}\p{Lu}0-9]/u;
    return regex.test(trimmed);
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
