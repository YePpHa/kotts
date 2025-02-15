import rawStyles from "./style.css" with { type: "css" };

export function injectStyle() {
  const style = document.createElement("style");
  style.innerHTML = rawStyles;
  document.head.appendChild(style);
}
