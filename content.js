import browser from "webextension-polyfill";
import axios from "axios";
import Qs from "qs";

const CONFIG = {
  tweetSelector: 'article[data-testid="tweet"]',
  userNameSelector: 'div[data-testid="User-Name"]',
  tweetTextSelector: 'div[data-testid="tweetText"]',
  userLinkSelector: 'a[role="link"]',
  tweetLinkSelector: 'a[href*="/status/"]',
  blockButtonClass: "x-block-button",
  muteButtonClass: "x-mute-button",
  blockIcon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" ><path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" /></svg>`,
  muteIcon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2">
    <path stroke-linecap="round" stroke-linejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
  </svg>`,
};

class Storage {
  constructor() {
    this.storage = browser.storage.local;
  }

  async get(key) {
    try {
      return await this.storage.get(key);
    } catch (error) {
      console.error(`Error getting ${key} from storage:`, error);
      throw error;
    }
  }

  async set(key, value) {
    try {
      await this.storage.set({ [key]: value });
    } catch (error) {
      console.error(`Error setting ${key} in storage:`, error);
      throw error;
    }
  }
}

class TwitterAPI {
  constructor(csrfToken) {
    this.api = axios.create({
      baseURL: "https://api.x.com",
      withCredentials: true,
      headers: {
        Authorization:
          "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA",
        "X-Twitter-Auth-Type": "OAuth2Session",
        "X-Twitter-Active-User": "yes",
        "X-Csrf-Token": csrfToken,
      },
    });
  }

  async blockUser(id) {
    try {
      await this.api.post("/1.1/blocks/create.json", Qs.stringify({ user_id: id }), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      console.log(`User ${id} blocked successfully`);
    } catch (error) {
      console.error(`Error blocking user ${id}:`, error);
      throw error;
    }
  }

  async getUserId(tweetId, screenName) {
    try {
      const { data } = await this.api.get(`/2/timeline/conversation/${tweetId}.json`);
      const users = data.globalObjects.users;
      return Object.keys(users).find((key) => users[key].screen_name === screenName);
    } catch (error) {
      console.error(`Error fetching user ID for ${screenName}:`, error);
      throw error;
    }
  }

  async muteUser(id) {
    try {
      await this.api.post("/1.1/mutes/users/create.json", Qs.stringify({ user_id: id }), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      console.log(`User ${id} muted successfully`);
    } catch (error) {
      console.error(`Error muting user ${id}:`, error);
      throw error;
    }
  }
}

class TweetBlocker {
  constructor() {
    this.storage = new Storage();
    this.api = null;
  }

  async initialize() {
    try {
      const csrfToken = this.getCsrfToken();
      if (!csrfToken) {
        throw new Error("Failed to get CSRF token");
      }
      this.api = new TwitterAPI(csrfToken);
      this.addBlockButtons();
      this.observeNewTweets();
    } catch (error) {
      console.error("Error initializing TweetBlocker:", error);
    }
  }

  getCsrfToken() {
    const cookies = document.cookie.split("; ");
    const csrfCookie = cookies.find((cookie) => cookie.startsWith("ct0="));
    return csrfCookie ? csrfCookie.split("=")[1] : null;
  }

  createBlockButton(clickHandler) {
    const button = document.createElement("button");
    button.innerHTML = CONFIG.blockIcon;
    button.className = CONFIG.blockButtonClass;
    button.addEventListener("click", clickHandler);
    return button;
  }

  createMuteButton(clickHandler) {
    const button = document.createElement("button");
    button.innerHTML = CONFIG.muteIcon;
    button.className = CONFIG.muteButtonClass;
    button.addEventListener("click", clickHandler);
    return button;
  }

  extractTweetInfo(tweet) {
    const tweetText = tweet.querySelector(CONFIG.tweetTextSelector)?.textContent ?? "";
    const userNameElement = tweet.querySelector(`${CONFIG.userNameSelector} ${CONFIG.userLinkSelector}`);
    const extractedUserName = userNameElement?.href.split("/").pop() ?? "";
    const tweetLink = tweet.querySelector(CONFIG.tweetLinkSelector);
    const tweetId = tweetLink?.href.match(/\/status\/(\d+)/)?.[1] ?? null;

    return { tweetId, tweetText, userName: extractedUserName };
  }

  async blockTweet(tweetInfo, tweetElement) {
    try {
      const userId = await this.api.getUserId(tweetInfo.tweetId, tweetInfo.userName);
      if (!userId) {
        throw new Error(`User ID not found for ${tweetInfo.userName}`);
      }

      await this.api.blockUser(userId);
      await this.storage.set(`blocked_${tweetInfo.tweetId}`, true);
      console.log(`Tweet ${tweetInfo.tweetId} marked as blocked`);

      await this.updateBlockCount();
      this.showNotification(`<span><b>@${tweetInfo.userName}</b> blocked</span><span style="height: 16px">🥳</span>`);
      tweetElement.style.display = "none";
      console.log("Tweet blocked:", tweetInfo.tweetText);
    } catch (error) {
      console.error("Error blocking tweet:", error);
    }
  }

  async muteTweet(tweetInfo, tweetElement) {
    try {
      const userId = await this.api.getUserId(tweetInfo.tweetId, tweetInfo.userName);
      if (!userId) {
        throw new Error(`User ID not found for ${tweetInfo.userName}`);
      }

      await this.api.muteUser(userId);
      this.showNotification(`<span><b>@${tweetInfo.userName}</b> muted</span><span style="height: 16px">🤫</span>`);
      tweetElement.style.display = "none";
      console.log("Tweet muted:", tweetInfo.tweetText);
    } catch (error) {
      console.error("Error muting tweet:", error);
    }
  }

  async updateBlockCount() {
    try {
      const data = await this.storage.get("count");
      const count = (data.count || 0) + 1;
      await this.storage.set("count", count);
      await browser.runtime.sendMessage({ type: "UPDATE_BADGE", count });
    } catch (error) {
      console.error("Error updating block count:", error);
    }
  }

  showNotification(message) {
    const notification = document.createElement("div");
    notification.className = "x-notification";
    notification.innerHTML = message;
    notification.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: "ease-in" });
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.opacity = 0;
      setTimeout(() => {
        notification.remove();
      }, 1000);
    }, 3000);
  }

  addBlockButtons() {
    const tweets = document.querySelectorAll(CONFIG.tweetSelector);
    tweets.forEach((tweet) => {
      if (!tweet.querySelector(`.${CONFIG.blockButtonClass}`)) {
        const tweetInfo = this.extractTweetInfo(tweet);
        const blockButton = this.createBlockButton(() => this.blockTweet(tweetInfo, tweet));
        const muteButton = this.createMuteButton(() => this.muteTweet(tweetInfo, tweet));

        // Add show class based on stored settings
        chrome.storage.sync.get(
          {
            showBlockButton: true,
            showMuteButton: true,
          },
          (result) => {
            if (result.showBlockButton) blockButton.classList.add("show");
            if (result.showMuteButton) muteButton.classList.add("show");
          }
        );

        const actionsBar = tweet.querySelector(CONFIG.userNameSelector);
        if (actionsBar) {
          const buttonContainer = document.createElement("div");
          buttonContainer.className = "x-button-container";
          buttonContainer.appendChild(blockButton);
          buttonContainer.appendChild(muteButton);
          actionsBar.appendChild(buttonContainer);
        }
      }
    });
  }

  observeNewTweets() {
    const observer = new MutationObserver(() => this.addBlockButtons());
    observer.observe(document.body, { childList: true, subtree: true });
  }
}

// Initialize the TweetBlocker
const tweetBlocker = new TweetBlocker();
tweetBlocker.initialize().then(() => {
  console.log("Tweet blocking script initialized");
});

// Add this function to detect theme
function getCurrentTheme() {
  const html = document.documentElement;
  const colorScheme = html.style.colorScheme;
  return colorScheme || "light"; // default to light if not set
}

// Add a mutation observer to watch for theme changes
const themeObserver = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.attributeName === "style") {
      const newTheme = getCurrentTheme();
      // Notify popup about theme change
      chrome.runtime.sendMessage({ type: "themeChanged", theme: newTheme });
    }
  });
});

// Start observing theme changes
themeObserver.observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["style"],
});

// Update the message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "toggleButton") {
    const buttons = document.querySelectorAll(message.button === "block" ? ".x-block-button" : ".x-mute-button");
    buttons.forEach((button) => {
      button.classList.toggle("show", message.show);
    });
  } else if (message.type === "getTheme") {
    const theme = getCurrentTheme();
    sendResponse({ theme });
    return true;
  } else if (message.type === "TOGGLE_BUTTON_VISIBILITY") {
    const { button, visible } = message;

    if (button === "block") {
      document.querySelectorAll(".x-block-button").forEach((button) => {
        button.classList.toggle("show", visible);
      });
    } else if (button === "mute") {
      document.querySelectorAll(".x-mute-button").forEach((button) => {
        button.classList.toggle("show", visible);
      });
    }
  }
});
