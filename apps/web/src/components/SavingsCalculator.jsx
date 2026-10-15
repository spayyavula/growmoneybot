import { useMemo, useState } from "react";

const fmt = (n) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default function SavingsCalculator() {
  const [initial, setInitial] = useState(1000);
  const [monthly, setMonthly] = useState(200);
  const [rate, setRate] = useState(5);
  const [years, setYears] = useState(10);

  const { total, contributed, growth, points } = useMemo(() => {
    const r = rate / 100 / 12;
    let bal = initial;
    const pts = [bal];
    for (let m = 1; m <= years * 12; m++) {
      bal = bal * (1 + r) + monthly;
      if (m % 12 === 0) pts.push(bal);
    }
    const contrib = initial + monthly * years * 12;
    return { total: bal, contributed: contrib, growth: bal - contrib, points: pts };
  }, [initial, monthly, rate, years]);

  const max = Math.max(...points);

  return (
    <section className="section" id="calculator">
      <div className="container calc">
        <div>
          <h2 className="section-title left">See compound growth in action</h2>
          <p className="section-sub left">Adjust the numbers to see how steady saving adds up over time.</p>

          <div className="sliders">
            <Slider label="Starting amount" value={initial} set={setInitial} min={0} max={50000} step={500} display={fmt(initial)} />
            <Slider label="Monthly contribution" value={monthly} set={setMonthly} min={0} max={3000} step={25} display={fmt(monthly)} />
            <Slider label="Annual return" value={rate} set={setRate} min={0} max={12} step={0.5} display={`${rate}%`} />
            <Slider label="Years" value={years} set={setYears} min={1} max={40} step={1} display={`${years} yrs`} />
          </div>
        </div>

        <div className="calc-result">
          <span className="muted small">Estimated balance after {years} years</span>
          <strong className="big">{fmt(total)}</strong>
          <div className="split">
            <div><span className="dot c1" /> You put in <b>{fmt(contributed)}</b></div>
            <div><span className="dot c2" /> Growth <b>{fmt(growth)}</b></div>
          </div>
          <div className="chart" role="img" aria-label="Projected balance by year">
            {points.map((p, i) => (
              <i key={i} style={{ height: `${Math.max(4, (p / max) * 100)}%` }} title={`Year ${i}: ${fmt(p)}`} />
            ))}
          </div>
          <p className="muted tiny">
            Illustration only. Assumes a constant return compounded monthly; real returns vary and can be negative.
          </p>
        </div>
      </div>
    </section>
  );
}

function Slider({ label, value, set, min, max, step, display }) {
  return (
    <label className="slider">
      <span className="slider-top"><span>{label}</span><b>{display}</b></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(Number(e.target.value))} />
    </label>
  );
}
