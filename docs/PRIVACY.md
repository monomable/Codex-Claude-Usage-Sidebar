# Privacy Policy

## Data access

Codex + Claude Usage Sidebar runs locally in Firefox. It reads usage information from the currently authenticated web sessions on `chatgpt.com` and `claude.ai`.

The extension may read:

- Usage-limit responses returned by the supported web applications
- The current Claude organization identifier and organization metadata needed to select a chat-capable organization
- The Codex access token exposed in the page bootstrap data, only to authenticate the usage request made to ChatGPT/Codex

## Storage

The last successful usage response and its timestamp are stored in Firefox extension local storage. This cache is used to show the previous result while a new request is being made. No data is stored outside the browser by this extension.

## Data sharing

The extension does not operate a remote server, use Firebase, send analytics, or transmit usage data to the extension author. Requests are made directly to the first-party origins:

- `https://chatgpt.com`
- `https://claude.ai`

The first-party services may process requests according to their own privacy policies and terms.

## API keys and billing data

The extension does not request or store OpenAI or Anthropic API keys. It does not call Claude's prepaid-credit endpoint and does not read payment or credit-card information.

## Changes

This policy may be updated if the extension's data handling changes.
