// Builds a self-contained HTML page that draws a Lightweight Charts chart.
// Used by the WebView (iOS/Android) and an iframe (web preview).
const LWC_URL = "https://unpkg.com/lightweight-charts@5.2.1/dist/lightweight-charts.standalone.production.js";

/**
 * payload: { candles?, overlays?, panes?, markers?, line? }
 *   - candles + overlays/panes/markers -> price chart
 *   - line: [{ time, value }]          -> single line chart (equity curve)
 */
export function chartHtml(payload) {
  // Escape "<" so the JSON can't close the <script> tag
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>html,body{margin:0;padding:0;background:#fff;height:100%;overflow:hidden;font-family:-apple-system,Roboto,sans-serif}
#c{position:absolute;inset:0}#err{display:none;padding:16px;color:#5d6b64;font-size:14px}</style>
<script src="${LWC_URL}"></script></head><body><div id="c"></div><div id="err">Couldn't load the chart. Check your connection.</div>
<script>
(function(){
  if (!window.LightweightCharts) { document.getElementById("err").style.display = "block"; return; }
  var L = window.LightweightCharts, d = ${json}, el = document.getElementById("c");
  var chart = L.createChart(el, {
    autoSize: true,
    layout: { background: { type: "solid", color: "#ffffff" }, textColor: "#3d4a44", fontSize: 10, panes: { separatorColor: "#e3e0d4" } },
    grid: { vertLines: { color: "#f1efe7" }, horzLines: { color: "#f1efe7" } },
    rightPriceScale: { borderColor: "#e3e0d4" },
    timeScale: { borderColor: "#e3e0d4", timeVisible: true, secondsVisible: false, rightOffset: 2 },
    handleScroll: { vertTouchDrag: false, horzTouchDrag: true },
    handleScale: { pinch: true, axisPressedMouseMove: false }
  });
  if (d.line) {
    chart.addSeries(L.LineSeries, { color: "#0f3d2e", lineWidth: 2, priceLineVisible: false }).setData(d.line);
    chart.timeScale().fitContent();
    return;
  }
  var main = chart.addSeries(L.CandlestickSeries, { upColor: "#15a36b", downColor: "#e0473a", borderVisible: false, wickUpColor: "#15a36b", wickDownColor: "#e0473a" });
  main.setData(d.candles);
  (d.overlays || []).forEach(function(o){ chart.addSeries(L.LineSeries, { color: o.color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false }).setData(o.data); });
  (d.panes || []).forEach(function(p, i){
    p.series.forEach(function(s){
      var def = s.type === "histogram" ? L.HistogramSeries : L.LineSeries;
      chart.addSeries(def, s.type === "histogram" ? { color: s.color, priceLineVisible: false } : { color: s.color, lineWidth: 1.5, priceLineVisible: false }, i + 1).setData(s.data);
    });
  });
  chart.panes().forEach(function(p, i){ p.setStretchFactor(i === 0 ? 3 : 1); });
  if (d.markers && d.markers.length) L.createSeriesMarkers(main, d.markers);
  var n = d.candles.length;
  if (n > 150) chart.timeScale().setVisibleLogicalRange({ from: n - 150, to: n + 2 }); else chart.timeScale().fitContent();
})();
</script></body></html>`;
}

// Short labels keep markers readable on a phone-sized chart
export const phoneMarkers = (markers) => markers.map((m) => ({ ...m, text: m.text === "Buy" || m.text === "Short" ? "" : m.text }));

export const chartHeight = (payload) => (payload.line ? 180 : 300 + (payload.panes?.length || 0) * 110);
