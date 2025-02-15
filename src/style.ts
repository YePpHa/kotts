import content from "./style.css" with { type: "css" };

export function injectStyle() {
  const style = document.createElement("style");
  style.innerHTML = content;
  document.head.appendChild(style);
}
