# Codex + Claude Usage Sidebar

Monitor your Codex and Claude usage limits directly inside the left sidebar of their web applications with this Firefox extension.

## Overview

This extension displays the remaining usage quota for ChatGPT/Codex and Claude. It shows the current 5-hour and weekly limits, remaining percentages, reset times, and available plan information without requiring a separate API key or external service.

## Installation

### Chrome

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the project folder.
6. Refresh any open `chatgpt.com` and `claude.ai` tabs.

Chrome loads `manifest_chrome.json` rather than the Firefox `manifest.json`. Since Chrome expects the standard Manifest V3 service worker format, rename a copy of `manifest_chrome.json` to `manifest.json` in a separate folder before selecting **Load unpacked**, or package the Chrome manifest as the root manifest for distribution.

### Firefox

1. Download or clone this repository.
2. Open `about:debugging#/runtime/this-firefox` in Firefox.
3. Click **Load Temporary Add-on...**.
4. Select the `manifest.json` file in the project folder.
5. Refresh any open `chatgpt.com` and `claude.ai` tabs.

Both browser versions share the same content script, stylesheet, usage normalization, and sidebar design. There is no packaged store release yet.

## Features

The extension tracks usage from the supported web applications:

- **Codex / ChatGPT** - 5-hour and weekly usage limits
- **Claude** - 5-hour and weekly usage limits
- **Remaining quota** - Displayed as a percentage and progress bar
- **Reset information** - Relative countdown and local reset date/time
- **Plan information** - Shown when returned by the service
- **Manual refresh** - Refresh immediately with the `↻` button
- **Automatic refresh** - Updates every five minutes
- **SPA support** - Re-inserts and repositions the card after sidebar navigation or re-rendering
- **Theme support** - Follows the site's light or dark appearance

The usage card is placed near the conversation sections in each site's left sidebar. On ChatGPT/Codex it is placed above `Pinned`/`고정됨` when possible. On Claude it is placed above `Pinned`, `Recents`, or `Chats` when those headings are available.

## How It Works

### ChatGPT / Codex

The extension requests usage data from the web application using these internal endpoints:

- `/backend-api/wham/usage`
- `/api/codex/usage` as a fallback

### Claude

The extension uses Claude's web application endpoints to find an available chat organization and request its usage data:

- `/api/account_profile`
- `/api/organizations`
- `/api/organizations/{orgId}/usage`

When multiple Claude organizations are available, chat-capable organizations are preferred. Organizations that return an authorization or not-found error are skipped when another eligible organization is available.

## Privacy

The extension runs locally in Firefox and uses your existing login session on `chatgpt.com` and `claude.ai`.

- No OpenAI or Anthropic API key is required.
- No usage data is sent to an extension-owned server.
- The last successful usage response and update time are cached in Firefox local storage for convenience.
- The extension does not use Firebase, analytics, or third-party tracking.
- The Claude prepaid credits endpoint is not requested, and payment information is not accessed.

For more details, see the [privacy policy](PRIVACY.md).

## Permissions

The extension uses the following permissions:

- `alarms` - Schedule the five-minute background refresh
- `storage` - Cache the last successful usage response locally
- `tabs` - Send refresh messages to open supported tabs
- `chatgpt.com` - Read usage data and display the Codex card
- `claude.ai` - Read usage data and display the Claude card

## Limitations

- The extension depends on internal web application endpoints that are not public APIs.
- Changes to authentication, response formats, endpoint paths, or sidebar DOM structures may require an update.
- Usage values and reset times are limited to what each service returns for the signed-in account.
- Plan names may appear as the generic `Codex` or `Claude` when detailed plan information is unavailable.

## Project Structure

```text
manifest.json   Firefox extension configuration and permissions
manifest_chrome.json  Chrome Manifest V3 configuration
background.js   Periodic refresh alarm and tab messaging
content.js      Usage requests, normalization, caching, and sidebar injection
content.css     Usage card layout and theme styles
icons/          Extension icons for Firefox and high-resolution displays
PRIVACY.md      Privacy policy
README.md       Project documentation
```
