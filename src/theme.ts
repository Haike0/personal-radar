import { createTheme, type MantineColorsTuple } from "@mantine/core";

const radar: MantineColorsTuple = ["#e2fbf7", "#c7f3ec", "#94e6da", "#5dd8c7", "#34ccb6", "#1bc4ab", "#05bfa5", "#00a891", "#009580", "#00806d"];
// Deep navy / graphite for dark mode surfaces (dark[7] = page, dark[6] = card)
const dark: MantineColorsTuple = ["#cfd3de", "#aeb4c3", "#8b92a5", "#5f667b", "#3b4256", "#2a3043", "#1d2233", "#141827", "#0f121e", "#0a0c15"];

export const theme = createTheme({
  primaryColor: "radar",
  primaryShade: { light: 7, dark: 5 },
  colors: { radar, dark },
  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Hiragino Sans GB", "Helvetica Neue", sans-serif',
  headings: { fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", sans-serif', fontWeight: "650" },
  defaultRadius: "lg",
  cursorType: "pointer",
  respectReducedMotion: true,
  components: {
    Card: { defaultProps: { radius: "xl", padding: "md" } },
    Button: { defaultProps: { radius: "md" } },
    Badge: { defaultProps: { radius: "sm", variant: "light" } },
    ActionIcon: { defaultProps: { radius: "md", variant: "subtle" } },
    Drawer: { defaultProps: { radius: "xl" } },
    Modal: { defaultProps: { radius: "xl", centered: true } },
  },
});
