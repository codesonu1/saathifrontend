/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

const tintColorLight = '#B7102A';
const tintColorDark = '#FFB3B1';

export const Colors = {
  light: {
    primary: '#B7102A',
    primaryContainer: '#DB313F',
    text: '#191C1D',
    textMuted: '#5B403F',
    background: '#F8F9FA',
    surface: '#FFFFFF',
    surfaceContainer: '#F3F4F5',
    outline: '#E4BEBC',
    secondary: '#1D3557',
    tint: tintColorLight,
    icon: '#5B403F',
    tabIconDefault: '#8F6F6E',
    tabIconSelected: tintColorLight,
  },
  dark: {
    primary: '#FFB3B1',
    primaryContainer: '#B7102A',
    text: '#F0F1F2',
    textMuted: '#E4BEBC',
    background: '#191C1D',
    surface: '#2E3132',
    surfaceContainer: '#3E4142',
    outline: '#5B403F',
    secondary: '#BBD3FD',
    tint: tintColorDark,
    icon: '#E4BEBC',
    tabIconDefault: '#8F6F6E',
    tabIconSelected: tintColorDark,
  },
};
