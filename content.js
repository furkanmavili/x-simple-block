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
  blockIcon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" ><path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" /></svg>`,
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

      // tweetElement.style.display = "none";
      console.log("Tweet blocked:", tweetInfo.tweetText);
    } catch (error) {
      console.error("Error blocking tweet:", error);
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

  addBlockButtons() {
    const tweets = document.querySelectorAll(CONFIG.tweetSelector);
    tweets.forEach((tweet) => {
      if (!tweet.querySelector(`.${CONFIG.blockButtonClass}`)) {
        const tweetInfo = this.extractTweetInfo(tweet);
        const blockButton = this.createBlockButton(() => this.blockTweet(tweetInfo, tweet));
        const actionsBar = tweet.querySelector(CONFIG.userNameSelector);
        if (actionsBar) {
          actionsBar.appendChild(blockButton);
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
