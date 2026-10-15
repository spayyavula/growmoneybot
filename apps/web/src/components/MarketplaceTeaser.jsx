import { Link } from "react-router-dom";
import { VerifiedSeal } from "./market/parts.jsx";

const points = [
  { title: "Results we ran ourselves", text: "Experts can't upload numbers. Our server fetches the price history and re-runs every backtest." },
  { title: "A live record that can't be tuned", text: "From the publish date on, only new trades count. Overfit strategies show it quickly." },
  { title: "Check it yourself", text: "Followers can re-run the frozen dataset in their own browser and match every fingerprint." },
];

export default function MarketplaceTeaser() {
  return (
    <section className="section" id="marketplace">
      <div className="container">
        <p className="eyebrow">New · Expert marketplace</p>
        <h2 className="section-title left">Follow expert traders whose results you can verify.</h2>
        <p className="section-sub left">Approved experts publish their algorithms. You see the verified backtest and a live track record, then follow to unlock the rules.</p>
        <div className="features three">
          {points.map((p) => (
            <article key={p.title} className="feature">
              <span className="feature-icon"><VerifiedSeal size={22} /></span>
              <h3>{p.title}</h3>
              <p>{p.text}</p>
            </article>
          ))}
        </div>
        <div className="hero-ctas teaser-ctas">
          <Link to="/marketplace" className="btn">Browse the marketplace</Link>
          <Link to="/signup" className="btn btn-ghost">Apply as an expert</Link>
        </div>
      </div>
    </section>
  );
}
