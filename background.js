'use strict';

const ext = typeof browser !== 'undefined' ? browser : chrome;
const ALARM_NAME = 'ai-usage-refresh-5m';
const SUPPORTED_URLS = ['https://chatgpt.com/*', 'https://claude.ai/*'];

async function createRefreshAlarm() {
  try {
    const existing = await ext.alarms.get(ALARM_NAME);
    if (!existing) {
      await ext.alarms.create(ALARM_NAME, { periodInMinutes: 5 });
    }
  } catch (error) {
    console.warn('[AI Usage Sidebar] Failed to create alarm:', error);
  }
}

async function refreshOpenTabs() {
  try {
    const groups = await Promise.all(
      SUPPORTED_URLS.map((url) => ext.tabs.query({ url }))
    );
    const tabs = groups.flat();
    await Promise.allSettled(
      tabs.map((tab) => {
        if (!tab.id) return Promise.resolve();
        return ext.tabs.sendMessage(tab.id, { type: 'AI_USAGE_REFRESH' });
      })
    );
  } catch (error) {
    console.warn('[AI Usage Sidebar] Failed to refresh tabs:', error);
  }
}

ext.runtime.onInstalled.addListener(() => {
  createRefreshAlarm();
});

ext.runtime.onStartup.addListener(() => {
  createRefreshAlarm();
});

ext.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    refreshOpenTabs();
  }
});

createRefreshAlarm();
