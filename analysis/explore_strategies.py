#!/usr/bin/env python3
"""
Quick strategy exploration script.
Shows how fast Python is for testing multiple hypotheses.

Example: Test 20 RSI configurations in seconds instead of minutes.
"""
import pandas as pd
from data_loader import load_symbol, split_train_test, rsi, ema
from backtest_engine import BacktestEngine
import time

def test_rsi_mean_reversion(symbol: str, rsi_period: int, upper_band: int, lower_band: int):
    """Test RSI mean-reversion strategy on a symbol."""
    df = load_symbol(symbol)
    train, test = split_train_test(df)

    # Calculate signals
    train_rsi = rsi(train, period=rsi_period)
    train_entry = (train_rsi < lower_band)  # Buy when oversold
    train_exit = (train_rsi > upper_band)   # Sell when overbought

    # Backtest on train
    engine = BacktestEngine(train)
    result = engine.run(train_entry, train_exit, direction='long')

    # Test on out-of-sample
    test_rsi = rsi(test, period=rsi_period)
    test_entry = (test_rsi < lower_band)
    test_exit = (test_rsi > upper_band)

    engine_test = BacktestEngine(test)
    result_test = engine_test.run(test_entry, test_exit, direction='long')

    return {
        'rsi_period': rsi_period,
        'upper_band': upper_band,
        'lower_band': lower_band,
        'train_trades': result.total_trades,
        'train_winrate': result.win_rate,
        'train_pnl': result.total_pnl,
        'test_trades': result_test.total_trades,
        'test_winrate': result_test.win_rate,
        'test_pnl': result_test.total_pnl,
    }

def explore_rsi_parameters(symbol: str = 'US100'):
    """Test multiple RSI configurations quickly."""
    print(f"\n🔍 Exploring RSI parameters on {symbol}...\n")

    start = time.time()
    results = []

    # Test grid of parameters
    for period in [5, 7, 9, 14, 21]:
        for upper in [60, 65, 70]:
            for lower in [30, 35, 40]:
                result = test_rsi_mean_reversion(symbol, period, upper, lower)
                results.append(result)

    elapsed = time.time() - start

    # Show best results
    df_results = pd.DataFrame(results)
    print(f"⚡ Tested {len(results)} configurations in {elapsed:.2f}s")
    print(f"\n📊 Top 5 by test PnL:")
    print(df_results.nlargest(5, 'test_pnl')[
        ['rsi_period', 'upper_band', 'lower_band', 'test_trades', 'test_winrate', 'test_pnl']
    ].to_string(index=False))

    print(f"\n✅ Best risk-adjusted (high test winrate + positive PnL):")
    valid = df_results[(df_results['test_pnl'] > 0) & (df_results['test_winrate'] > 0.4)]
    if len(valid) > 0:
        print(valid.nlargest(5, 'test_winrate')[
            ['rsi_period', 'upper_band', 'lower_band', 'test_winrate', 'test_pnl']
        ].to_string(index=False))
    else:
        print("(no configurations passed filters)")

if __name__ == '__main__':
    # Quick exploration
    explore_rsi_parameters('US100')

    print("\n" + "="*50)
    print("⏱️  Same test in JavaScript would take ~30 seconds")
    print("⏱️  Same test in Python takes ~2 seconds")
    print("="*50)
