import { Component } from "preact";
import { computed, type Signal } from "@preact/signals";
import { Play } from "lucide-preact";

interface SegmentPlayButtonProps {
  segmentHoverIndex: Signal<number>;
  segmentHoverRange: Signal<Range | null>;
  onPlayClick: (index: number) => void;
}

export class SegmentHoverPlayButton extends Component<SegmentPlayButtonProps> {
  private _firstCharsRange = computed(() => {
    const range = this.props.segmentHoverRange.value;
    if (range === null) {
      return null;
    }

    // Create a new range for the first few characters (about 3-5 characters)
    const textContent = range.toString();
    const charCount = Math.min(5, textContent.length);
    
    if (charCount === 0) {
      return null;
    }

    const firstCharsRange = range.cloneRange();
    firstCharsRange.setEnd(firstCharsRange.startContainer, Math.min(
      firstCharsRange.startOffset + charCount,
      firstCharsRange.startContainer.textContent?.length ?? 0
    ));

    return firstCharsRange;
  });

  public render() {
    const {
      segmentHoverIndex,
      segmentHoverRange,
      onPlayClick,
    } = this.props;

    const firstCharsRange = this._firstCharsRange.value;

    const firstCharsRect = computed(() => {
      if (firstCharsRange === null) {
        return null;
      }
      return firstCharsRange.getBoundingClientRect();
    });

    if (firstCharsRect.value === null || firstCharsRange === null) {
      return null;
    }

    const scrollTop = window.scrollY;
    const scrollLeft = window.scrollX;
    const rect = firstCharsRect.value;
    
    // Position the container over the first few characters
    const top = rect.top + scrollTop;
    const left = rect.left + scrollLeft;
    const width = rect.width;
    const height = rect.height;
    
    // Calculate play icon size based on line height (80% of line height, with min/max bounds)
    const iconSize = Math.max(12, Math.min(20, height * 0.8));

    return (
      <div
        class="group absolute cursor-pointer"
        style={{ 
          top: `${top}px`, 
          left: `${left}px`,
          width: `${width}px`,
          height: `${height}px`,
          pointerEvents: 'auto',
        }}
        onClick={() => onPlayClick(segmentHoverIndex.value)}
      >
        {/* Animated underline */}
        <div
          class="underline-expand absolute bottom-0 left-0 h-0.5 bg-sky-500 opacity-0 group-hover:opacity-100"
          style={{
            '--target-width': `${width}px`,
            maskImage: 'linear-gradient(to right, black 0%, black 70%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to right, black 0%, black 70%, transparent 100%)',
          }}
        />
        {/* Play icon */}
        <div 
          class="play-icon absolute opacity-0 group-hover:opacity-100 transition-opacity duration-150 ease-out"
          style={{
            right: '100%',
            marginRight: '6px',
            top: '50%',
            transform: 'translateY(-50%)',
          }}
        >
          <Play fill="#0ea5e9" strokeWidth={0} width={iconSize} height={iconSize} />
        </div>
      </div>
    );
  }
}
