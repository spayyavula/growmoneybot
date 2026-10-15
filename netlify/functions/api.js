import serverless from "serverless-http";
import app from "../../server/app.js";

// Netlify Function entry point: wraps the Express app
export const handler = serverless(app);
