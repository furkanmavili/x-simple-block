console.log("Hello from the popup!");

async function detectTwitterTheme() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const result = await chrome.tabs.sendMessage(tab.id, { type: "getTheme" });
    return result.theme;
  } catch (error) {
    console.error("Error detecting theme:", error);
    return "light"; // Default to light theme
  }
}

function applyTheme(theme) {
  document.body.setAttribute("data-theme", theme);
}

// Listen for theme changes from content script
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "themeChanged") {
    applyTheme(message.theme);
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  const blockButton = document.getElementById("showBlockButton");
  const muteButton = document.getElementById("showMuteButton");

  // Detect and apply initial theme
  const theme = await detectTwitterTheme();
  applyTheme(theme);

  // Load saved settings
  chrome.storage.sync.get(["showBlockButton", "showMuteButton"], (result) => {
    blockButton.checked = result.showBlockButton ?? true;
    muteButton.checked = result.showMuteButton ?? true;
  });

  // Save settings when changed
  blockButton.addEventListener("change", () => {
    chrome.storage.sync.set({ showBlockButton: blockButton.checked });
    // Notify content script about the change
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, {
        type: "toggleButton",
        button: "block",
        show: blockButton.checked,
      });
    });
  });

  muteButton.addEventListener("change", () => {
    chrome.storage.sync.set({ showMuteButton: muteButton.checked });
    // Notify content script about the change
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, {
        type: "toggleButton",
        button: "mute",
        show: muteButton.checked,
      });
    });
  });
});

// Load saved settings when popup opens
document.addEventListener("DOMContentLoaded", async () => {
  const blockButtonCheckbox = document.getElementById("showBlockButton");
  const muteButtonCheckbox = document.getElementById("showMuteButton");

  // Get saved settings from storage
  const settings = await chrome.storage.sync.get({
    showBlockButton: true,
    showMuteButton: true,
  });

  // Update checkbox states
  blockButtonCheckbox.checked = settings.showBlockButton;
  muteButtonCheckbox.checked = settings.showMuteButton;

  // Add event listeners for checkbox changes
  blockButtonCheckbox.addEventListener("change", async (e) => {
    await chrome.storage.sync.set({ showBlockButton: e.target.checked });
    // Notify content script to update UI
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.tabs.sendMessage(tab.id, {
      type: "TOGGLE_BUTTON_VISIBILITY",
      button: "block",
      visible: e.target.checked,
    });
  });

  muteButtonCheckbox.addEventListener("change", async (e) => {
    await chrome.storage.sync.set({ showMuteButton: e.target.checked });
    // Notify content script to update UI
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.tabs.sendMessage(tab.id, {
      type: "TOGGLE_BUTTON_VISIBILITY",
      button: "mute",
      visible: e.target.checked,
    });
  });
});
