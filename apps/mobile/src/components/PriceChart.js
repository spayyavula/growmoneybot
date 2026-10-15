import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { chartHtml, chartHeight } from "./chartHtml.js";
import { colors } from "../theme.js";

/** Lightweight Charts rendered inside a WebView (iOS + Android). */
export default function PriceChart({ payload }) {
  const html = useMemo(() => chartHtml(payload), [payload]);
  return (
    <View style={[st.box, { height: chartHeight(payload) }]}>
      <WebView
        originWhitelist={["*"]}
        source={{ html, baseUrl: "https://growmoneybot.com" }}
        scrollEnabled={false}
        nestedScrollEnabled
        setSupportMultipleWindows={false}
        javaScriptEnabled
        style={{ backgroundColor: "transparent" }}
      />
    </View>
  );
}

const st = StyleSheet.create({
  box: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, overflow: "hidden", backgroundColor: colors.paper },
});
