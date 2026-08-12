import { defineApp } from "convex/server";
import invite from "convex-invite/convex.config.js";

const app = defineApp();
app.use(invite);
export default app;
