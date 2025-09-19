// Listen for messages from the devtools panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_CURRENT_URL" && message.tabId) {
    getCurrentTabUrl(message.tabId)
      .then((url) => {
        sendResponse({ success: true, url: url });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Required to use sendResponse asynchronously
  }

  // Handle explicit request to update the server with the URL
  if (message.type === "UPDATE_SERVER_URL" && message.tabId && message.url) {
    console.log(
      `Background: Received request to update server with URL for tab ${message.tabId}: ${message.url}`
    );
    updateServerWithUrl(
      message.tabId,
      message.url,
      message.source || "explicit_update"
    )
      .then(() => {
        if (sendResponse) sendResponse({ success: true });
      })
      .catch((error) => {
        console.error("Background: Error updating server with URL:", error);
        if (sendResponse)
          sendResponse({ success: false, error: error.message });
      });
    return true; // Required to use sendResponse asynchronously
  }

  if (message.type === "CAPTURE_SCREENSHOT" && message.tabId) {
    // First get the server settings
    chrome.storage.local.get(["browserConnectorSettings"], (result) => {
      const settings = result.browserConnectorSettings || {
        serverHost: "localhost",
        serverPort: 3025,
      };

      // Validate server identity first
      validateServerIdentity(settings.serverHost, settings.serverPort)
        .then((isValid) => {
          if (!isValid) {
            console.error(
              "Cannot capture screenshot: Not connected to a valid browser tools server"
            );
            sendResponse({
              success: false,
              error:
                "Not connected to a valid browser tools server. Please check your connection settings.",
            });
            return;
          }

          // Continue with screenshot capture
          captureAndSendScreenshot(message, settings, sendResponse);
        })
        .catch((error) => {
          console.error("Error validating server:", error);
          sendResponse({
            success: false,
            error: "Failed to validate server identity: " + error.message,
          });
        });
    });
    return true; // Required to use sendResponse asynchronously
  }

  if (message.type === "START_CLONE_SESSION") {
    handleStartCloneSession(message, sendResponse);
    return true;
  }

  if (message.type === "CLONE_SNAPSHOT_CHUNK" && message.chunk) {
    handleCloneSnapshotChunk(message.chunk, sendResponse);
    return true;
  }
});

// Validate server identity
async function validateServerIdentity(host, port) {
  try {
    const response = await fetch(`http://${host}:${port}/.identity`, {
      signal: AbortSignal.timeout(3000), // 3 second timeout
    });

    if (!response.ok) {
      console.error(`Invalid server response: ${response.status}`);
      return false;
    }

    const identity = await response.json();

    // Validate the server signature
    if (identity.signature !== "mcp-browser-connector-24x7") {
      console.error("Invalid server signature - not the browser tools server");
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error validating server identity:", error);
    return false;
  }
}

async function handleStartCloneSession(message, sendResponse) {
  try {
    const scope = message.scope === "selection" ? "selection" : "page";
    const settings = await getConnectorSettings();

    const isValid = await validateServerIdentity(
      settings.serverHost,
      settings.serverPort
    );

    if (!isValid) {
      sendResponse({
        success: false,
        error:
          "Browser tools server is not available. Verify the connection settings and try again.",
      });
      return;
    }

    const body = { scope };

    if (scope === "selection") {
      const targetSelector = await resolveSelectionTarget(settings);
      if (targetSelector) {
        body.targetSelector = targetSelector;
      }
    }

    const startResponse = await fetch(
      `http://${settings.serverHost}:${settings.serverPort}/clone/session/start`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!startResponse.ok) {
      sendResponse({
        success: false,
        error: `Failed to start clone session (${startResponse.status}).`,
      });
      return;
    }

    const payload = await startResponse.json();
    const session = payload?.session;

    if (!session || !session.sessionId) {
      sendResponse({
        success: false,
        error: "Clone session start response did not include a session identifier.",
      });
      return;
    }

    sendResponse({ success: true, session });

    const initialEvent = {
      sessionId: session.sessionId,
      phase: "initializing",
      progress: 0,
      message: "Session initialized",
      timestamp: new Date().toISOString(),
    };

    sendCloneSessionEvent(initialEvent, {
      ...session,
      status: session.status || "initializing",
      updatedAt: initialEvent.timestamp,
      lastProgress: initialEvent,
    });

    triggerDomSnapshot(session, scope)
      .then(() => finalizeCloneSession(session, settings, scope))
      .catch((error) => {
        reportCloneSessionError(
          session.sessionId,
          error instanceof Error
            ? error.message
            : "Failed to process DOM snapshot."
        );
      });
  } catch (error) {
    console.error("Error starting clone session:", error);
    const messageText =
      error instanceof Error ? error.message : "Failed to start clone session.";
    sendResponse({ success: false, error: messageText });
  }
}

async function finalizeCloneSession(session, settings, scope) {
  await delay(750);

  const finishResponse = await fetch(
    `http://${settings.serverHost}:${settings.serverPort}/clone/session/finish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: session.sessionId,
        status: "completed",
        message: `Completed ${scope} clone stub via DevTools panel.`,
      }),
      signal: AbortSignal.timeout(5000),
    }
  );

  if (!finishResponse.ok) {
    throw new Error(`Failed to complete clone session (${finishResponse.status}).`);
  }

  const completionEvent = {
    sessionId: session.sessionId,
    phase: "completed",
    progress: 1,
    message: `Completed ${scope} clone stub via DevTools panel.`,
    timestamp: new Date().toISOString(),
  };

  sendCloneSessionEvent(completionEvent, {
    ...session,
    status: "completed",
    updatedAt: completionEvent.timestamp,
    lastProgress: completionEvent,
  });
}

function triggerDomSnapshot(session, scope) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: "CAPTURE_DOM_SNAPSHOT",
        session,
        options: { scope },
      },
      (response) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }

        if (!response || !response.success) {
          reject(
            new Error(
              response && response.error
                ? response.error
                : "DOM snapshot capture failed."
            )
          );
          return;
        }

        resolve();
      }
    );
  });
}

async function handleCloneSnapshotChunk(chunk, sendResponse) {
  try {
    if (!chunk || !chunk.sessionId) {
      sendResponse({ success: false, error: "Invalid snapshot chunk payload." });
      return;
    }

    const settings = await getConnectorSettings();
    const response = await fetch(
      `http://${settings.serverHost}:${settings.serverPort}/clone/session/${encodeURIComponent(
        chunk.sessionId
      )}/chunk`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chunk),
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!response.ok) {
      sendResponse({
        success: false,
        error: `Snapshot chunk rejected (${response.status}).`,
      });
      return;
    }

    sendResponse({ success: true });
  } catch (error) {
    console.error("Failed to deliver snapshot chunk:", error);
    sendResponse({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Snapshot chunk delivery failed.",
    });
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getConnectorSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["browserConnectorSettings"], (result) => {
      const settings = result.browserConnectorSettings || {
        serverHost: "localhost",
        serverPort: 3025,
      };
      resolve(settings);
    });
  });
}

async function resolveSelectionTarget(settings) {
  try {
    const response = await fetch(
      `http://${settings.serverHost}:${settings.serverPort}/selected-element`,
      { signal: AbortSignal.timeout(2000) }
    );

    if (!response.ok) {
      return undefined;
    }

    const payload = await response.json();

    if (typeof payload === "string") {
      return payload;
    }

    if (payload && typeof payload === "object") {
      if (typeof payload.selector === "string") {
        return payload.selector;
      }
      if (typeof payload.cssPath === "string") {
        return payload.cssPath;
      }
      if (typeof payload.xpath === "string") {
        return payload.xpath;
      }
    }
  } catch (error) {
    console.warn("Unable to resolve selection target:", error);
  }

  return undefined;
}

function reportCloneSessionError(sessionId, errorMessage) {
  chrome.runtime.sendMessage(
    {
      type: "CLONE_SESSION_ERROR",
      sessionId,
      error: errorMessage,
    },
    () => {
      const lastError = chrome.runtime.lastError;
      if (lastError &&
        lastError.message &&
        !lastError.message.includes("Receiving end does not exist")) {
        console.error("Failed to deliver clone session error message:", lastError);
      }
    }
  );
}

function sendCloneSessionEvent(event, session) {
  chrome.runtime.sendMessage(
    {
      type: "CLONE_SESSION_EVENT",
      event,
      session,
    },
    () => {
      const lastError = chrome.runtime.lastError;
      if (lastError &&
        lastError.message &&
        !lastError.message.includes("Receiving end does not exist")) {
        console.error("Failed to deliver clone session event:", lastError);
      }
    }
  );
}

// Helper function to process the tab and run the audit
function processTabForAudit(tab, tabId) {
  const url = tab.url;

  if (!url) {
    console.error(`No URL available for tab ${tabId}`);
    return;
  }

  // Update our cache and the server with this URL
  tabUrls.set(tabId, url);
  updateServerWithUrl(tabId, url);
}

// Track URLs for each tab
const tabUrls = new Map();

// Function to get the current URL for a tab
async function getCurrentTabUrl(tabId) {
  try {
    console.log("Background: Getting URL for tab", tabId);

    // First check if we have it cached
    if (tabUrls.has(tabId)) {
      const cachedUrl = tabUrls.get(tabId);
      console.log("Background: Found cached URL:", cachedUrl);
      return cachedUrl;
    }

    // Otherwise get it from the tab
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab && tab.url) {
        // Cache the URL
        tabUrls.set(tabId, tab.url);
        console.log("Background: Got URL from tab:", tab.url);
        return tab.url;
      } else {
        console.log("Background: Tab exists but no URL found");
      }
    } catch (tabError) {
      console.error("Background: Error getting tab:", tabError);
    }

    // If we can't get the tab directly, try querying for active tabs
    try {
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tabs && tabs.length > 0 && tabs[0].url) {
        const activeUrl = tabs[0].url;
        console.log("Background: Got URL from active tab:", activeUrl);
        // Cache this URL as well
        tabUrls.set(tabId, activeUrl);
        return activeUrl;
      }
    } catch (queryError) {
      console.error("Background: Error querying tabs:", queryError);
    }

    console.log("Background: Could not find URL for tab", tabId);
    return null;
  } catch (error) {
    console.error("Background: Error getting tab URL:", error);
    return null;
  }
}

// Listen for tab updates to detect page refreshes and URL changes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Track URL changes
  if (changeInfo.url) {
    console.log(`URL changed in tab ${tabId} to ${changeInfo.url}`);
    tabUrls.set(tabId, changeInfo.url);

    // Send URL update to server if possible
    updateServerWithUrl(tabId, changeInfo.url, "tab_url_change");
  }

  // Check if this is a page refresh (status becoming "complete")
  if (changeInfo.status === "complete") {
    // Update URL in our cache
    if (tab.url) {
      tabUrls.set(tabId, tab.url);
      // Send URL update to server if possible
      updateServerWithUrl(tabId, tab.url, "page_complete");
    }

    retestConnectionOnRefresh(tabId);
  }
});

// Listen for tab activation (switching between tabs)
chrome.tabs.onActivated.addListener((activeInfo) => {
  const tabId = activeInfo.tabId;
  console.log(`Tab activated: ${tabId}`);

  // Get the URL of the newly activated tab
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError) {
      console.error("Error getting tab info:", chrome.runtime.lastError);
      return;
    }

    if (tab && tab.url) {
      console.log(`Active tab changed to ${tab.url}`);

      // Update our cache
      tabUrls.set(tabId, tab.url);

      // Send URL update to server
      updateServerWithUrl(tabId, tab.url, "tab_activated");
    }
  });
});

// Function to update the server with the current URL
async function updateServerWithUrl(tabId, url, source = "background_update") {
  if (!url) {
    console.error("Cannot update server with empty URL");
    return;
  }

  console.log(`Updating server with URL for tab ${tabId}: ${url}`);

  // Get the saved settings
  chrome.storage.local.get(["browserConnectorSettings"], async (result) => {
    const settings = result.browserConnectorSettings || {
      serverHost: "localhost",
      serverPort: 3025,
    };

    // Maximum number of retry attempts
    const maxRetries = 3;
    let retryCount = 0;
    let success = false;

    while (retryCount < maxRetries && !success) {
      try {
        // Send the URL to the server
        const serverUrl = `http://${settings.serverHost}:${settings.serverPort}/current-url`;
        console.log(
          `Attempt ${
            retryCount + 1
          }/${maxRetries} to update server with URL: ${url}`
        );

        const response = await fetch(serverUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: url,
            tabId: tabId,
            timestamp: Date.now(),
            source: source,
          }),
          // Add a timeout to prevent hanging requests
          signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
          const responseData = await response.json();
          console.log(
            `Successfully updated server with URL: ${url}`,
            responseData
          );
          success = true;
        } else {
          console.error(
            `Server returned error: ${response.status} ${response.statusText}`
          );
          retryCount++;
          // Wait before retrying
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      } catch (error) {
        console.error(`Error updating server with URL: ${error.message}`);
        retryCount++;
        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    if (!success) {
      console.error(
        `Failed to update server with URL after ${maxRetries} attempts`
      );
    }
  });
}

// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  tabUrls.delete(tabId);
});

// Function to retest connection when a page is refreshed
async function retestConnectionOnRefresh(tabId) {
  console.log(`Page refreshed in tab ${tabId}, retesting connection...`);

  // Get the saved settings
  chrome.storage.local.get(["browserConnectorSettings"], async (result) => {
    const settings = result.browserConnectorSettings || {
      serverHost: "localhost",
      serverPort: 3025,
    };

    // Test the connection with the last known host and port
    const isConnected = await validateServerIdentity(
      settings.serverHost,
      settings.serverPort
    );

    // Notify all devtools instances about the connection status
    chrome.runtime.sendMessage({
      type: "CONNECTION_STATUS_UPDATE",
      isConnected: isConnected,
      tabId: tabId,
    });

    // Always notify for page refresh, whether connected or not
    // This ensures any ongoing discovery is cancelled and restarted
    chrome.runtime.sendMessage({
      type: "INITIATE_AUTO_DISCOVERY",
      reason: "page_refresh",
      tabId: tabId,
      forceRestart: true, // Add a flag to indicate this should force restart any ongoing processes
    });

    if (!isConnected) {
      console.log(
        "Connection test failed after page refresh, initiating auto-discovery..."
      );
    } else {
      console.log("Connection test successful after page refresh");
    }
  });
}

// Function to capture and send screenshot
function captureAndSendScreenshot(message, settings, sendResponse) {
  // Get the inspected window's tab
  chrome.tabs.get(message.tabId, (tab) => {
    if (chrome.runtime.lastError) {
      console.error("Error getting tab:", chrome.runtime.lastError);
      sendResponse({
        success: false,
        error: chrome.runtime.lastError.message,
      });
      return;
    }

    // Get all windows to find the one containing our tab
    chrome.windows.getAll({ populate: true }, (windows) => {
      const targetWindow = windows.find((w) =>
        w.tabs.some((t) => t.id === message.tabId)
      );

      if (!targetWindow) {
        console.error("Could not find window containing the inspected tab");
        sendResponse({
          success: false,
          error: "Could not find window containing the inspected tab",
        });
        return;
      }

      // Capture screenshot of the window containing our tab
      chrome.tabs.captureVisibleTab(
        targetWindow.id,
        { format: "png" },
        (dataUrl) => {
          // Ignore DevTools panel capture error if it occurs
          if (
            chrome.runtime.lastError &&
            !chrome.runtime.lastError.message.includes("devtools://")
          ) {
            console.error(
              "Error capturing screenshot:",
              chrome.runtime.lastError
            );
            sendResponse({
              success: false,
              error: chrome.runtime.lastError.message,
            });
            return;
          }

          // Send screenshot data to browser connector using configured settings
          const serverUrl = `http://${settings.serverHost}:${settings.serverPort}/screenshot`;
          console.log(`Sending screenshot to ${serverUrl}`);

          fetch(serverUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              data: dataUrl,
              path: message.screenshotPath,
            }),
          })
            .then((response) => response.json())
            .then((result) => {
              if (result.error) {
                console.error("Error from server:", result.error);
                sendResponse({ success: false, error: result.error });
              } else {
                console.log("Screenshot saved successfully:", result.path);
                // Send success response even if DevTools capture failed
                sendResponse({
                  success: true,
                  path: result.path,
                  title: tab.title || "Current Tab",
                });
              }
            })
            .catch((error) => {
              console.error("Error sending screenshot data:", error);
              sendResponse({
                success: false,
                error: error.message || "Failed to save screenshot",
              });
            });
        }
      );
    });
  });
}
