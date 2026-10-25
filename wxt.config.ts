import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Tab Debt',
    description: 'An agent that sorts your open tabs into tasks, reading, projects and done, so you start each day clean.',
    permissions: ['tabs', 'storage', 'alarms', 'idle', 'sidePanel', 'scripting'],
    optional_host_permissions: ['<all_urls>'],
    action: { default_title: 'Open Tab Debt' },
  },
});
