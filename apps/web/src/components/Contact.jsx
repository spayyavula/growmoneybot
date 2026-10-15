import { useState } from "react";
import { sendContact } from "../api.js";

export default function Contact() {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [status, setStatus] = useState({ state: "idle", msg: "" });

  const update = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    setStatus({ state: "loading", msg: "" });
    try {
      const res = await sendContact(form);
      setStatus({ state: "success", msg: res.message });
      setForm({ name: "", email: "", message: "" });
    } catch (err) {
      setStatus({ state: "error", msg: err.message });
    }
  };

  return (
    <section className="section alt" id="contact">
      <div className="container narrow">
        <h2 className="section-title">Get in touch</h2>
        <p className="section-sub">Questions, ideas or partnership inquiries — we'd love to hear from you.</p>
        <form className="contact" onSubmit={onSubmit}>
          <div className="field-row">
            <input placeholder="Your name" required value={form.name} onChange={update("name")} />
            <input type="email" placeholder="you@email.com" required value={form.email} onChange={update("email")} />
          </div>
          <textarea rows="5" placeholder="Your message" required value={form.message} onChange={update("message")} />
          <button className="btn" disabled={status.state === "loading"}>
            {status.state === "loading" ? "Sending…" : "Send message"}
          </button>
          {status.msg && <p className={`form-msg ${status.state}`}>{status.msg}</p>}
        </form>
      </div>
    </section>
  );
}
