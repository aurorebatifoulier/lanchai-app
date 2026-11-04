// Metro = Expo's default config + Sentry (debug IDs for source maps uploaded on EAS builds).
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);
