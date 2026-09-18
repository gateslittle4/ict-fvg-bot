# Strategy Analysis & Exploration (Python)

Fast, iterative strategy research using Python. Perfect for discovering new trading ideas.

## Setup

```bash
cd analysis
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## Quick Start

### Explore RSI Parameters

```bash
python explore_strategies.py
```

This tests 75 different RSI configurations on US100 and shows:
- Top performers by PnL
- Best risk-adjusted entries
- How it compares to JavaScript speed

Output example:
```
⚡ Tested 75 configurations in 1.8s
📊 Top 5 by test PnL:
   rsi_period  upper_band  lower_band  test_trades  test_winrate  test_pnl
            9          65          35           15          0.60     245.30
           14          70          30           12          0.58     198.50
```

## Modules

### `data_loader.py`
Load market data and calculate common indicators:
- `load_symbol(symbol)` - Load OHLC data
- `split_train_test(df)` - Train/test split (2024-01-01)
- `atr()`, `ema()`, `rsi()`, `zscore()` - Common indicators

### `backtest_engine.py`
Fast backtesting for exploration:
- `BacktestEngine` - Run backtest with entry/exit signals
- Get wins/losses, profit factor, drawdown, etc.

## Example: Test Your Own Strategy

```python
from data_loader import load_symbol, split_train_test, ema, atr
from backtest_engine import BacktestEngine

# Load data
df = load_symbol('XAUUSD')
train, test = split_train_test(df)

# Define strategy (example: EMA crossover)
ema20 = ema(train, 'close', 20)
ema50 = ema(train, 'close', 50)
entry = (ema20 > ema50)
exit = (ema20 < ema50)

# Backtest
engine = BacktestEngine(train)
result = engine.run(entry, exit)
print(result)
```

## Workflow

1. **Explore** - Test 50+ parameter combinations in seconds
2. **Validate** - Find the best ones
3. **Verify** - Check on out-of-sample test data
4. **Implement** - Port winning strategies to JavaScript for live trading

## Speed Comparison

| Task | Node.js | Python |
|------|---------|--------|
| Backtest 7 years | ~5-10s | ~0.3s |
| Test 75 configs | ~7 min | ~2 sec |
| Iterate on idea | Slow | Fast ✅ |

## Notes

- All calculations use **same data** and **same logic** as your JavaScript backtest
- Train/test split at 2024-01-01 matches your bot's validation methodology
- Ready to port winning strategies to JavaScript once validated

## Next Steps

1. Create a new `analyze_*.py` script
2. Test your hypothesis on the data
3. Once validated, port to JavaScript for live trading
4. Update HANDOFF.md with the new strategy

Happy exploring! 🚀
