import { Component } from "preact";
import { computed, type Signal } from "@preact/signals";
import { Play } from "lucide-preact";

interface SegmentPlayButtonProps {
  segmentHoverIndex: Signal<number>;
  segmentHoverRange: Signal<Range | null>;
  onPlayClick: (index: number) => void;
}

export class SegmentHoverPlayButton extends Component<SegmentPlayButtonProps> {
  private _clickHandler: ((e: MouseEvent) => void) | null = null;
  private _hoverHandler: ((e: MouseEvent) => void) | null = null;
  private _containerRef: HTMLElement | null = null;
  private _textContainerRef: HTMLElement | null = null;

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

  componentDidMount() {
    this._attachClickHandler();
    this._attachHoverHandler();
  }

  componentDidUpdate() {
    this._attachClickHandler();
    this._attachHoverHandler();
  }

  componentWillUnmount() {
    this._removeClickHandler();
    this._removeHoverHandler();
  }

  private _attachClickHandler() {
    this._removeClickHandler();
    
    const firstCharsRange = this._firstCharsRange.value;
    if (firstCharsRange === null) {
      return;
    }

    // Find the parent element that contains the text
    const container = firstCharsRange.commonAncestorContainer instanceof Text
      ? firstCharsRange.commonAncestorContainer.parentElement
      : firstCharsRange.commonAncestorContainer as HTMLElement;

    if (!container) {
      return;
    }

    this._clickHandler = (e: MouseEvent) => {
      // Check if click is within the range bounds
      const rect = firstCharsRange.getBoundingClientRect();
      const clickX = e.clientX;
      const clickY = e.clientY;

      if (
        clickX >= rect.left &&
        clickX <= rect.right &&
        clickY >= rect.top &&
        clickY <= rect.bottom
      ) {
        // Small delay to check if text was selected
        setTimeout(() => {
          const selection = window.getSelection();
          const hasSelection = selection && selection.toString().length > 0;

          // Only trigger play if no text was selected
          if (!hasSelection) {
            this.props.onPlayClick(this.props.segmentHoverIndex.value);
          }
        }, 10);
      }
    };

    container.addEventListener('click', this._clickHandler, true);
  }

  private _removeClickHandler() {
    if (this._clickHandler === null) {
      return;
    }

    const firstCharsRange = this._firstCharsRange.value;
    if (firstCharsRange === null) {
      return;
    }

    const container = firstCharsRange.commonAncestorContainer instanceof Text
      ? firstCharsRange.commonAncestorContainer.parentElement
      : firstCharsRange.commonAncestorContainer as HTMLElement;

    if (container) {
      container.removeEventListener('click', this._clickHandler, true);
    }

    this._clickHandler = null;
  }

  private _attachHoverHandler() {
    this._removeHoverHandler();
    
    const firstCharsRange = this._firstCharsRange.value;
    if (firstCharsRange === null || !this._containerRef) {
      return;
    }

    // Find the text container to set cursor
    const container = firstCharsRange.commonAncestorContainer instanceof Text
      ? firstCharsRange.commonAncestorContainer.parentElement
      : firstCharsRange.commonAncestorContainer as HTMLElement;
    this._textContainerRef = container;

    this._hoverHandler = (e: MouseEvent) => {
      const rect = firstCharsRange.getBoundingClientRect();
      const mouseX = e.clientX;
      const mouseY = e.clientY;

      if (
        mouseX >= rect.left &&
        mouseX <= rect.right &&
        mouseY >= rect.top &&
        mouseY <= rect.bottom
      ) {
        this._containerRef?.classList.add('group-hover-active');
        if (this._textContainerRef) {
          this._textContainerRef.style.cursor = 'pointer';
        }
      } else {
        this._containerRef?.classList.remove('group-hover-active');
        if (this._textContainerRef) {
          this._textContainerRef.style.cursor = '';
        }
      }
    };

    document.addEventListener('mousemove', this._hoverHandler);
  }

  private _removeHoverHandler() {
    if (this._hoverHandler === null) {
      return;
    }

    document.removeEventListener('mousemove', this._hoverHandler);
    this._hoverHandler = null;
  }

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
        ref={(el) => { this._containerRef = el; }}
        class="group absolute"
        style={{ 
          top: `${top}px`, 
          left: `${left}px`,
          width: `${width}px`,
          height: `${height}px`,
          pointerEvents: 'none',
        }}
      >
        {/* Animated underline */}
        <div
          class="underline-expand absolute bottom-0 left-0 h-0.5 bg-sky-500 opacity-0 group-hover:opacity-100 group-hover-active:opacity-100"
          style={{
            '--target-width': `${width}px`,
            maskImage: 'linear-gradient(to right, black 0%, black 70%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to right, black 0%, black 70%, transparent 100%)',
            pointerEvents: 'none',
          }}
        />
        {/* Play icon - not clickable */}
        <div 
          class="play-icon absolute opacity-0 group-hover:opacity-100 group-hover-active:opacity-100 transition-opacity duration-150 ease-out"
          style={{
            right: '100%',
            marginRight: '6px',
            top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
          }}
        >
          <Play fill="#0ea5e9" stroke="#0ea5e9" strokeWidth={5} width={iconSize} height={iconSize} />
        </div>
      </div>
    );
  }
}
