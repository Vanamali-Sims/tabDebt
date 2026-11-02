import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Tab Debt',
    description: 'An agent that sorts your open tabs into tasks, reading, projects and done, so you start each day clean.',
    permissions: ['tabs', 'tabGroups', 'storage', 'alarms', 'idle', 'sidePanel', 'scripting', 'notifications', 'contextMenus'],
    optional_host_permissions: ['<all_urls>'],
    // End-to-end tests can't click a permission prompt, so test builds get site access up front.
    ...(process.env.TABDEBT_E2E ? { host_permissions: ['<all_urls>'] } : {}),
    icons: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 96: 'icon/96.png', 128: 'icon/128.png' },
    action: { default_title: 'Open Tab Debt' },
  },
});
