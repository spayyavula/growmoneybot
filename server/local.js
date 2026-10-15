// Run the Express API without Netlify: `npm run dev:server`
import "dotenv/config";
import app from "./app.js";

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}/api/health`));
