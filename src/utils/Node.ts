export function isTextNode(node: Node): node is Text {
  return node.nodeType === Node.TEXT_NODE;
}

export function isElementNode(node: Node): node is HTMLElement {
  return node.nodeType === Node.ELEMENT_NODE;
}

export function getCommonAncestor(node1: Node, node2: Node): Node | null {
  let ancestor: Node = node1;
  while (!ancestor.contains(node2)) {
    if (ancestor.parentElement === null) {
      return null;
    }

    ancestor = ancestor.parentElement;
  }

  return ancestor;
}

/**
 * @param node the node to start from
 * @param limitNode the node to stop at, will not check this node.
 * @return the nearest non-inline element, or null if none found.
 */
export function findNearestNonInlineElement(
  node: Node,
  limitNode: Node,
): Node | null {
  let currentNode: Node | null = node;
  while (currentNode !== limitNode && currentNode !== null) {
    if (isElementNode(currentNode)) {
      const style = window.getComputedStyle(currentNode);
      if (!style.display.includes("inline")) {
        return currentNode;
      }
    }

    currentNode = currentNode.parentElement;
  }

  return null;
}
