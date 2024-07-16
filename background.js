// background.js

let blockCount = 0;

// Function to update the icon and badge
function updateIconAndBadge() {
  if (blockCount > 0) {
    chrome.action.setBadgeText({ text: blockCount.toString() });
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
}

// Listen for messages from the content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "UPDATE_BADGE") {
    blockCount = message.count;
    updateIconAndBadge();
  }
});

// Initialize the icon when the extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
  updateIconAndBadge();
});

// Update icon when a tab is updated (in case the count changes)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url.includes("x.com")) {
    updateIconAndBadge();
  }
});
