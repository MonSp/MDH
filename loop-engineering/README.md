# Loop Engineering

Automated software quality evolution through continuous metric collection, optimization, and CI integration.

## Quick Start

```bash
npm install
```

## Commands

```bash
# Collect current metrics
npm run metrics

# Run evolution optimization
npm run evolve

# Full CI pipeline (metrics + evolution + coverage)
npm run ci

# Run with coverage tracking
npm run ci -- --coverage
```

## Architecture

The system is organized into four modules:

- **metrics** — Collects code quality metrics (complexity, duplication, coupling) and stores them in SQLite
- **evolution** — Applies automated optimizations based on metric thresholds and historical trends
- **ci** — Integrates with CI pipelines, enforces quality gates, generates reports
- **scenarios** — Defines test scenarios for validation and benchmarking

## Project Structure

```
loop-engineering/
  src/
    main.ts          # CLI entry point
    metrics/         # Metric collection engine
    evolution/       # Optimization strategies
    ci/              # CI pipeline integration
    scenarios/       # Test scenarios
  data/              # Runtime data (metrics.db)
  baselines/         # Baseline metric snapshots
```

## License

Internal project — not published.
