import { Circle, CircleDashed, LoaderCircle, Pause, Play } from "lucide-preact";
import { Component } from "preact";
import { Button } from "./Button";

interface ButtonProps {
  size: number;
  strokeWidth: number;
  onClick?: () => void;
  isPlaying: boolean;
  buffering: boolean;
  progress: number;
}

export class PlayButtonComponent extends Component<ButtonProps> {
  render() {
    const { onClick, isPlaying, progress, size, strokeWidth, buffering } = this.props;

    const RADIUS = 10;
    const VIEWBOX_SIZE = 24;

    const dashArray = 2 * Math.PI * RADIUS;
    const dashOffset = Number.isFinite(progress)
      ? dashArray - (dashArray * progress)
      : dashArray;

    const scale = size / (RADIUS * 2);

    const newSize = VIEWBOX_SIZE * scale;
    const inset = (VIEWBOX_SIZE - size) / 2;

    return (
      <Button onClick={onClick} size={size}>
        <div className="absolute left-0 top-0 bottom-0 right-0 flex items-center justify-center">
          <Circle
            className="absolute text-neutral-700 z-0"
            style={{ inset: `-${inset}px` }}
            size={newSize}
            strokeWidth={strokeWidth}
          />
          {buffering ? (
            <CircleDashed
              className="absolute z-10 text-sky-500 animate-[spin_5s_linear_infinite]"
              style={{ inset: `-${inset}px` }}
              size={newSize}
              strokeWidth={strokeWidth}
            />
          ): (
            <Circle
              className="absolute z-10 text-sky-500"
              style={{ inset: `-${inset}px` }}
              stroke-linecap="square"
              stroke-dashoffset={dashOffset}
              stroke-dasharray={dashArray}
              size={newSize}
              transform="rotate(-90 0 0)"
              strokeWidth={strokeWidth}
            />
          )}
        </div>
        <div className="absolute left-0 top-0 bottom-0 right-0 flex items-center justify-center">
          {isPlaying
            ? <Pause fill="#ffffff" strokeWidth={0} width={18} height={18} />
            : <Play fill="#ffffff" strokeWidth={0} width={18} height={18} />}
        </div>
      </Button>
    );
  }
}
