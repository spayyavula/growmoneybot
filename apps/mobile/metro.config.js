// Expo's default Metro config detects the npm workspace and watches ../../packages automatically.
const { getDefaultConfig } = require("expo/metro-config");

module.exports = getDefaultConfig(__dirname);
