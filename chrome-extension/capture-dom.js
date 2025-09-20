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

  const extractUrlsFromCssValue = (value) => {
    if (!value || typeof value !== "string") {
      return [];
    }

    const urls = [];
    const regex = /url\((?:"([^"]+)"|'([^']+)'|([^"')]+))\)/g;
    let match;
    while ((match = regex.exec(value))) {
      const candidate = match[1] || match[2] || match[3];
      if (candidate && !candidate.startsWith("data:")) {
        urls.push(candidate);
      }
    }
    return urls;
  };

  const parseSrcSet = (value) => {
    if (!value) {
      return [];
    }
    return value
      .split(",")
      .map((entry) => entry.trim().split(/\s+/)[0])
      .filter(Boolean)
      .filter((url) => !url.startsWith("data:"));
  };

  const splitStyleList = (value) => {
    if (!value || typeof value !== "string") {
      return [];
    }

    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0 && entry.toLowerCase() !== "none");
  };

  const getListValue = (list, index) => {
    if (!Array.isArray(list) || list.length === 0) {
      return undefined;
    }
    const clampedIndex = Math.min(Math.max(index, 0), list.length - 1);
    return list[clampedIndex];
  };

  const parseTimeToMs = (value) => {
    if (!value || typeof value !== "string") {
      return null;
    }

    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }

    const numeric = Number.parseFloat(trimmed);
    if (!Number.isFinite(numeric)) {
      return null;
    }

    if (trimmed.endsWith("ms")) {
      return numeric;
    }

    if (trimmed.endsWith("s")) {
      return numeric * 1000;
    }

    return numeric;
  };

  function collectAssetCandidates(options = {}) {
    const rootSelector =
      typeof options.rootSelector === "string" && options.rootSelector.trim().length > 0
        ? options.rootSelector.trim()
        : null;

    let targetRoot = document.documentElement;

    if (rootSelector) {
      const candidate = document.querySelector(rootSelector);
      if (candidate) {
        targetRoot = candidate;
      }
    }

    const searchRoot =
      targetRoot && targetRoot instanceof Element ? targetRoot : document;
    const assets = [];
    const seen = new Set();

    const addAsset = (url, type, descriptor) => {
      if (!url) {
        return;
      }
      const trimmed = url.trim();
      if (!trimmed || trimmed.startsWith("data:")) {
        return;
      }
      if (seen.has(trimmed)) {
        return;
      }
      seen.add(trimmed);
      assets.push({ url: trimmed, type, descriptor });
    };

    const imageElements = searchRoot.querySelectorAll("img");
    imageElements.forEach((img) => {
      const source = img.currentSrc || img.src || img.getAttribute("src");
      addAsset(source, "image", { tag: "img" });
      parseSrcSet(img.getAttribute("srcset")).forEach((src) =>
        addAsset(src, "image", { tag: "img" })
      );
    });

    const sourceElements = searchRoot.querySelectorAll("source");
    sourceElements.forEach((source) => {
      const srcAttr = source.getAttribute("src");
      addAsset(srcAttr, "image", { tag: "source" });
      parseSrcSet(source.getAttribute("srcset")).forEach((src) =>
        addAsset(src, "image", { tag: "source" })
      );
    });

    const posterElements = searchRoot.querySelectorAll("video[poster]");
    posterElements.forEach((video) => {
      addAsset(video.getAttribute("poster"), "image", { tag: "video" });
    });

    const linkElements = searchRoot.querySelectorAll(
      'link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="mask-icon"], link[rel="preload"][as="image"]'
    );
    linkElements.forEach((link) => {
      addAsset(link.href, "image", { tag: "link", rel: link.rel });
    });

    const baseTargets = [];
    if (targetRoot instanceof Element) {
      baseTargets.push(targetRoot, ...Array.from(targetRoot.children));
    } else if (document.documentElement) {
      baseTargets.push(document.documentElement);
    }

    baseTargets.forEach((element) => {
      if (!(element instanceof Element)) {
        return;
      }
      const style = window.getComputedStyle(element);
      [
        style.getPropertyValue("background-image"),
        style.getPropertyValue("list-style-image"),
        style.getPropertyValue("border-image-source"),
      ].forEach((value) => {
        extractUrlsFromCssValue(value).forEach((url) =>
          addAsset(url, "style", { tag: element.tagName.toLowerCase() })
        );
      });
    });

    const baseElement = document.querySelector("base[href]");

    return {
      capturedAt: new Date().toISOString(),
      documentUrl: window.location.href,
      baseHref: baseElement ? baseElement.href : null,
      assets,
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

  function collectPseudoStateStyles(options = {}) {
    const rootSelector =
      typeof options.rootSelector === "string" && options.rootSelector.trim().length > 0
        ? options.rootSelector.trim()
        : null;

    let targetRoot = document.documentElement;

    if (rootSelector) {
      const candidate = document.querySelector(rootSelector);
      if (candidate) {
        targetRoot = candidate;
      }
    }

    if (!targetRoot || !(targetRoot instanceof Element)) {
      return {
        capturedAt: new Date().toISOString(),
        variants: [],
      };
    }

    const elements = [
      { element: targetRoot, path: "0" },
      ...Array.from(targetRoot.children).map((child, index) => ({
        element: child,
        path: buildPath("0", index),
      })),
    ];

    const pseudoStates = ["hover", "focus", "active"];
    const variants = [];
    const styleSheets = Array.from(document.styleSheets || []);

    for (const sheet of styleSheets) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch (error) {
        continue;
      }

      if (!rules) {
        continue;
      }

      Array.from(rules).forEach((rule) => {
        if (!(rule instanceof CSSStyleRule)) {
          return;
        }

        const selectorText = rule.selectorText;
        if (!selectorText) {
          return;
        }

        const selectors = selectorText
          .split(",")
          .map((selector) => selector.trim())
          .filter(Boolean);

        pseudoStates.forEach((pseudo) => {
          if (!selectorText.includes(`:${pseudo}`)) {
            return;
          }

          const normalizedSelectors = selectors
            .filter((selector) => selector.includes(`:${pseudo}`))
            .map((selector) => selector.replace(new RegExp(`:${pseudo}`, "g"), ""))
            .map((selector) => selector.trim())
            .filter(Boolean);

          if (normalizedSelectors.length === 0) {
            return;
          }

          elements.forEach(({ element, path }) => {
            const matches = normalizedSelectors.some((selector) => {
              try {
                return selector ? element.matches(selector) : false;
              } catch (error) {
                return false;
              }
            });

            if (!matches) {
              return;
            }

            const styles = {};
            for (let index = 0; index < rule.style.length; index += 1) {
              const property = rule.style[index];
              styles[property] = rule.style.getPropertyValue(property);
            }

            variants.push({
              nodeId: path,
              pseudo,
              selector: selectorText,
              stylesheet: sheet.href || null,
              styles,
            });
          });
        });
      });
    }

    return {
      capturedAt: new Date().toISOString(),
      variants,
    };
  }

  function collectAnimations(options = {}) {
    const rootSelector =
      typeof options.rootSelector === "string" && options.rootSelector.trim().length > 0
        ? options.rootSelector.trim()
        : null;

    let targetRoot = document.documentElement;

    if (rootSelector) {
      const candidate = document.querySelector(rootSelector);
      if (candidate) {
        targetRoot = candidate;
      }
    }

    if (!targetRoot || !(targetRoot instanceof Element)) {
      return {
        capturedAt: new Date().toISOString(),
        documentUrl: window.location.href,
        rootSelector,
        scope: options.scope || "page",
        cssAnimations: [],
        transitions: [],
        keyframes: [],
        timeline: [],
      };
    }

    const maxElements =
      typeof options.maxElements === "number" && Number.isFinite(options.maxElements)
        ? Math.max(1, options.maxElements)
        : 1000;

    const elements = [];
    const pathMap = new Map();
    const workQueue = [{ element: targetRoot, path: "0" }];
    let truncated = false;

    while (workQueue.length > 0) {
      const current = workQueue.shift();
      if (!current || !(current.element instanceof Element)) {
        continue;
      }

      pathMap.set(current.element, current.path);

      if (elements.length < maxElements) {
        elements.push(current);
      } else {
        truncated = true;
      }

      const children = Array.from(current.element.children);
      for (let index = 0; index < children.length; index += 1) {
        const child = children[index];
        workQueue.push({
          element: child,
          path: buildPath(current.path, index),
        });
      }
    }

    const cssAnimations = [];
    const transitions = [];

    elements.forEach(({ element, path }) => {
      const computed = window.getComputedStyle(element);

      const names = splitStyleList(computed.animationName);
      const durations = splitStyleList(computed.animationDuration);
      const delays = splitStyleList(computed.animationDelay);
      const timingFunctions = splitStyleList(computed.animationTimingFunction);
      const iterationCounts = splitStyleList(computed.animationIterationCount);
      const directions = splitStyleList(computed.animationDirection);
      const fillModes = splitStyleList(computed.animationFillMode);
      const playStates = splitStyleList(computed.animationPlayState);

      names.forEach((name, index) => {
        if (!name || name.toLowerCase() === "none") {
          return;
        }

        cssAnimations.push({
          nodeId: path,
          tagName: element.tagName.toLowerCase(),
          name,
          durationMs: parseTimeToMs(getListValue(durations, index) || ""),
          delayMs: parseTimeToMs(getListValue(delays, index) || ""),
          timingFunction: getListValue(timingFunctions, index) || undefined,
          iterationCount: getListValue(iterationCounts, index) || undefined,
          direction: getListValue(directions, index) || undefined,
          fillMode: getListValue(fillModes, index) || undefined,
          playState: getListValue(playStates, index) || undefined,
        });
      });

      const transitionProperties = splitStyleList(computed.transitionProperty);
      const transitionDurations = splitStyleList(computed.transitionDuration);
      const transitionDelays = splitStyleList(computed.transitionDelay);
      const transitionTimingFunctions = splitStyleList(
        computed.transitionTimingFunction
      );

      transitionProperties.forEach((property, index) => {
        if (!property) {
          return;
        }

        transitions.push({
          nodeId: path,
          tagName: element.tagName.toLowerCase(),
          property,
          durationMs: parseTimeToMs(
            getListValue(transitionDurations, index) || ""
          ),
          delayMs: parseTimeToMs(getListValue(transitionDelays, index) || ""),
          timingFunction:
            getListValue(transitionTimingFunctions, index) || undefined,
        });
      });
    });

    const keyframes = [];
    const styleSheets = Array.from(document.styleSheets || []);

    for (const sheet of styleSheets) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch (error) {
        continue;
      }

      if (!rules) {
        continue;
      }

      Array.from(rules).forEach((rule) => {
        if (rule.type === CSSRule.KEYFRAMES_RULE) {
          const frames = Array.from(rule.cssRules || []).map((frame) => {
            const properties = {};
            if (frame.style) {
              for (let index = 0; index < frame.style.length; index += 1) {
                const property = frame.style[index];
                properties[property] = frame.style.getPropertyValue(property);
              }
            }
            return {
              keyText: frame.keyText,
              properties,
            };
          });

          keyframes.push({
            name: rule.name,
            frames,
            stylesheet: sheet.href || null,
          });
        }
      });
    }

    const timeline = [];

    if (typeof document.getAnimations === "function") {
      try {
        const activeAnimations = document.getAnimations({ subtree: true });

        activeAnimations.forEach((animation) => {
          const effect = animation.effect;
          const target =
            effect && typeof effect === "object" && "target" in effect
              ? effect.target
              : null;

          let nodeId = null;
          if (target instanceof Element) {
            nodeId = pathMap.get(target) || null;
          }

          let computedTiming = null;
          if (
            effect &&
            typeof effect.getComputedTiming === "function"
          ) {
            try {
              computedTiming = effect.getComputedTiming();
            } catch (error) {
              computedTiming = null;
            }
          }

          let keyframeData = null;
          if (effect && typeof effect.getKeyframes === "function") {
            try {
              keyframeData = effect.getKeyframes();
            } catch (error) {
              keyframeData = null;
            }
          }

          timeline.push({
            id: typeof animation.id === "string" ? animation.id : null,
            type:
              typeof animation.type === "string"
                ? animation.type
                : undefined,
            playState: animation.playState,
            startTime: animation.startTime,
            currentTime: animation.currentTime,
            playbackRate: animation.playbackRate,
            timelineTime:
              animation.timeline &&
              typeof animation.timeline.currentTime === "number"
                ? animation.timeline.currentTime
                : null,
            nodeId,
            computedTiming,
            keyframes: keyframeData,
          });
        });
      } catch (error) {
        timeline.push({
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      capturedAt: new Date().toISOString(),
      documentUrl: window.location.href,
      rootSelector,
      scope: options.scope || "page",
      truncated,
      cssAnimations,
      transitions,
      keyframes,
      timeline,
    };
  }

  window.__browserToolsCaptureDomSnapshot = captureDomSnapshot;
  window.__browserToolsCollectStylesheets = collectStylesheets;
  window.__browserToolsGetComputedStyles = getComputedStyles;
  window.__browserToolsCollectAssets = collectAssetCandidates;
  window.__browserToolsCollectPseudoStates = collectPseudoStateStyles;
  window.__browserToolsCollectAnimations = collectAnimations;
})();
