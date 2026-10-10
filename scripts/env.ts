// Imported first by CLI scripts so DATABASE_URL is available before the db module loads.
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
