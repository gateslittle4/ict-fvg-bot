# Apex FVG Core

Isolated Rust primitives for risk sizing and account guardrails.

This crate is deliberately not connected to the live Node server yet. That
boundary keeps the existing cTrader execution path unchanged while the Rust
results are compared against the JavaScript implementation.

## Validate

```bash
cd rust_core
cargo test
```

The first migration target is deterministic risk calculation. Broker
authentication, order submission, and account switching stay outside this
crate until parity tests cover the current production behavior.

## Explore index pairs

From the repository root:

```bash
cargo run --manifest-path rust_core/Cargo.toml --bin pair_explorer
```

Pass another CSV directory as the first argument when needed. The output is
CSV with return correlation, aligned-bar count, and prior-window ratio z-score
event counts. It is research output only and never changes live configuration.