import { createElement, useMemo } from "react";
import { View } from "react-native";
import { chartHtml, chartHeight } from "./chartHtml.js";
import { colors } from "../theme.js";

/** Web preview: same chart page as the native WebView, in an iframe. */
export default function PriceChart({ payload }) {
  const html = useMemo(() => chartHtml(payload), [payload]);
  return (
    <View style={{ height: chartHeight(payload), borderWidth: 1, borderColor: colors.line, borderRadius: 12, overflow: "hidden" }}>
      {createElement("iframe", { srcDoc: html, title: "Chart", style: { border: 0, width: "100%", height: "100%" } })}
    </View>
  );
}
