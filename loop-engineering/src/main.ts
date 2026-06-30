const COMMANDS = ["metrics", "evolve", "ci", "coverage"] as const;

type Command = (typeof COMMANDS)[number];

function printHelp(): void {
  console.log(`
mdh-loop-engineering — Iterative MDH optimization via metrics & prompt evolution

Usage:
  npx tsx src/main.ts [command] [options]

Commands:
  metrics    Collect and analyze codebase metrics
  evolve     Run prompt evolution cycles
  ci         CI integration and regression detection
  coverage   Show scenario coverage report

Options:
  --help             Show this help message
  --trend            (metrics) Show quality trend across iterations
  --component=X      (evolve) Evolve a specific component
  --threshold=N      (ci) Set quality score threshold (default: 80)
`);
}

async function runCommand(cmd: Command, args: string[]): Promise<void> {
  switch (cmd) {
    case "metrics": {
      const { showMetrics } = await import("./metrics/reporter.js");
      const trend = args.includes("--trend");
      showMetrics(trend);
      break;
    }
    case "evolve": {
      const { evolvePrompt } = await import("./evolution/evolver.js");
      const componentArg = args.find((a) => a.startsWith("--component="));
      const component = componentArg?.split("=")[1] || "reviewer";
      await evolvePrompt(component);
      break;
    }
    case "ci": {
      const { runCiGate } = await import("./ci/gate.js");
      const thresholdArg = args.find((a) => a.startsWith("--threshold="));
      const threshold = thresholdArg ? parseInt(thresholdArg.split("=")[1]) : 80;
      const passed = await runCiGate(threshold);
      process.exit(passed ? 0 : 1);
      break;
    }
    case "coverage": {
      const { getCoverageReport } = await import("./scenarios/registry.js");
      getCoverageReport();
      break;
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.length === 0) {
    printHelp();
    process.exit(0);
  }

  const command = args[0] as Command;

  if (!COMMANDS.includes(command)) {
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exit(1);
  }

  await runCommand(command, args.slice(1));
}

main();
