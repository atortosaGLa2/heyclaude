/** Color theme for heyclaude UI chrome */
export interface Theme {
  name: string;
  bg: string;
  border: string;
  accent1: string;
  accent2: string;
  dim: string;
  text: string;
}

export const THEMES: Record<string, Theme> = {
  claude: {
    name: 'claude',
    bg: '#1a1a2e',
    border: '#2a2a4e',
    accent1: '#da7756',
    accent2: '#7c6af7',
    dim: '#646682',
    text: '#e0e0e0',
  },
  ocean: {
    name: 'ocean',
    bg: '#0f172a',
    border: '#1e293b',
    accent1: '#2dd4bf',
    accent2: '#3b82f6',
    dim: '#475569',
    text: '#e2e8f0',
  },
  forest: {
    name: 'forest',
    bg: '#1a2e1a',
    border: '#2a4e2a',
    accent1: '#22c55e',
    accent2: '#f59e0b',
    dim: '#4a6a4a',
    text: '#d4e4d4',
  },
  neon: {
    name: 'neon',
    bg: '#0a0a0a',
    border: '#1a1a1a',
    accent1: '#ec4899',
    accent2: '#06b6d4',
    dim: '#404040',
    text: '#f0f0f0',
  },
  mono: {
    name: 'mono',
    bg: '#1a1a1a',
    border: '#333333',
    accent1: '#cccccc',
    accent2: '#888888',
    dim: '#555555',
    text: '#dddddd',
  },
};

export function getTheme(name: string): Theme {
  return THEMES[name] ?? THEMES.claude;
}

/**
 * Per-animal default theme.
 * Applied when the user hasn't set an explicit --theme flag.
 * Animals not listed here get the 'claude' default.
 */
export const ANIMAL_THEMES: Record<string, string> = {
  // Ocean / aquatic
  dolphin: 'ocean', narwhal: 'ocean', octopus: 'ocean', jellyfish: 'ocean',
  seahorse: 'ocean', crab: 'ocean', lobster: 'ocean', manatee: 'ocean',
  walrus: 'ocean', otter: 'ocean', axolotl: 'ocean', platypus: 'ocean',
  penguin: 'ocean', pelican: 'ocean', puffin: 'ocean', swan: 'ocean',
  crane: 'ocean', flamingo: 'ocean', duck: 'ocean', duckling: 'ocean',

  // Forest / earth
  bear: 'forest', deer: 'forest', fox: 'forest', wolf: 'forest',
  bunny: 'forest', rabbit: 'forest', squirrel: 'forest', hedgehog: 'forest',
  badger: 'forest', beaver: 'forest', chipmunk: 'forest', raccoon: 'forest',
  lynx: 'forest', wolverine: 'forest', weasel: 'forest', lemur: 'forest',
  meerkat: 'forest', sloth: 'forest', koala: 'forest', panda: 'forest',
  newt: 'forest', salamander: 'forest', viper: 'forest', snail: 'forest',
  frog: 'forest', turtle: 'forest', hare: 'forest', hamster: 'forest',
  giraffe: 'forest', elephant: 'forest', hippo: 'forest', alpaca: 'forest',
  llama: 'forest', pony: 'forest', piglet: 'forest', porcupine: 'forest',

  // Neon / mythical / colorful
  dragon: 'neon', phoenix: 'neon', unicorn: 'neon', robot: 'neon',
  dragonfly: 'neon', moth: 'neon', bee: 'neon', bumblebee: 'neon',
  ladybug: 'neon', parrot: 'neon', peacock: 'neon', toucan: 'neon',
  hummingbird: 'neon',

  // Dark / monochrome
  raven: 'mono', owl: 'mono', bat: 'mono',
};

export function listThemes(): string[] {
  return Object.keys(THEMES);
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

export interface ThemeAnsi {
  bg: string;
  border: string;
  accent1: string;
  accent2: string;
  dim: string;
  text: string;
  bgFull: string;
}

export function themeToAnsi(theme: Theme): ThemeAnsi {
  const fg = (hex: string) => {
    const [r, g, b] = hexToRgb(hex);
    return `\x1b[38;2;${r};${g};${b}m`;
  };
  const bgc = (hex: string) => {
    const [r, g, b] = hexToRgb(hex);
    return `\x1b[48;2;${r};${g};${b}m`;
  };
  return {
    bg: theme.bg,
    border: fg(theme.border),
    accent1: fg(theme.accent1),
    accent2: fg(theme.accent2),
    dim: fg(theme.dim),
    text: fg(theme.text),
    bgFull: bgc(theme.bg),
  };
}
