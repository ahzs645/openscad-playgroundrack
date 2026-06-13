/** @type {import('jest-environment-puppeteer').JestPuppeteerConfig} */
const config = {
  launch: {
    headless: process.env.CI === "true",
    args: [
      // https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md#what-if-i-dont-have-root-access-to-the-machine-and-cant-install-anything
      '--no-sandbox',
    ],
  },
  server: {
    command: process.env.NODE_ENV === 'production'
      ? 'npm run serve:test:production'
      : 'npm run start:test',
    protocol: 'http',
    host: '127.0.0.1',
    port: process.env.NODE_ENV === 'production' ? 3000 : 4000,
    launchTimeout: 240000,
  },
};

export default config;
