const versionCommit = /^v?\d+\.\d+\.\d+$/;

export default {
  extends: ['@commitlint/config-conventional'],
  ignores: [(message) => versionCommit.test(message)],
};