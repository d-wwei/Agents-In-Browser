// Browser tool definitions exposed via MCP

export interface BrowserToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  priority: "P0" | "P1";
}

export const BROWSER_TOOLS: BrowserToolDefinition[] = [
  {
    name: "browser_tabs",
    description:
      "List all open browser tabs with id, url, title, active status, and groupId",
    inputSchema: {
      type: "object",
      properties: {
        groupId: {
          type: "number",
          description: "Filter by tab group ID (optional)",
        },
      },
    },
    priority: "P0",
  },
  {
    name: "browser_read",
    description:
      "Read tab content as markdown/accessibility text. Supports optional CSS selector, max length, mode selection, and interactive element index extraction.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "Target tab ID" },
        selector: {
          type: "string",
          description: "CSS selector to extract specific content (optional)",
        },
        maxLength: {
          type: "number",
          description:
            "Maximum character length for result (default: 32000)",
        },
        includeInteractiveElements: {
          type: "boolean",
          description: "Include indexed interactive elements in the output (default: true)",
        },
        mode: {
          type: "string",
          enum: ["markdown", "accessibility", "both"],
          description: "Output mode (default: markdown)",
        },
      },
      required: ["tabId"],
    },
    priority: "P0",
  },
  {
    name: "browser_execute",
    description:
      "Execute JavaScript in a specified tab (isolated content script world). Max 10s timeout, 1MB result limit.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "Target tab ID" },
        code: { type: "string", description: "JavaScript code to execute" },
      },
      required: ["tabId", "code"],
    },
    priority: "P0",
  },
  {
    name: "browser_screenshot",
    description: "Take a screenshot of a specified tab (returns base64 PNG)",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "Target tab ID" },
        fullPage: {
          type: "boolean",
          description: "Capture full page (scrolling screenshot)",
        },
        annotate: {
          type: "boolean",
          description:
            "Annotate interactive elements with numeric index badges before capture (default: false)",
        },
      },
      required: ["tabId"],
    },
    priority: "P0",
  },
  {
    name: "browser_click",
    description: "Click an element on the page by index (preferred), CSS selector, or coordinates",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "Target tab ID" },
        index: {
          type: "number",
          description: "Element index from browser_read interactive elements list",
        },
        selector: { type: "string", description: "CSS selector of element" },
        x: { type: "number", description: "X coordinate (alternative)" },
        y: { type: "number", description: "Y coordinate (alternative)" },
      },
      required: ["tabId"],
    },
    priority: "P0",
  },
  {
    name: "browser_type",
    description: "Type text into a form field identified by index (preferred) or CSS selector",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "Target tab ID" },
        index: {
          type: "number",
          description: "Element index from browser_read interactive elements list",
        },
        selector: { type: "string", description: "CSS selector of input field" },
        text: { type: "string", description: "Text to type" },
        clearFirst: {
          type: "boolean",
          description: "Clear field before typing (default: true)",
        },
      },
      required: ["tabId", "text"],
    },
    priority: "P0",
  },
  {
    name: "browser_navigate",
    description: "Navigate a tab to a specified URL",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "Target tab ID" },
        url: { type: "string", description: "URL to navigate to" },
      },
      required: ["tabId", "url"],
    },
    priority: "P0",
  },
  {
    name: "browser_console",
    description: "Read console log messages from a tab",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "Target tab ID" },
        limit: {
          type: "number",
          description: "Max number of messages to return (default: 50)",
        },
      },
      required: ["tabId"],
    },
    priority: "P1",
  },
  {
    name: "browser_network",
    description: "Read network requests from a tab",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "Target tab ID" },
        limit: {
          type: "number",
          description: "Max number of requests to return (default: 50)",
        },
      },
      required: ["tabId"],
    },
    priority: "P1",
  },
  {
    name: "browser_scroll",
    description: "Scroll the page in a tab",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "Target tab ID" },
        direction: {
          type: "string",
          enum: ["up", "down", "left", "right"],
          description: "Scroll direction",
        },
        amount: {
          type: "number",
          description: "Scroll amount in pixels (default: 500)",
        },
      },
      required: ["tabId", "direction"],
    },
    priority: "P1",
  },
  {
    name: "browser_select",
    description: "Select an option in a dropdown/select element by index (preferred) or CSS selector",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "Target tab ID" },
        index: {
          type: "number",
          description: "Element index from browser_read interactive elements list",
        },
        selector: {
          type: "string",
          description: "CSS selector of select element",
        },
        value: { type: "string", description: "Option value to select" },
      },
      required: ["tabId", "value"],
    },
    priority: "P1",
  },
  {
    name: "browser_wait",
    description: "Wait for an element to appear or page to finish loading",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "number", description: "Target tab ID" },
        selector: {
          type: "string",
          description: "CSS selector to wait for",
        },
        timeout: {
          type: "number",
          description: "Timeout in milliseconds (default: 10000)",
        },
        condition: {
          type: "string",
          enum: ["visible", "hidden", "attached", "loaded"],
          description: "Wait condition (default: visible)",
        },
      },
      required: ["tabId"],
    },
    priority: "P1",
  },
];

export const P0_TOOL_NAMES = BROWSER_TOOLS.filter(
  (t) => t.priority === "P0",
).map((t) => t.name);

// Current canonical tool count used across MCP exposure and docs.
export const BROWSER_TOOL_COUNT = BROWSER_TOOLS.length;
