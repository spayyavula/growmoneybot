import { Platform } from "react-native";

export const colors = {
  forest: "#0f3d2e",
  forest2: "#15523d",
  lime: "#c8f169",
  mint: "#7bd389",
  cream: "#f7f5ee",
  paper: "#ffffff",
  ink: "#13201b",
  muted: "#5d6b64",
  line: "#e3e0d4",
  pos: "#11865a",
  neg: "#c43b2f",
  danger: "#b4352a",
  warnBg: "#fff7ec",
  warnLine: "#f4d9b3",
  warnText: "#7a4a0c",
  tint: "#eef6f0",
  code: "#0f1f19",
  codeText: "#d7f2e1",
};

export const fonts = {
  serif: Platform.select({ ios: "Georgia", android: "serif", default: "Georgia, serif" }),
  mono: Platform.select({ ios: "Menlo", android: "monospace", default: "ui-monospace, Menlo, monospace" }),
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = { sm: 10, md: 14, lg: 18, pill: 999 };
export const TAP = 44; // minimum touch target

export const signColor = (n) => (n > 0 ? colors.pos : n < 0 ? colors.neg : colors.ink);
