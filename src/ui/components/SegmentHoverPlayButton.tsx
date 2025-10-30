import { Component } from "preact";
import { Button } from "./Button";
import { Play } from "lucide-preact";
import { computed, type Signal } from "@preact/signals";

interface SegmentPlayButtonProps {
  segmentHoverIndex: Signal<number>;
  segmentHoverRange: Signal<Range | null>;
  onPlayClick: (index: number) => void;
}

export class SegmentHoverPlayButton extends Component<SegmentPlayButtonProps> {
  public render() {
    const {
      segmentHoverIndex,
      segmentHoverRange,
      onPlayClick,
    } = this.props;

    const lineHeight = computed(() => {
      const value = segmentHoverRange.value;
      if (value === null) {
        return null;
      }
      const container = value.commonAncestorContainer instanceof Text ? value.commonAncestorContainer.parentElement : value.commonAncestorContainer;
      if (!container || !(container instanceof HTMLElement)) {
        return null;
      }

      const computedStyle = window.getComputedStyle(container, null);

      const lineHeight = computedStyle.getPropertyValue(
        "line-height",
      );
      const num = Number.parseFloat(lineHeight);
      if (Number.isNaN(num)) {
        const fallbackLineHeight = computedStyle.getPropertyValue("font-size");
        return fallbackLineHeight ? Number.parseFloat(fallbackLineHeight) : null;
      }

      return num;
    });

    const rect = computed(() => {
      const range = segmentHoverRange.value;
      if (range === null) {
        return null;
      }
      return range.getBoundingClientRect();
    });

    const parentRect = computed(() => {
      const value = segmentHoverRange.value;
      if (value === null) {
        return null;
      }
      const container = value.commonAncestorContainer instanceof Text ? value.commonAncestorContainer.parentElement : value.commonAncestorContainer;
      if (!container || !(container instanceof HTMLElement)) {
        return null;
      }
      return container.getBoundingClientRect();
    });

    if (
      rect.value === null || parentRect.value === null ||
      lineHeight.value === null
    ) {
      return null;
    }

    const SIZE = 32;

    const scrollTop = window.scrollY;
    const scrollLeft = window.scrollX;
    const top = rect.value.top + scrollTop + lineHeight.value / 2 - SIZE / 2;
    // const top = rect.value.top + scrollTop;
    const left = parentRect.value.left + scrollLeft - 48;

    return (
      <aside class="absolute" style={{ top: `${top}px`, left: `${left}px` }}>
        <Button
          onClick={() =>
            onPlayClick(segmentHoverIndex.value)}
          size={SIZE}
          className="ring-sky-300 glow bg-sky-500 hover:bg-sky-400"
          defaultBackground={false}
        >
          <Play fill="#ffffff" strokeWidth={0} width={18} height={18} />
        </Button>
      </aside>
    );
  }
}
