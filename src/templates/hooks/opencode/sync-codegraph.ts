export default async ({ project, client, $, directory, worktree }) => {
  return {
    tool: {
      execute: {
        after: async (input, output) => {
          if (input.tool === "write" || input.tool === "edit") {
            try {
              await $`npx engraph graph 2>/dev/null`;
            } catch {
              // Codegraph sync should never block the agent flow
            }
          }
        },
      },
    },
  };
};
