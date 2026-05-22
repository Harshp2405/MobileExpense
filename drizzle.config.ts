import { defineConfig } from "drizzle-kit";

export default defineConfig({
	schema: "./src/lib/db/schema.js",
	out: "./drizzle",
	dialect: "sqlite",
	driver: "expo", // <--- very important
});
