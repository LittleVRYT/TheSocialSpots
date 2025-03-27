import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { ThemeProvider } from './components/theme-provider';

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="system">
      <App />
    </ThemeProvider>
  </React.StrictMode>
);


// components/theme-provider.js
import React, { useState, createContext, useContext } from 'react';

const ThemeContext = createContext('light');

export const ThemeProvider = ({ children, defaultTheme }) => {
  const [theme, setTheme] = useState(defaultTheme || 'light');

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <div className={`theme-${theme}`}> {/* Apply theme class */}
        {children}
      </div>
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  return useContext(ThemeContext);
};

// components/dark-mode-toggle.js
import React from 'react';
import { useTheme } from './theme-provider';

const DarkModeToggle = () => {
  const { theme, toggleTheme } = useTheme();
  return (
    <button onClick={toggleTheme} className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
      {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
    </button>
  );
};

export default DarkModeToggle;

//App.js (Example implementation - needs to be adjusted to your actual App component)
import React from 'react';
import DarkModeToggle from './components/dark-mode-toggle';
import { useTheme } from './components/theme-provider';


function App() {
  const { theme } = useTheme();
  return (
    <div>
      <h1>Hello, world!</h1>
      <p>Current theme: {theme}</p>
      <DarkModeToggle />
    </div>
  );
}

export default App;

//index.css (example)
.theme-light {
  background-color: white;
  color: black;
}

.theme-dark {
  background-color: black;
  color: white;
}