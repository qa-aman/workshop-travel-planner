"use client";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import type { ReactNode } from "react";

const FONT_UI = "'Space Grotesk', system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
const FONT_MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#152238" },
    warning: { main: "#E8A23D" },
    success: { main: "#3C7A5B" },
    error: { main: "#BD4B2C" },
    background: { default: "#F2EFE4", paper: "#FBFAF5" },
    text: { primary: "#152238", secondary: "#5B6270" },
  },
  shape: { borderRadius: 6 },
  typography: {
    fontFamily: FONT_UI,
    h4: { fontWeight: 700, letterSpacing: "-0.01em" },
    subtitle2: { fontWeight: 600 },
    button: { textTransform: "none", fontWeight: 600 },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: "none",
          border: "1px solid rgba(21, 34, 56, 0.12)",
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 4 },
      },
    },
  },
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}

export { FONT_MONO };
