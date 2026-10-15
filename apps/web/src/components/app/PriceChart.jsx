import { useEffect, useRef, useState } from "react";
import {
  createChart, createSeriesMarkers, CandlestickSeries, LineSeries, HistogramSeries, ColorType, CrosshairMode,
} from "lightweight-charts";
import { useTheme } from "../../lib/theme.jsx";

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

// Chart palettes matching the day/night design tokens
const PALETTE = {
  light: { bg: "#ffffff", text: "#6e6e73", grid: "#f2f2f4", border: "#e5e5ea", up: "#34c759", down: "#ff3b30", equity: "#1a8c46", cross: "#8e8e93" },
  dark: { bg: "#1c1c1e", text: "#a1a1a6", grid: "#2a2a2c", border: "#38383a", up: "#30d158", down: "#ff453a", equity: "#30d158", cross: "#636366" },
};

const chartOptions = (height, phone, c) => ({
  height,
  autoSize: true,
  layout: {
    background: { type: ColorType.Solid, color: c.bg },
    textColor: c.text,
    fontSize: phone ? 10 : 12,
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, system-ui, sans-serif',
    panes: { separatorColor: c.border, enableResize: !phone },
  },
  grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
  crosshair: { mode: CrosshairMode.Normal, vertLine: { color: c.cross, labelBackgroundColor: c.cross }, horzLine: { color: c.cross, labelBackgroundColor: c.cross } },
  rightPriceScale: { borderColor: c.border },
  timeScale: { borderColor: c.border, timeVisible: true, secondsVisible: false, rightOffset: phone ? 2 : 5 },
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
  const { theme } = useTheme();

  useEffect(() => {
    if (!ref.current || !candles?.length) return;
    const c = PALETTE[theme] || PALETTE.light;
    const main = phone ? 300 : 440;
    const pane = phone ? 110 : 130;
    const chart = createChart(ref.current, chartOptions(main + panes.length * pane, phone, c));

    const series = chart.addSeries(CandlestickSeries, {
      upColor: c.up, downColor: c.down, borderVisible: false, wickUpColor: c.up, wickDownColor: c.down,
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
  }, [candles, overlays, panes, markers, phone, theme]);

  return <div className="chart-box" ref={ref} />;
}

export function EquityChart({ equity }) {
  const ref = useRef(null);
  const phone = usePhone();
  const { theme } = useTheme();
  useEffect(() => {
    if (!ref.current || !equity?.length) return;
    const c = PALETTE[theme] || PALETTE.light;
    const chart = createChart(ref.current, chartOptions(phone ? 180 : 220, phone, c));
    chart.addSeries(LineSeries, { color: c.equity, lineWidth: 2, priceLineVisible: false, title: phone ? "" : "Equity" }).setData(equity);
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [equity, phone, theme]);
  return <div className="chart-box" ref={ref} />;
}
