import { Outlet } from "react-router-dom";
import Navbar from "../Navbar.jsx";
import Footer from "../Footer.jsx";

// Marketplace pages for visitors who aren't logged in
export default function PublicLayout() {
  return (
    <>
      <Navbar />
      <main className="public-main"><Outlet /></main>
      <Footer />
    </>
  );
}
