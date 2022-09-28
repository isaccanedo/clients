/* eslint-disable */
const config = require("./tailwind.config.base");

config.content = ["./libs/components/src/**/*.{html,ts,mdx}", "./.storybook/preview.js"];
config.safelist = [
  {
    pattern: /tw-bg-(.*)/,
  },
];

module.exports = config;
