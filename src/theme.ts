import { createTheme, type MantineColorsTuple } from "@mantine/core";

const radar: MantineColorsTuple = ["#e2fbf7", "#c7f3ec", "#94e6da", "#5dd8c7", "#34ccb6", "#1bc4ab", "#05bfa5", "#00a891", "#009580", "#00806d"];
// Deep navy / graphite for dark mode surfaces (dark[7] = page, dark[6] = card)
const dark: MantineColorsTuple = ["#cfd3de", "#aeb4c3", "#8b92a5", "#5f667b", "#3b4256", "#2a3043", "#1d2233", "#141827", "#0f121e", "#0a0c15"];

export const theme = createTheme({
  primaryColor: "radar",
  primaryShade: { light: 7, dark: 5 },
  colors: { radar, dark },
  fontFamily: "var(--app-font)", // set per language in globals.css
  headings: { fontFamily: "var(--app-font)", fontWeight: "650" },
  defaultRadius: "lg",
  cursorType: "pointer",
  respectReducedMotion: true,
  // every Mantine button / icon button / chip springs under the finger (.press in globals.css) instead of a 1px nudge
  activeClassName: "press",
  components: {
    Card: { defaultProps: { radius: "xl", padding: "md" } },
    Button: { defaultProps: { radius: "md" } },
    Badge: { defaultProps: { radius: "sm", variant: "light" } },
    ActionIcon: { defaultProps: { radius: "md", variant: "subtle" } },
    // dialogs and menus open with a short spring instead of popping in or fading slowly
    Drawer: { defaultProps: { radius: "xl", transitionProps: { duration: 320, timingFunction: "cubic-bezier(.2, .8, .2, 1)" } } },
    Modal: { defaultProps: { radius: "xl", centered: true, transitionProps: { transition: "pop", duration: 240, timingFunction: "cubic-bezier(.2, .8, .2, 1)" } } },
    Menu: { defaultProps: { transitionProps: { transition: "pop", duration: 180 } } },
    Popover: { defaultProps: { transitionProps: { transition: "pop", duration: 180 } } },
    Tooltip: { defaultProps: { transitionProps: { transition: "fade", duration: 140 } } },
    Collapse: { defaultProps: { transitionDuration: 260, transitionTimingFunction: "cubic-bezier(.2, .8, .2, 1)" } },
  },
});
