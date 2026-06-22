const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Intercept react-native-maps imports and redirect them to our stub when bundling for the web
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'react-native-maps') {
    return {
      filePath: path.resolve(__dirname, 'web-stubs/react-native-maps.js'),
      type: 'sourceFile',
    };
  }
  
  // Delegate to the default resolver for all other modules
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
