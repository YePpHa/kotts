import { Component } from "preact";

interface ButtonProps {
  size?: number;
  onClick?: () => void;
  className?: string;
  children: preact.ComponentChildren;
}

export class Button extends Component<ButtonProps> {
  render() {
    const { onClick, children, size } = this.props;
    return (
      <button
        className={"relative cursor-pointer rounded-full bg-neutral-900 hover:bg-neutral-700 box-border flex items-center justify-center" + (this.props.className ? ` ${this.props.className}` : "")}
        style={{ width: `${size ?? 32}px`, height: `${size ?? 32}px` }}
        onClick={onClick}
      >
        {children}
      </button>
    );
  }
}
