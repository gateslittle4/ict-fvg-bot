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