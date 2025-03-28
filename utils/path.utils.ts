import { fileURLToPath } from "url";
import { dirname } from "path";

export function getDirname(importMetaUrl: string): string {
  const __filename = fileURLToPath(importMetaUrl);
  const __dirname = dirname(__filename);
  return __dirname;
}
