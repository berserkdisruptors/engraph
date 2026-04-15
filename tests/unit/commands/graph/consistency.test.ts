import { describe, it, expect } from "vitest";
import {
  classifyName,
  computeNamingPatterns,
  computeModuleInterfacePatterns,
  type FileImportMap,
} from "../../../../src/commands/graph/consistency.js";
import type { Module } from "../../../../src/commands/graph/types.js";

// ─── Helpers ───────────────────────────────────────────────────────────────

function createModule(overrides: Partial<Module> & { id: string }): Module {
  return {
    path: `src/${overrides.id}`,
    type: "feature",
    files: [],
    imports: { internal: [], external: [] },
    imported_by: [],
    test_files: [],
    ...overrides,
  };
}

// ─── classifyName ─────────────────────────────────────────────────────────

describe("classifyName", () => {
  it("detects camelCase", () => {
    expect(classifyName("myVariable")).toBe("camelCase");
    expect(classifyName("getUser")).toBe("camelCase");
    expect(classifyName("processRawImport")).toBe("camelCase");
  });

  it("detects PascalCase", () => {
    expect(classifyName("MyClass")).toBe("PascalCase");
    expect(classifyName("StepTracker")).toBe("PascalCase");
    expect(classifyName("FileEntry")).toBe("PascalCase");
  });

  it("detects SCREAMING_SNAKE_CASE", () => {
    expect(classifyName("MAX_RETRIES")).toBe("SCREAMING_SNAKE_CASE");
    expect(classifyName("REPO_OWNER")).toBe("SCREAMING_SNAKE_CASE");
    expect(classifyName("GREEN_COLOR")).toBe("SCREAMING_SNAKE_CASE");
  });

  it("detects snake_case", () => {
    expect(classifyName("my_variable")).toBe("snake_case");
    expect(classifyName("get_user")).toBe("snake_case");
    expect(classifyName("import_count")).toBe("snake_case");
  });

  it("detects kebab-case", () => {
    expect(classifyName("my-component")).toBe("kebab-case");
    expect(classifyName("step-tracker")).toBe("kebab-case");
    expect(classifyName("context-index")).toBe("kebab-case");
  });

  it("handles single-word lowercase as camelCase", () => {
    expect(classifyName("path")).toBe("camelCase");
    expect(classifyName("name")).toBe("camelCase");
  });

  it("handles single-word uppercase as PascalCase", () => {
    expect(classifyName("URL")).toBe("PascalCase");
    expect(classifyName("API")).toBe("PascalCase");
  });

  it("returns mixed for unclassifiable names", () => {
    expect(classifyName("my_Variable")).toBe("mixed");
    expect(classifyName("My-thing")).toBe("mixed");
  });
});

// ─── computeNamingPatterns ────────────────────────────────────────────────

describe("computeNamingPatterns", () => {
  it("detects dominant pattern for functions", () => {
    const modules: Module[] = [
      createModule({
        id: "utils",
        files: [
          {
            path: "src/utils/helpers.ts",
            exports: [
              { name: "getUser", type: "function" },
              { name: "parseData", type: "function" },
              { name: "formatOutput", type: "function" },
            ],
          },
        ],
      }),
    ];

    const patterns = computeNamingPatterns(modules);
    const funcPattern = patterns.find((p) => p.declarationType === "function");

    expect(funcPattern).toBeDefined();
    expect(funcPattern!.pattern).toBe("camelCase");
    expect(funcPattern!.matchCount).toBe(3);
    expect(funcPattern!.totalCount).toBe(3);
    expect(funcPattern!.deviations).toEqual([]);
  });

  it("identifies deviations from dominant pattern", () => {
    const modules: Module[] = [
      createModule({
        id: "mod",
        files: [
          {
            path: "src/mod/index.ts",
            exports: [
              { name: "MyClass", type: "class" },
              { name: "AnotherClass", type: "class" },
              { name: "weird_class", type: "class" },
            ],
          },
        ],
      }),
    ];

    const patterns = computeNamingPatterns(modules);
    const classPattern = patterns.find((p) => p.declarationType === "class");

    expect(classPattern).toBeDefined();
    expect(classPattern!.pattern).toBe("PascalCase");
    expect(classPattern!.matchCount).toBe(2);
    expect(classPattern!.deviations).toContain("weird_class");
  });

  it("builds per-module breakdown", () => {
    const modules: Module[] = [
      createModule({
        id: "alpha",
        files: [
          {
            path: "src/alpha/a.ts",
            exports: [
              { name: "doAlpha", type: "function" },
              { name: "runAlpha", type: "function" },
            ],
          },
        ],
      }),
      createModule({
        id: "beta",
        files: [
          {
            path: "src/beta/b.ts",
            exports: [
              { name: "DoBeta", type: "function" }, // PascalCase deviation
            ],
          },
        ],
      }),
    ];

    const patterns = computeNamingPatterns(modules);
    const funcPattern = patterns.find((p) => p.declarationType === "function");

    expect(funcPattern!.byModule).toHaveLength(2);
    const alphaBreakdown = funcPattern!.byModule.find(
      (b) => b.moduleId === "alpha"
    );
    expect(alphaBreakdown!.matchCount).toBe(2);
    expect(alphaBreakdown!.totalCount).toBe(2);

    const betaBreakdown = funcPattern!.byModule.find(
      (b) => b.moduleId === "beta"
    );
    expect(betaBreakdown!.matchCount).toBe(0);
    expect(betaBreakdown!.totalCount).toBe(1);
  });

  it("detects file naming patterns", () => {
    const modules: Module[] = [
      createModule({
        id: "commands",
        files: [
          { path: "src/commands/check.ts", exports: [] },
          { path: "src/commands/graph.ts", exports: [] },
          { path: "src/commands/search.ts", exports: [] },
        ],
      }),
    ];

    const patterns = computeNamingPatterns(modules);
    const filePattern = patterns.find((p) => p.declarationType === "file");

    expect(filePattern).toBeDefined();
    expect(filePattern!.pattern).toBe("camelCase");
    expect(filePattern!.matchCount).toBe(3);
  });

  it("caps deviations at 10", () => {
    const exports: Array<{ name: string; type: "function" }> = [];
    // 5 camelCase + 12 PascalCase → dominant PascalCase, 5 deviations
    for (let i = 0; i < 5; i++) {
      exports.push({ name: `func${i}`, type: "function" as const });
    }
    for (let i = 0; i < 12; i++) {
      exports.push({ name: `Func${i}`, type: "function" as const });
    }

    const modules: Module[] = [
      createModule({
        id: "big",
        files: [{ path: "src/big/all.ts", exports }],
      }),
    ];

    const patterns = computeNamingPatterns(modules);
    const funcPattern = patterns.find((p) => p.declarationType === "function");
    expect(funcPattern!.deviations.length).toBeLessThanOrEqual(10);
  });
});

// ─── computeModuleInterfacePatterns ───────────────────────────────────────

describe("computeModuleInterfacePatterns", () => {
  it("detects reexport entry files", () => {
    const modules: Module[] = [
      createModule({
        id: "utils",
        files: [
          {
            path: "src/utils/index.ts",
            exports: [{ name: "helper", type: "function" }],
          },
          {
            path: "src/utils/helper.ts",
            exports: [{ name: "helper", type: "function" }],
          },
        ],
      }),
    ];

    const patterns = computeModuleInterfacePatterns(modules, new Map());
    expect(patterns[0].hasReexportEntry).toBe(true);
  });

  it("reports no reexport entry when index has no exports", () => {
    const modules: Module[] = [
      createModule({
        id: "utils",
        files: [
          { path: "src/utils/index.ts", exports: [] },
          {
            path: "src/utils/helper.ts",
            exports: [{ name: "helper", type: "function" }],
          },
        ],
      }),
    ];

    const patterns = computeModuleInterfacePatterns(modules, new Map());
    expect(patterns[0].hasReexportEntry).toBe(false);
  });

  it("counts export visibility by symbol kind", () => {
    const modules: Module[] = [
      createModule({
        id: "lib",
        files: [
          {
            path: "src/lib/main.ts",
            exports: [
              { name: "doThing", type: "function" },
              { name: "doOther", type: "function" },
              { name: "Config", type: "interface" },
            ],
          },
        ],
      }),
    ];

    const patterns = computeModuleInterfacePatterns(modules, new Map());
    expect(patterns[0].exportVisibility).toEqual({
      function: 2,
      interface: 1,
    });
  });

  it("finds common imports across files in a module", () => {
    const fileImportMap: FileImportMap = new Map([
      [
        "mymod",
        new Map([
          ["src/mymod/a.ts", ["path", "fs", "chalk"]],
          ["src/mymod/b.ts", ["path", "chalk", "ora"]],
          ["src/mymod/c.ts", ["path", "axios"]],
        ]),
      ],
    ]);

    const modules: Module[] = [
      createModule({
        id: "mymod",
        files: [
          { path: "src/mymod/a.ts", exports: [] },
          { path: "src/mymod/b.ts", exports: [] },
          { path: "src/mymod/c.ts", exports: [] },
        ],
      }),
    ];

    const patterns = computeModuleInterfacePatterns(modules, fileImportMap);
    expect(patterns[0].commonImports).toContain("path");
    expect(patterns[0].commonImports).toContain("chalk");
    expect(patterns[0].commonImports).not.toContain("ora");
    expect(patterns[0].commonImports).not.toContain("axios");
  });
});
