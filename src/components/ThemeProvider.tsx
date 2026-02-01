import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'dark' | 'light';
type ColorTheme = 'default' | 'matcha' | 'newjeans' | 'lebron' | 'mario';

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  defaultColorTheme?: ColorTheme;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  colorTheme: ColorTheme;
  setColorTheme: (colorTheme: ColorTheme) => void;
};

const ThemeProviderContext = createContext<ThemeProviderState | undefined>(undefined);

export function ThemeProvider({
  children,
  defaultTheme = 'light',
  defaultColorTheme = 'default',
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem('ebk-theme') as Theme) || defaultTheme
  );
  const [colorTheme, setColorTheme] = useState<ColorTheme>(
    () => (localStorage.getItem('ebk-color-theme') as ColorTheme) || defaultColorTheme
  );

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.remove(
      'theme-default',
      'theme-matcha',
      'theme-newjeans',
      'theme-lebron',
      'theme-mario'
    );
    root.classList.add(theme);
    if (colorTheme !== 'default') {
      root.classList.add(`theme-${colorTheme}`);
    }
    localStorage.setItem('ebk-theme', theme);
    localStorage.setItem('ebk-color-theme', colorTheme);
  }, [theme, colorTheme]);

  return (
    <ThemeProviderContext.Provider value={{ theme, setTheme, colorTheme, setColorTheme }}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};