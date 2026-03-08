module.exports = {
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.js"],
  transform: {}
};

module.exports = {
  projects: [
    {
      displayName: "backend",
      testEnvironment: "node",
      testMatch: ["**/tests/unit/api/**/*.test.js", "**/tests/integration/**/*.test.js"]
    },
    {
      displayName: "frontend",
      testEnvironment: "jsdom",
      testMatch: ["**/tests/unit/frontend/**/*.test.js"]
    }
  ]
};
