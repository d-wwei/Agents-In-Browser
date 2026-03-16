// Sensitive site patterns - block browser tool execution on these domains
export const SENSITIVE_SITE_PATTERNS: RegExp[] = [
  // Banking & financial
  /^https?:\/\/(www\.)?.*\.bank\b/i,
  /^https?:\/\/(www\.)?(chase|wellsfargo|bankofamerica|citi|capitalone|usbank|pnc|tdbank|hsbc)\./i,
  /^https?:\/\/(www\.)?(paypal|venmo|stripe|square|wise|revolut|robinhood|coinbase|binance)\./i,

  // Password & auth
  /^https?:\/\/accounts\.google\.com/i,
  /^https?:\/\/login\.(microsoftonline|live)\.com/i,
  /^https?:\/\/(www\.)?icloud\.com\/account/i,
  /^https?:\/\/.*\.okta\.com/i,
  /^https?:\/\/.*\.auth0\.com/i,
  /^https?:\/\/.*\.onelogin\.com/i,

  // Enterprise admin
  /^https?:\/\/console\.(aws\.amazon|cloud\.google)\.com/i,
  /^https?:\/\/portal\.azure\.com/i,

  // Chrome internal
  /^chrome:\/\//i,
  /^chrome-extension:\/\//i,
  /^about:/i,
];

// Payment-related button text patterns
export const PAYMENT_BUTTON_PATTERNS: RegExp[] = [
  /\b(pay|purchase|buy|checkout|place\s*order|submit\s*order|confirm\s*payment)\b/i,
  /\b(付款|支付|购买|下单|确认订单|立即购买)\b/,
  /\b(subscribe|upgrade|donate)\b/i,
];

// Password field selectors
export const PASSWORD_FIELD_SELECTORS = [
  'input[type="password"]',
  'input[name*="password" i]',
  'input[name*="passwd" i]',
  'input[name*="pass" i]',
  'input[autocomplete="current-password"]',
  'input[autocomplete="new-password"]',
];

// Tab group
export const AGENT_TAB_GROUP_TITLE = "Agent Workspace";
export const AGENT_TAB_GROUP_COLOR: chrome.tabGroups.ColorEnum = "blue";

// Context menu IDs
export const CONTEXT_MENU_QUOTE_SELECTION = "acp-quote-selection";
export const CONTEXT_MENU_QUOTE_IMAGE = "acp-quote-image";
export const CONTEXT_MENU_QUOTE_LINK = "acp-quote-link";
export const CONTEXT_MENU_QUOTE_PAGE = "acp-quote-page";

// Content script injection
export const CONTENT_SCRIPT_TIMEOUT_MS = 5_000;

// Selection capture
export const SELECTION_BUTTON_ID = "acp-selection-capture-btn";
export const SELECTION_BUTTON_HIDE_DELAY_MS = 3_000;
export const IMAGE_HOVER_MIN_SIZE = 50; // px minimum dimension to show chat button
