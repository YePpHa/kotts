import diff, { DELETE, EQUAL, INSERT } from "fast-diff";
import type { IRange } from "../types/IRange";

export function firstMatch(
  needle: string,
  haystack: string,
  initialOffset: number,
): IRange | null {
  let offset = initialOffset;
  for (
    let i = Math.min(offset + needle.length, haystack.length);
    i <= haystack.length;
    i++
  ) {
    const matches = diff(haystack.slice(offset, i), needle, 0, false);
    if (i + 1 <= haystack.length && matches.length > 0) {
      if (matches[matches.length - 1][0] === INSERT) {
        // We don't want to match an insert at the end
        continue;
      }
    }

    let start = -1;
    let end = -1;
    for (const [type, text] of matches) {
      if (type === DELETE) {
        offset += text.length;
        continue;
      }

      if (start === -1) {
        start = offset;
      }

      if (type === EQUAL) {
        offset += text.length;
      }

      end = offset;
    }

    if (start !== -1 && end !== -1) {
      return { start, end };
    }
  }

  return null;
}
