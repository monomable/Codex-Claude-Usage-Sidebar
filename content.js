'use strict';

(() => {
  const ext = typeof browser !== 'undefined' ? browser : chrome;
  const IS_CLAUDE = location.hostname === 'claude.ai';
  const PROVIDER = IS_CLAUDE ? 'claude' : 'codex';
  const PROVIDER_NAME = IS_CLAUDE ? 'Claude' : 'Codex';
  const CARD_ID = `${PROVIDER}-usage-sidebar-card`;
  const REFRESH_MS = 5 * 60 * 1000;
  const REINJECT_MS = 2000;
  const CODEX_USAGE_PATHS = ['/backend-api/wham/usage', '/api/codex/usage'];
  const CACHE_USAGE_KEY = `${PROVIDER}UsageSnapshot`;
  const CACHE_UPDATED_KEY = `${PROVIDER}UsageUpdatedAt`;
  const UI_LOCALE = (() => {
    const language = (navigator.language || 'en').toLowerCase();
    if (language.startsWith('ko')) return 'ko';
    if (language.startsWith('ja')) return 'ja';
    if (language.startsWith('zh')) return 'zh';
    return 'en';
  })();
  const UI_TEXT = {
    ko: {
      usage: '사용량', loading: '사용량을 불러오는 중…', refresh: '지금 갱신', autoRefresh: '5분마다 자동 갱신',
      fiveHour: '5시간', weekly: '주간', daily: '24시간', days: '일', hours: '시간', minutes: '분', after: '후',
      remaining: (value) => `${value}% 남음`, resetUnavailable: '리셋 시간 정보 없음', notUpdated: '아직 갱신 안 됨',
      updated: '갱신', retry: '↻ 버튼으로 재시도', limitReached: (name) => `현재 ${name} 사용 한도에 도달했습니다.`,
      loginRequired: (name, status) => `${name} 로그인이 필요합니다 (HTTP ${status}).`,
      accessDenied: (name, status) => `현재 계정에서 ${name} 사용량 조회가 거부되었습니다 (HTTP ${status}).`,
      requestFailed: (name, status) => `${name} 사용량 조회 실패 (HTTP ${status}).`,
      requestFailedWithMessage: (name, message) => `${name} 사용량 조회 실패: ${message}`,
      unknownError: '알 수 없는 오류', responseFormat: '사용량 응답 형식을 해석하지 못했습니다.',
      organizationNotFound: 'Claude 채팅 조직을 찾지 못했습니다.', plan: '플랜', organization: '조직'
    },
    en: {
      usage: 'Usage', loading: 'Loading usage…', refresh: 'Refresh now', autoRefresh: 'Auto-refreshes every 5 minutes',
      fiveHour: '5 hours', weekly: 'Weekly', daily: '24 hours', days: 'days', hours: 'hours', minutes: 'minutes', after: 'from now',
      remaining: (value) => `${value}% remaining`, resetUnavailable: 'Reset time unavailable', notUpdated: 'Not updated yet',
      updated: 'updated', retry: '↻ Click to retry', limitReached: (name) => `The ${name} usage limit has been reached.`,
      loginRequired: (name, status) => `${name} login is required (HTTP ${status}).`,
      accessDenied: (name, status) => `Usage access for ${name} was denied (HTTP ${status}).`,
      requestFailed: (name, status) => `${name} usage request failed (HTTP ${status}).`,
      requestFailedWithMessage: (name, message) => `${name} usage request failed: ${message}`,
      unknownError: 'unknown error', responseFormat: 'The usage response format could not be interpreted.',
      organizationNotFound: 'No Claude chat organization was found.', plan: 'Plan', organization: 'Organization'
    },
    ja: {
      usage: '使用量', loading: '使用量を読み込み中…', refresh: '今すぐ更新', autoRefresh: '5分ごとに自動更新',
      fiveHour: '5時間', weekly: '週間', daily: '24時間', days: '日', hours: '時間', minutes: '分', after: '後',
      remaining: (value) => `残り ${value}%`, resetUnavailable: 'リセット時刻情報なし', notUpdated: '未更新',
      updated: '更新', retry: '↻ クリックして再試行', limitReached: (name) => `${name}の使用上限に達しました。`,
      loginRequired: (name, status) => `${name}へのログインが必要です (HTTP ${status})。`,
      accessDenied: (name, status) => `現在のアカウントでは${name}の使用量を取得できません (HTTP ${status})。`,
      requestFailed: (name, status) => `${name}の使用量取得に失敗しました (HTTP ${status})。`,
      requestFailedWithMessage: (name, message) => `${name}の使用量取得に失敗しました: ${message}`,
      unknownError: '不明なエラー', responseFormat: '使用量の応答形式を解釈できませんでした。',
      organizationNotFound: 'Claudeのチャット組織が見つかりません。', plan: 'プラン', organization: '組織'
    },
    zh: {
      usage: '用量', loading: '正在加载用量…', refresh: '立即刷新', autoRefresh: '每 5 分钟自动刷新',
      fiveHour: '5 小时', weekly: '每周', daily: '24 小时', days: '天', hours: '小时', minutes: '分钟', after: '后',
      remaining: (value) => `剩余 ${value}%`, resetUnavailable: '没有重置时间信息', notUpdated: '尚未更新',
      updated: '已更新', retry: '↻ 点击重试', limitReached: (name) => `已达到 ${name} 使用上限。`,
      loginRequired: (name, status) => `需要登录 ${name} (HTTP ${status})。`,
      accessDenied: (name, status) => `当前账号无法获取 ${name} 用量 (HTTP ${status})。`,
      requestFailed: (name, status) => `${name} 用量获取失败 (HTTP ${status})。`,
      requestFailedWithMessage: (name, message) => `${name} 用量获取失败：${message}`,
      unknownError: '未知错误', responseFormat: '无法解析用量响应格式。',
      organizationNotFound: '未找到 Claude 聊天组织。', plan: '套餐', organization: '组织'
    }
  };
  const text = (key, ...args) => {
    const value = UI_TEXT[UI_LOCALE][key];
    return typeof value === 'function' ? value(...args) : value;
  };
  const localeForDate = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', zh: 'zh-CN' }[UI_LOCALE];

  let inFlight = false;
  let refreshTimer = null;
  let lastUsage = null;
  let lastUpdatedAt = null;
  let lastError = null;
  let mutationTimer = null;

  const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));

  function numberOrNull(...values) {
    for (const value of values) {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return null;
  }

  function parseTimestamp(raw) {
    if (raw === null || raw === undefined || raw === '') return null;
    if (typeof raw === 'number' || /^\d+(\.\d+)?$/.test(String(raw))) {
      const n = Number(raw);
      return n > 10_000_000_000 ? n : n * 1000;
    }
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function getCodexAccessToken() {
    try {
      const el = document.getElementById('client-bootstrap');
      if (!el?.textContent) return null;
      const bootstrap = JSON.parse(el.textContent);
      return bootstrap?.session?.accessToken || null;
    } catch {
      return null;
    }
  }

  function parseCodexResetAt(windowData) {
    if (!windowData) return null;
    const resetMs = numberOrNull(windowData.reset_time_ms);
    if (resetMs !== null) return resetMs > 10_000_000_000 ? resetMs : resetMs * 1000;
    return parseTimestamp(windowData.resetsAt ?? windowData.reset_at);
  }

  function normalizeCodexWindow(windowData, fallbackName) {
    if (!windowData || typeof windowData !== 'object') return null;

    let usedPercent = numberOrNull(windowData.used_percent, windowData.usedPercent);
    const percentLeft = numberOrNull(windowData.percent_left, windowData.percentLeft);
    if (usedPercent === null && percentLeft !== null) usedPercent = 100 - percentLeft;
    if (usedPercent === null) return null;

    const durationSeconds = numberOrNull(
      windowData.limit_window_seconds,
      windowData.window_seconds,
      windowData.windowSeconds
    );

    return {
      usedPercent: clamp(usedPercent),
      remainingPercent: clamp(100 - usedPercent),
      durationSeconds,
      resetAt: parseCodexResetAt(windowData),
      fallbackName
    };
  }

  function normalizeCodexUsage(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const rate = raw.rate_limit || raw.rate_limits || {};
    const primaryRaw = rate.five_hour || rate.primary_window || rate.primary || null;
    const secondaryRaw = rate.weekly || rate.secondary_window || rate.secondary || null;

    const windows = [
      normalizeCodexWindow(primaryRaw, text('fiveHour')),
      normalizeCodexWindow(secondaryRaw, text('weekly'))
    ].filter(Boolean);

    if (!windows.length) return null;

    return {
      planType: raw.plan_type || raw.planType || null,
      windows,
      allowed: rate.allowed,
      limitReached: rate.limit_reached ?? rate.limitReached ?? windows.some((w) => w.usedPercent >= 100),
      organizationName: null
    };
  }

  function normalizeClaudeWindow(windowData, label, durationSeconds) {
    if (!windowData || typeof windowData !== 'object') return null;
    const usedPercent = numberOrNull(
      windowData.utilization,
      windowData.percent,
      windowData.used_percent,
      windowData.usedPercent
    );
    if (usedPercent === null) return null;

    return {
      usedPercent: clamp(usedPercent),
      remainingPercent: clamp(100 - usedPercent),
      durationSeconds,
      resetAt: parseTimestamp(windowData.resets_at ?? windowData.reset_at ?? windowData.resetsAt),
      fallbackName: label
    };
  }

  function findClaudeLimitFromArray(raw, wanted) {
    const limits = Array.isArray(raw?.limits) ? raw.limits : [];
    const matches = (item) => {
      const hay = [item?.kind, item?.group, item?.name, item?.label]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (wanted === 'five') return /five.?hour|5.?hour|session/.test(hay);
      return /seven.?day|7.?day|week/.test(hay) && !/opus|sonnet|haiku|cowork|oauth/.test(hay);
    };
    return limits.find(matches) || null;
  }

  function claudePlanName(org) {
    const caps = Array.isArray(org?.capabilities) ? org.capabilities.map((v) => String(v).toLowerCase()) : [];
    const joined = caps.join(' ');
    const type = String(org?.organization_type || org?.type || '').toLowerCase();
    const combined = `${joined} ${type}`;

    if (/enterprise/.test(combined)) return `Claude Enterprise`;
    if (/team/.test(combined)) return `Claude Team`;
    if (/claude_max|max/.test(combined)) return 'Claude Max';
    if (/claude_pro|pro/.test(combined)) return 'Claude Pro';
    return 'Claude';
  }

  function normalizeClaudeUsage(payload) {
    const raw = payload?.usage || payload;
    const org = payload?.org || null;
    if (!raw || typeof raw !== 'object') return null;

    const fiveRaw = raw.five_hour || findClaudeLimitFromArray(raw, 'five');
    const sevenRaw = raw.seven_day || findClaudeLimitFromArray(raw, 'seven');

    const windows = [
      normalizeClaudeWindow(fiveRaw, text('fiveHour'), 18_000),
      normalizeClaudeWindow(sevenRaw, text('weekly'), 604_800)
    ].filter(Boolean);

    if (!windows.length) return null;

    return {
      planType: claudePlanName(org),
      windows,
      allowed: true,
      limitReached: windows.some((w) => w.usedPercent >= 100),
      organizationName: org?.name || null
    };
  }

  function normalizeUsage(raw) {
    return IS_CLAUDE ? normalizeClaudeUsage(raw) : normalizeCodexUsage(raw);
  }

  function labelForWindow(windowData, index) {
    if (windowData.fallbackName) return windowData.fallbackName;
    const seconds = windowData.durationSeconds;
    if (seconds) {
      if (Math.abs(seconds - 18_000) <= 120) return text('fiveHour');
      if (Math.abs(seconds - 604_800) <= 600) return text('weekly');
      if (Math.abs(seconds - 86_400) <= 120) return text('daily');
      if (seconds >= 86_400 && seconds % 86_400 === 0) return `${Math.round(seconds / 86_400)}${text('days')}`;
      if (seconds >= 3600 && seconds % 3600 === 0) return `${Math.round(seconds / 3600)}${text('hours')}`;
    }
    return index === 0 ? `${text('usage')} 1` : `${text('usage')} 2`;
  }

  function formatReset(resetAt) {
    if (!resetAt) return text('resetUnavailable');
    const now = Date.now();
    const diff = Math.max(0, resetAt - now);
    const totalMinutes = Math.ceil(diff / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;

    let relative = '';
    if (UI_LOCALE === 'en') {
      if (days > 0) relative = `${days}d ${hours}h ${text('after')}`;
      else if (hours > 0) relative = `${hours}h ${minutes}m ${text('after')}`;
      else relative = `${minutes}m ${text('after')}`;
    } else if (UI_LOCALE === 'zh') {
      if (days > 0) relative = `${days}天${hours}小时后`;
      else if (hours > 0) relative = `${hours}小时${minutes}分钟后`;
      else relative = `${minutes}分钟后`;
    } else if (UI_LOCALE === 'ja') {
      if (days > 0) relative = `${days}日${hours}時間後`;
      else if (hours > 0) relative = `${hours}時間${minutes}分後`;
      else relative = `${minutes}分後`;
    } else if (days > 0) relative = `${days}일 ${hours}시간 후`;
    else if (hours > 0) relative = `${hours}시간 ${minutes}분 후`;
    else relative = `${minutes}분 후`;

    const absolute = new Intl.DateTimeFormat(localeForDate, {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(resetAt));

    return `${relative} · ${absolute}`;
  }

  function formatUpdated(ts) {
    if (!ts) return text('notUpdated');
    return new Intl.DateTimeFormat(localeForDate, {
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(ts));
  }

  function getSidebarCandidates() {
    const selectors = [
      '[data-testid*="sidebar"]',
      '[class*="sidebar"]',
      'nav',
      'aside'
    ];
    const seen = new Set();
    const out = [];

    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) {
        if (seen.has(el)) continue;
        seen.add(el);
        const rect = el.getBoundingClientRect();
        if (rect.width < 140 || rect.width > 460 || rect.height < 250) continue;
        if (rect.left > 90 || rect.right < 140) continue;
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;

        let score = 0;
        const text = (el.textContent || '').slice(0, 3000);
        const links = [...el.querySelectorAll('a[href]')];

        if (IS_CLAUDE) {
          if (/Claude|최근|Recents?|Chats?|대화|Projects?|프로젝트|Pinned|고정됨|ピン留め|最近|チャット|プロジェクト|固定|聊天|项目/i.test(text)) score += 5;
          score += Math.min(6, links.filter((a) => /\/chat\/|\/project\//.test(a.getAttribute('href') || '')).length);
        } else {
          if (/대화|채팅|Chats|Projects|프로젝트|Codex|Tasks|작업|Pinned|고정됨|チャット|プロジェクト|タスク|ピン留め|聊天|项目|任务|固定/i.test(text)) score += 5;
          score += Math.min(6, links.filter((a) => /\/c\/|\/codex|\/g\//.test(a.getAttribute('href') || '')).length);
        }

        if (el.tagName === 'NAV' || el.tagName === 'ASIDE') score += 2;
        out.push({ el, score, rect });
      }
    }

    out.sort((a, b) => b.score - a.score || b.rect.height - a.rect.height);
    return out.map((entry) => entry.el);
  }

  function findScrollableHost(start, sidebar) {
    let node = start?.parentElement || null;
    while (node && node !== sidebar) {
      const style = getComputedStyle(node);
      if (/(auto|scroll)/.test(style.overflowY)) return node;
      node = node.parentElement;
    }
    return sidebar;
  }

  function mountBeforeLabel(sidebar, patterns) {
    const all = sidebar.querySelectorAll('div, span, h2, h3, p');
    for (const pattern of patterns) {
      for (const el of all) {
        const text = (el.textContent || '').trim();
        if (!pattern.test(text)) continue;
        if (el.children.length > 3 || text.length > 40) continue;

        const scrollHost = findScrollableHost(el, sidebar) || sidebar;
        let anchor = el;
        while (anchor.parentElement && anchor.parentElement !== scrollHost && anchor.parentElement !== sidebar) {
          anchor = anchor.parentElement;
        }
        const parent = anchor.parentElement;
        if (parent) return { parent, before: anchor };
      }
    }
    return null;
  }

  function findConversationMount(sidebar) {
    const hrefRegex = IS_CLAUDE
      ? /\/chat\/[a-z0-9-]+/i
      : /^\/c\/|^\/codex\/(?:tasks?|chat|c)\//i;

    const chatLink = [...sidebar.querySelectorAll('a[href]')].find((a) => hrefRegex.test(a.getAttribute('href') || ''));
    if (!chatLink) return null;

    const scrollHost = findScrollableHost(chatLink, sidebar) || sidebar;
    let anchor = chatLink;
    while (anchor.parentElement && anchor.parentElement !== scrollHost && anchor.parentElement !== sidebar) {
      anchor = anchor.parentElement;
    }
    return anchor.parentElement ? { parent: anchor.parentElement, before: anchor } : null;
  }

  function findMountTarget() {
    const sidebars = getSidebarCandidates();
    for (const sidebar of sidebars) {
      if (IS_CLAUDE) {
        // Claude: place it immediately above the conversation list heading when possible.
        const labelled = mountBeforeLabel(sidebar, [
          /^(Pinned|고정됨|ピン留め|固定)$/i,
          /^(Recents?|최근|최근 대화|最近)$/i,
          /^(Chats?|대화|대화 기록|Conversations?|チャット|聊天)$/i,
        ]);
        if (labelled) return labelled;
      } else {
        // ChatGPT/Codex: keep the v1.0.1 behavior — directly above Pinned/고정됨.
        const pinned = mountBeforeLabel(sidebar, [/^(Pinned|고정됨|ピン留め|固定)$/i]);
        if (pinned) return pinned;
      }

      const conversation = findConversationMount(sidebar);
      if (conversation) return conversation;

      const scrollables = [...sidebar.querySelectorAll('div')].filter((el) => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return rect.height > 200 && /(auto|scroll)/.test(style.overflowY);
      });
      const target = scrollables[0] || sidebar;
      return { parent: target, before: target.firstElementChild || null };
    }
    return null;
  }

  function createCard() {
    const card = document.createElement('section');
    card.id = CARD_ID;
    card.setAttribute('aria-label', `${PROVIDER_NAME} ${text('usage')}`);

    const header = document.createElement('div');
    header.className = 'cus-header';
    const titleWrap = document.createElement('div');
    titleWrap.className = 'cus-title-wrap';
    const dot = document.createElement('span');
    dot.className = 'cus-dot loading';
    dot.dataset.role = 'dot';
    const title = document.createElement('span');
    title.className = 'cus-title';
    title.textContent = `${PROVIDER_NAME} ${text('usage')}`;
    titleWrap.append(dot, title);
    const refresh = document.createElement('button');
    refresh.type = 'button';
    refresh.className = 'cus-refresh';
    refresh.dataset.role = 'refresh';
    refresh.title = text('refresh');
    refresh.setAttribute('aria-label', text('refresh'));
    refresh.textContent = '↻';
    refresh.addEventListener('click', () => refreshUsage(true));
    header.append(titleWrap, refresh);

    const body = document.createElement('div');
    body.dataset.role = 'body';
    body.append(createMessage(text('loading')));

    const footer = document.createElement('div');
    footer.className = 'cus-footer';
    const plan = document.createElement('span');
    plan.dataset.role = 'plan';
    plan.textContent = PROVIDER_NAME;
    const updated = document.createElement('span');
    updated.dataset.role = 'updated';
    updated.textContent = text('autoRefresh');
    footer.append(plan, updated);

    card.append(header, body, footer);
    return card;
  }

  function ensureCard() {
    let card = document.getElementById(CARD_ID);
    const mount = findMountTarget();

    if (card && card.isConnected) {
      if (mount) {
        const shouldBeBefore = mount.before && mount.before.parentElement === mount.parent;
        const alreadyPlaced = shouldBeBefore
          ? card.parentElement === mount.parent && card.nextElementSibling === mount.before
          : card.parentElement === mount.parent && card === mount.parent.firstElementChild;

        if (!alreadyPlaced) {
          if (shouldBeBefore) mount.parent.insertBefore(card, mount.before);
          else mount.parent.prepend(card);
        }
      }
      return card;
    }

    if (!mount) return null;

    card = createCard();
    if (mount.before && mount.before.parentElement === mount.parent) {
      mount.parent.insertBefore(card, mount.before);
    } else {
      mount.parent.prepend(card);
    }
    render();
    return card;
  }

  function createMessage(message, isError = false) {
    const element = document.createElement('div');
    element.className = `cus-message${isError ? ' error' : ''}`;
    element.textContent = message;
    return element;
  }

  function createUsageRow(windowData, index) {
    const label = labelForWindow(windowData, index);
    const left = Math.round(windowData.remainingPercent * 10) / 10;
    const row = document.createElement('div');
    row.className = 'cus-row';
    const rowTop = document.createElement('div');
    rowTop.className = 'cus-row-top';
    const labelElement = document.createElement('span');
    labelElement.className = 'cus-label';
    labelElement.textContent = label;
    const percent = document.createElement('span');
    percent.className = 'cus-percent';
    percent.textContent = text('remaining', left);
    rowTop.append(labelElement, percent);
    const track = document.createElement('div');
    track.className = 'cus-track';
    track.setAttribute('aria-label', `${label} ${text('remaining', left)}`);
    const bar = document.createElement('div');
    bar.className = 'cus-bar';
    bar.style.width = `${left}%`;
    track.append(bar);
    const reset = document.createElement('div');
    reset.className = 'cus-reset';
    reset.textContent = formatReset(windowData.resetAt);
    row.append(rowTop, track, reset);
    return row;
  }

  function render() {
    const card = document.getElementById(CARD_ID) || ensureCard();
    if (!card) return;

    const body = card.querySelector('[data-role="body"]');
    const dot = card.querySelector('[data-role="dot"]');
    const refresh = card.querySelector('[data-role="refresh"]');
    const plan = card.querySelector('[data-role="plan"]');
    const updated = card.querySelector('[data-role="updated"]');

    if (refresh) refresh.disabled = inFlight;
    if (dot) dot.className = `cus-dot${inFlight ? ' loading' : lastError && !lastUsage ? ' error' : ''}`;

    if (lastUsage) {
      body.replaceChildren(...lastUsage.windows.map(createUsageRow));
      if (lastUsage.limitReached) {
        const limitMessage = createMessage(text('limitReached', PROVIDER_NAME), true);
        limitMessage.style.marginTop = '7px';
        body.append(limitMessage);
      }

      if (plan) {
        if (IS_CLAUDE) {
          plan.textContent = lastUsage.planType || 'Claude';
          if (lastUsage.organizationName) plan.title = lastUsage.organizationName;
        } else {
          plan.textContent = lastUsage.planType ? `${text('plan')}: ${lastUsage.planType}` : 'Codex';
        }
      }
      if (updated) updated.textContent = `${formatUpdated(lastUpdatedAt)} ${text('updated')}`;
    } else if (lastError) {
      body.replaceChildren(createMessage(lastError, true));
      if (plan) plan.textContent = PROVIDER_NAME;
      if (updated) updated.textContent = text('retry');
    } else {
      body.replaceChildren(createMessage(text('loading')));
      if (updated) updated.textContent = text('autoRefresh');
    }
  }

  async function fetchJson(path, options = {}) {
    const response = await fetch(`${location.origin}${path}`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        ...options.headers
      }
    });

    if (!response.ok) {
      const err = new Error(`HTTP ${response.status}`);
      err.status = response.status;
      try {
        err.body = await response.text();
      } catch {
        // Ignore body parsing failures.
      }
      throw err;
    }
    return response.json();
  }

  async function fetchCodexUsageFrom(path) {
    const headers = {
      'oai-language': navigator.language || 'ko-KR'
    };
    const accessToken = getCodexAccessToken();
    if (accessToken) headers.authorization = `Bearer ${accessToken}`;
    return fetchJson(path, { headers });
  }

  async function fetchCodexUsage() {
    let lastException = null;
    for (const path of CODEX_USAGE_PATHS) {
      try {
        return await fetchCodexUsageFrom(path);
      } catch (error) {
        lastException = error;
        if (![404, 405].includes(error?.status)) break;
      }
    }
    throw lastException || new Error('Usage request failed');
  }

  function extractProfileOrgId(profile) {
    return profile?.organization?.uuid
      || profile?.organization?.id
      || profile?.organization_uuid
      || profile?.organizationUuid
      || profile?.org_uuid
      || null;
  }

  function normalizeOrganizations(raw) {
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.data)) return raw.data;
    if (Array.isArray(raw?.organizations)) return raw.organizations;
    return [];
  }

  function orderClaudeOrganizations(orgs, preferredId) {
    return [...orgs].sort((a, b) => {
      const aId = a?.uuid || a?.id;
      const bId = b?.uuid || b?.id;
      if (preferredId && aId === preferredId && bId !== preferredId) return -1;
      if (preferredId && bId === preferredId && aId !== preferredId) return 1;
      const aChat = Array.isArray(a?.capabilities) && a.capabilities.includes('chat');
      const bChat = Array.isArray(b?.capabilities) && b.capabilities.includes('chat');
      if (aChat !== bChat) return aChat ? -1 : 1;
      return 0;
    });
  }

  async function fetchClaudeUsage() {
    let profileOrgId = null;
    try {
      const profile = await fetchJson('/api/account_profile');
      profileOrgId = extractProfileOrgId(profile);
    } catch {
      // Profile lookup is optional; /api/organizations is authoritative enough.
    }

    const orgRaw = await fetchJson('/api/organizations');
    const organizations = normalizeOrganizations(orgRaw);
    if (!organizations.length) {
      const err = new Error(text('organizationNotFound'));
      err.status = 404;
      throw err;
    }

    const ordered = orderClaudeOrganizations(organizations, profileOrgId);
    let lastException = null;

    for (const org of ordered) {
      const orgId = org?.uuid || org?.id;
      if (!orgId) continue;
      const hasChatCapability = !Array.isArray(org?.capabilities) || org.capabilities.includes('chat');
      if (!hasChatCapability && ordered.some((o) => Array.isArray(o?.capabilities) && o.capabilities.includes('chat'))) {
        continue;
      }

      try {
        const usage = await fetchJson(`/api/organizations/${encodeURIComponent(orgId)}/usage`, {
          headers: { 'anthropic-client-platform': 'web_claude_ai' }
        });
        return { usage, org };
      } catch (error) {
        lastException = error;
        // Multiple orgs are common. A console/API org may return 403; try the next chat org.
        if (![401, 403, 404].includes(error?.status)) break;
      }
    }

    throw lastException || new Error('Claude usage request failed');
  }

  async function fetchUsage() {
    return IS_CLAUDE ? fetchClaudeUsage() : fetchCodexUsage();
  }

  async function refreshUsage(manual = false) {
    if (inFlight) return;
    inFlight = true;
    lastError = null;
    ensureCard();
    render();

    try {
      const raw = await fetchUsage();
      const normalized = normalizeUsage(raw);
      if (!normalized) throw new Error(text('responseFormat'));
      lastUsage = normalized;
      lastUpdatedAt = Date.now();
      lastError = null;

      try {
        await ext.storage.local.set({
          [CACHE_USAGE_KEY]: raw,
          [CACHE_UPDATED_KEY]: lastUpdatedAt
        });
      } catch {
        // Storage is only a convenience cache; UI does not depend on it.
      }
    } catch (error) {
      const status = error?.status;
      if (status === 401) {
        lastError = text('loginRequired', PROVIDER_NAME, status);
      } else if (status === 403) {
        lastError = text('accessDenied', PROVIDER_NAME, status);
      } else if (status === 404 && IS_CLAUDE && error?.message === text('organizationNotFound')) {
        lastError = text('organizationNotFound');
      } else if (status) {
        lastError = text('requestFailed', PROVIDER_NAME, status);
      } else {
        lastError = text('requestFailedWithMessage', PROVIDER_NAME, error?.message || text('unknownError'));
      }
      if (manual) console.warn(`[${PROVIDER_NAME} Usage Sidebar]`, error);
    } finally {
      inFlight = false;
      render();
    }
  }

  function scheduleRefresh() {
    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => refreshUsage(false), REFRESH_MS);
  }

  function observeSidebar() {
    const observer = new MutationObserver(() => {
      clearTimeout(mutationTimer);
      mutationTimer = setTimeout(() => ensureCard(), 250);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    // Both sites are SPAs and may replace the sidebar after navigation.
    setInterval(ensureCard, REINJECT_MS);
  }

  ext.runtime.onMessage.addListener((message) => {
    if (message?.type === 'AI_USAGE_REFRESH' || message?.type === 'CODEX_USAGE_REFRESH') {
      refreshUsage(false);
    }
  });

  async function start() {
    try {
      const cached = await ext.storage.local.get([CACHE_USAGE_KEY, CACHE_UPDATED_KEY]);
      if (cached?.[CACHE_USAGE_KEY]) {
        lastUsage = normalizeUsage(cached[CACHE_USAGE_KEY]);
        lastUpdatedAt = cached[CACHE_UPDATED_KEY] || null;
      }
    } catch {
      // Ignore cache failure.
    }

    ensureCard();
    observeSidebar();
    scheduleRefresh();
    setTimeout(() => refreshUsage(false), 600);
  }

  start();
})();
