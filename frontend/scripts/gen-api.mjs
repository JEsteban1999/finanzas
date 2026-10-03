import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

function uvCommand() {
  try {
    execSync("uv --version", { stdio: "ignore" });
    return "uv";
  } catch {
    return "python -m uv";
  }
}

const openapi = execSync(
  `${uvCommand()} run python -c "import json; from app.main import app; print(json.dumps(app.openapi()))"`,
  { cwd: "../backend", encoding: "utf8" },
);
writeFileSync("openapi.json", openapi);
execSync("npx openapi-typescript openapi.json -o src/lib/api/schema.d.ts", { stdio: "inherit" });
