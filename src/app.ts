import express, { Application } from "express";
import bodyParser from "body-parser";
import downloadRoute from "./routes/download";

const app: Application = express();

// Middleware
app.use(bodyParser.json());

// Routes
app.use("/api", downloadRoute);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
