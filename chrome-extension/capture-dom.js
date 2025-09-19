(() => {
  function serializeNode(node, depth, maxDepth) {
    if (!node || depth > maxDepth) {
      return null;
    }

    const nodeType = node.nodeType;

    if (nodeType === Node.TEXT_NODE) {
      return {
        nodeType,
        textContent: node.textContent ?? "",
      };
    }

    if (nodeType === Node.ELEMENT_NODE) {
      const element = /** @type {Element} */ (node);
      const rect = element.getBoundingClientRect();

      const serialized = {
        nodeType,
        tagName: element.tagName.toLowerCase(),
        attributes: Array.from(element.attributes).map((attr) => ({
          name: attr.name,
          value: attr.value,
        })),
        dataset: Object.fromEntries(Object.entries(element.dataset)),
        bounds: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          top: rect.top,
          left: rect.left,
        },
        childNodes: [],
      };

      element.childNodes.forEach((child) => {
        const childSnapshot = serializeNode(child, depth + 1, maxDepth);
        if (childSnapshot) {
          serialized.childNodes.push(childSnapshot);
        }
      });

      return serialized;
    }

    if (nodeType === Node.DOCUMENT_TYPE_NODE) {
      const docType = /** @type {DocumentType} */ (node);
      return {
        nodeType,
        name: docType.name,
        publicId: docType.publicId,
        systemId: docType.systemId,
      };
    }

    return null;
  }

  window.__browserToolsCaptureDomSnapshot = function captureDomSnapshot(options = {}) {
    const rootSelector =
      typeof options.rootSelector === "string" && options.rootSelector.trim().length > 0
        ? options.rootSelector.trim()
        : null;
    const maxDepth =
      typeof options.maxDepth === "number" && Number.isFinite(options.maxDepth)
        ? Math.max(0, options.maxDepth)
        : 1000;

    let targetRoot = document.documentElement;

    if (rootSelector) {
      const candidate = document.querySelector(rootSelector);
      if (candidate) {
        targetRoot = candidate;
      }
    }

    const snapshot = {
      meta: {
        capturedAt: new Date().toISOString(),
        url: window.location.href,
        title: document.title,
        rootSelector,
        scope: options.scope || "page",
      },
      root: targetRoot ? serializeNode(targetRoot, 0, maxDepth) : null,
    };

    return JSON.stringify(snapshot);
  };
})();
