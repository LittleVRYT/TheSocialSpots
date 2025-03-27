import { createContext, useContext, useEffect } from "react";

// Simplified theme provider that only uses light mode
type ThemeProviderProps = {
  children: React.ReactNode;
};

// Empty state since we're only using light mode
type ThemeProviderState = {
  theme: "light";
  setTheme: () => void;
};

const initialState: ThemeProviderState = {
  theme: "light",
  setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({ children }: ThemeProviderProps) {
  // Set light mode on initialization
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("dark");
    root.classList.add("light");
  }, []);

  const value: ThemeProviderState = {
    theme: "light",
    setTheme: () => {}, // No-op function since we only support light mode
  };

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);
  
  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");
  
  return context;
};