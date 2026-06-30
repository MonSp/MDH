const COMMANDS = ["metrics", "evolve", "ci"] as const;

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

Options:
  --help     Show this help message
`);
}

function runCommand(cmd: Command): void {
  switch (cmd) {
    case "metrics":
      console.log("[metrics] Not yet implemented — stub");
      break;
    case "evolve":
      console.log("[evolve] Not yet implemented — stub");
      break;
    case "ci":
      console.log("[ci] Not yet implemented — stub");
      break;
  }
}

function main(): void {
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

  runCommand(command);
}

main();
