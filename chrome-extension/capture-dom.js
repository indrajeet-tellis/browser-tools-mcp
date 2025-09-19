(() => {
  const MAX_DEFAULT_DEPTH = 1000;

  const buildPath = (parentPath, index) =>
    parentPath ? `${parentPath}.${index}` : `${index}`;

  function serializeNode(node, depth, maxDepth, path) {
    if (!node || depth > maxDepth) {
      return null;
    }

    const nodeType = node.nodeType;

    if (nodeType === Node.TEXT_NODE) {
      return {
        nodeId: path,
        nodeType,
        textContent: node.textContent ?? "",
      };
    }

    if (nodeType === Node.ELEMENT_NODE) {
      const element = /** @type {Element} */ (node);
      const rect = element.getBoundingClientRect();

      const serialized = {
        nodeId: path,
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

      element.childNodes.forEach((child, index) => {
        const childPath = buildPath(path, index);
        const childSnapshot = serializeNode(child, depth + 1, maxDepth, childPath);
        if (childSnapshot) {
          serialized.childNodes.push(childSnapshot);
        }
      });

      return serialized;
    }

    if (nodeType === Node.DOCUMENT_TYPE_NODE) {
      const docType = /** @type {DocumentType} */ (node);
      return {
        nodeId: path,
        nodeType,
        name: docType.name,
        publicId: docType.publicId,
        systemId: docType.systemId,
      };
    }

    return null;
  }

  function captureDomSnapshot(options = {}) {
    const rootSelector =
      typeof options.rootSelector === "string" && options.rootSelector.trim().length > 0
        ? options.rootSelector.trim()
        : null;
    const maxDepth =
      typeof options.maxDepth === "number" && Number.isFinite(options.maxDepth)
        ? Math.max(0, options.maxDepth)
        : MAX_DEFAULT_DEPTH;

    let targetRoot = document.documentElement;

    if (rootSelector) {
      const candidate = document.querySelector(rootSelector);
      if (candidate) {
        targetRoot = candidate;
      }
    }

    const rootPath = "0";

    const snapshot = {
      meta: {
        capturedAt: new Date().toISOString(),
        url: window.location.href,
        title: document.title,
        rootSelector,
        scope: options.scope || "page",
      },
      root: targetRoot ? serializeNode(targetRoot, 0, maxDepth, rootPath) : null,
    };

    return JSON.stringify(snapshot);
  }

  function collectStylesheets() {
    const styleSheets = Array.from(document.styleSheets || []);

    return styleSheets.map((sheet, index) => {
      const entry = {
        index,
        href: sheet.href || null,
        disabled: !!sheet.disabled,
        title: sheet.title || null,
        media: sheet.media ? Array.from(sheet.media) : [],
        type: "unknown",
        content: "",
      };

      const ownerNode = sheet.ownerNode;
      if (ownerNode instanceof HTMLStyleElement) {
        entry.type = "inline";
      } else if (ownerNode instanceof HTMLLinkElement) {
        entry.type = ownerNode.rel || "external";
      }

      try {
        if (sheet.cssRules) {
          entry.content = Array.from(sheet.cssRules)
            .map((rule) => rule.cssText)
            .join("\n");
        }
      } catch (error) {
        entry.error = error instanceof Error ? error.message : String(error);
        if (!entry.content && ownerNode && ownerNode.textContent) {
          entry.content = ownerNode.textContent;
        }
      }

      return entry;
    });
  }

  function serializeComputedStyle(element, path) {
    const computed = window.getComputedStyle(element);
    const styles = {};
    for (let i = 0; i < computed.length; i += 1) {
      const property = computed[i];
      styles[property] = computed.getPropertyValue(property);
    }

    return {
      nodeId: path,
      tagName: element.tagName.toLowerCase(),
      styles,
    };
  }

  function getComputedStyles(options = {}) {
    const rootSelector =
      typeof options.rootSelector === "string" && options.rootSelector.trim().length > 0
        ? options.rootSelector.trim()
        : null;
    const maxNodes =
      typeof options.maxNodes === "number" && Number.isFinite(options.maxNodes)
        ? Math.max(1, options.maxNodes)
        : 25;

    let targetRoot = document.documentElement;

    if (rootSelector) {
      const candidate = document.querySelector(rootSelector);
      if (candidate) {
        targetRoot = candidate;
      }
    }

    if (!targetRoot || !(targetRoot instanceof Element)) {
      return [];
    }

    const results = [];
    const rootPath = "0";
    results.push(serializeComputedStyle(targetRoot, rootPath));

    const children = Array.from(targetRoot.children);
    for (let index = 0; index < children.length && results.length < maxNodes; index += 1) {
      const child = children[index];
      const childPath = buildPath(rootPath, index);
      results.push(serializeComputedStyle(child, childPath));
    }

    return results;
  }

  window.__browserToolsCaptureDomSnapshot = captureDomSnapshot;
  window.__browserToolsCollectStylesheets = collectStylesheets;
  window.__browserToolsGetComputedStyles = getComputedStyles;
})();
