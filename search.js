#!/usr/bin/env node

import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env file if it exists
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  const envVars = envContent.split("\n").filter((line) => line.trim() && !line.startsWith("#"));
  envVars.forEach((line) => {
    const [key, ...valueParts] = line.split("=");
    const value = valueParts.join("=").replace(/^"|"$/g, "");
    process.env[key.trim()] = value;
  });
}

const apiKey = process.env.PERPLEXITY_API_KEY || process.env.PPLX_API_KEY;

if (!apiKey) {
  console.error("Error: PERPLEXITY_API_KEY or PPLX_API_KEY not found in environment or .env file");
  process.exit(1);
}

const query = process.argv.slice(2).join(" ");

if (!query) {
  console.error("Usage: node search.js <query>");
  process.exit(1);
}

async function search() {
  const payload = JSON.stringify({
    query: query,
    max_results: 5,
    max_tokens_per_page: 2000,
  });

  const options = {
    hostname: "api.perplexity.ai",
    path: "/search",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload),
      Authorization: `Bearer ${apiKey}`,
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        if (!data) {
          console.error("Error: Empty response from Perplexity API");
          process.exit(1);
        }

        try {
          const response = JSON.parse(data);

          if (res.statusCode !== 200) {
            console.error(`API Error (${res.statusCode}): ${response.error?.message || JSON.stringify(response)}`);
            process.exit(1);
          }

          if (response.results && response.results.length > 0) {
            console.log(JSON.stringify(response, null, 2));
          } else {
            console.error("Error: No results in response");
            process.exit(1);
          }

          resolve();
        } catch (error) {
          console.error("Parse error:", error.message);
          console.error("Raw response:", data.substring(0, 500));
          reject(error);
        }
      });
    });

    req.on("error", (error) => {
      console.error("Request error:", error.message);
      reject(error);
    });

    req.write(payload);
    req.end();
  });
}

search().catch(() => process.exit(1));
