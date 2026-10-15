import { useEffect, useRef, useState } from "react";
import {
  createChart, createSeriesMarkers, CandlestickSeries, LineSeries, HistogramSeries, ColorType, CrosshairMode,
} from "lightweight-charts";

const isPhone = () => typeof window !== "undefined" && window.matchMedia("(max-width: 599px)").matches;

function usePhone() {
  const [phone, setPhone] = useState(isPhone);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 599px)");
    const on = () => setPhone(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return phone;
}

const chartOptions = (height, phone) => ({
  height,
  autoSize: true,
  layout: {
    background: { type: ColorType.Solid, color: "#ffffff" },
    textColor: "#3d4a44",
    fontSize: phone ? 10 : 12,
    fontFamily: "Inter, system-ui, sans-serif",
    panes: { separatorColor: "#e3e0d4", enableResize: !phone },
  },
  grid: { vertLines: { color: "#f1efe7" }, horzLines: { color: "#f1efe7" } },
  crosshair: { mode: CrosshairMode.Normal },
  rightPriceScale: { borderColor: "#e3e0d4" },
  timeScale: { borderColor: "#e3e0d4", timeVisible: true, secondsVisible: false, rightOffset: phone ? 2 : 5 },
  // On phones, a one-finger vertical swipe scrolls the page; horizontal drag pans the chart
  handleScroll: { vertTouchDrag: false, horzTouchDrag: true, mouseWheel: true, pressedMouseMove: true },
  handleScale: { pinch: true, mouseWheel: true, axisPressedMouseMove: !phone },
});

/**
 * Candlestick chart with optional overlay lines, extra indicator panes and markers.
 *   overlays: [{ name, color, data: [{ time, value }] }]
 *   panes:    [{ title, series: [{ name, color, type: "line" | "histogram", data }] }]
 */
export default function PriceChart({ candles, overlays = [], panes = [], markers = [] }) {
  const ref = useRef(null);
  const phone = usePhone();

  useEffect(() => {
    if (!ref.current || !candles?.length) return;
    const main = phone ? 300 : 440;
    const pane = phone ? 110 : 130;
    const chart = createChart(ref.current, chartOptions(main + panes.length * pane, phone));

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#15a36b", downColor: "#e0473a", borderVisible: false, wickUpColor: "#15a36b", wickDownColor: "#e0473a",
    });
    series.setData(candles.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));

    for (const o of overlays) {
      chart.addSeries(LineSeries, { color: o.color, lineWidth: 2, title: phone ? "" : o.name, priceLineVisible: false, lastValueVisible: false }).setData(o.data);
    }
    panes.forEach((p, i) => {
      for (const s of p.series) {
        chart.addSeries(
          s.type === "histogram" ? HistogramSeries : LineSeries,
          s.type === "histogram"
            ? { color: s.color, title: phone ? "" : s.name, priceLineVisible: false }
            : { color: s.color, lineWidth: phone ? 1.5 : 2, title: phone ? "" : s.name, priceLineVisible: false },
          i + 1
        ).setData(s.data);
      }
    });
    chart.panes().forEach((p, i) => p.setStretchFactor(i === 0 ? 3 : 1));

    // Fewer, smaller labels on phones keep markers readable
    const ms = phone ? markers.map((m) => ({ ...m, text: m.text === "Buy" || m.text === "Short" ? "" : m.text })) : markers;
    if (ms.length) createSeriesMarkers(series, [...ms].sort((a, b) => a.time - b.time));

    if (phone && candles.length > 150) {
      chart.timeScale().setVisibleLogicalRange({ from: candles.length - 150, to: candles.length + 2 });
    } else chart.timeScale().fitContent();
    return () => chart.remove();
  }, [candles, overlays, panes, markers, phone]);

  return <div className="chart-box" ref={ref} />;
}

export function EquityChart({ equity }) {
  const ref = useRef(null);
  const phone = usePhone();
  useEffect(() => {
    if (!ref.current || !equity?.length) return;
    const chart = createChart(ref.current, chartOptions(phone ? 180 : 220, phone));
    chart.addSeries(LineSeries, { color: "#0f3d2e", lineWidth: 2, priceLineVisible: false, title: phone ? "" : "Equity" }).setData(equity);
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [equity, phone]);
  return <div className="chart-box" ref={ref} />;
}
