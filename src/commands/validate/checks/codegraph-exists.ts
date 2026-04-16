import fs from "fs-extra";
import type { Finding } from "../types.js";

export async function checkCodegraphExists(
  codegraphPath: string
): Promise<Finding[]> {
  if (await fs.pathExists(codegraphPath)) {
    return [];
  }

  return [
    {
      code: "ENGRAPH_MISSING_CODEGRAPH",
      severity: "error",
      file: "",
      detail: { expected_path: codegraphPath },
    },
  ];
}
