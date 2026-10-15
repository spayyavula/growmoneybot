import Navbar from "../components/Navbar.jsx";
import Hero from "../components/Hero.jsx";
import Features from "../components/Features.jsx";
import SavingsCalculator from "../components/SavingsCalculator.jsx";
import HowItWorks from "../components/HowItWorks.jsx";
import MarketplaceTeaser from "../components/MarketplaceTeaser.jsx";
import Contact from "../components/Contact.jsx";
import Footer from "../components/Footer.jsx";

export default function Landing() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <MarketplaceTeaser />
        <SavingsCalculator />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
