"""Fast backtesting engine for strategy exploration."""
import pandas as pd
import numpy as np
from dataclasses import dataclass
from typing import Callable

@dataclass
class Trade:
    """Represents a single trade."""
    entry_idx: int
    exit_idx: int
    entry_price: float
    exit_price: float
    direction: str  # 'long' or 'short'

    @property
    def pnl(self) -> float:
        """Profit/loss in points."""
        if self.direction == 'long':
            return self.exit_price - self.entry_price
        else:
            return self.entry_price - self.exit_price

    @property
    def pnl_pct(self) -> float:
        """Profit/loss as percentage."""
        return (self.pnl / self.entry_price) * 100

@dataclass
class BacktestResult:
    """Results from a backtest run."""
    trades: list[Trade]
    total_trades: int
    win_rate: float
    avg_win: float
    avg_loss: float
    profit_factor: float
    total_pnl: float
    max_drawdown: float

    def __str__(self):
        return f"""
╔════════════════════════════════╗
║ BACKTEST RESULTS               ║
╠════════════════════════════════╣
║ Trades:        {self.total_trades:>20} ║
║ Win Rate:      {self.win_rate*100:>18.1f}% ║
║ Avg Win:       {self.avg_win:>20.2f} ║
║ Avg Loss:      {self.avg_loss:>20.2f} ║
║ Profit Factor: {self.profit_factor:>20.2f} ║
║ Total PnL:     {self.total_pnl:>20.2f} ║
║ Max Drawdown:  {self.max_drawdown:>20.2f} ║
╚════════════════════════════════╝
"""

class BacktestEngine:
    """Simple but fast backtesting engine."""

    def __init__(self, df: pd.DataFrame, initial_capital: float = 10000):
        self.df = df.reset_index(drop=True)
        self.initial_capital = initial_capital

    def run(self,
            entry_signal: pd.Series,
            exit_signal: pd.Series,
            direction: str = 'long') -> BacktestResult:
        """Run backtest with given entry/exit signals.

        Args:
            entry_signal: Boolean series (True = enter)
            exit_signal: Boolean series (True = exit)
            direction: 'long' or 'short'

        Returns:
            BacktestResult with trades and statistics
        """
        trades = []
        in_trade = False
        entry_idx = None
        entry_price = None

        for i in range(len(self.df)):
            if not in_trade and entry_signal.iloc[i]:
                in_trade = True
                entry_idx = i
                entry_price = self.df.iloc[i]['close']

            elif in_trade and exit_signal.iloc[i]:
                in_trade = False
                exit_price = self.df.iloc[i]['close']
                trade = Trade(
                    entry_idx=entry_idx,
                    exit_idx=i,
                    entry_price=entry_price,
                    exit_price=exit_price,
                    direction=direction
                )
                trades.append(trade)

        # Calculate statistics
        if not trades:
            return BacktestResult(
                trades=[],
                total_trades=0,
                win_rate=0,
                avg_win=0,
                avg_loss=0,
                profit_factor=0,
                total_pnl=0,
                max_drawdown=0
            )

        wins = [t.pnl for t in trades if t.pnl > 0]
        losses = [t.pnl for t in trades if t.pnl < 0]

        total_pnl = sum(t.pnl for t in trades)
        win_rate = len(wins) / len(trades) if trades else 0
        avg_win = np.mean(wins) if wins else 0
        avg_loss = np.mean(losses) if losses else 0

        gross_profit = sum(wins) if wins else 0
        gross_loss = abs(sum(losses)) if losses else 0
        profit_factor = gross_profit / gross_loss if gross_loss > 0 else 0

        # Max drawdown
        cumulative = np.cumsum([t.pnl for t in trades])
        running_max = np.maximum.accumulate(cumulative)
        drawdown = running_max - cumulative
        max_drawdown = np.max(drawdown) if len(drawdown) > 0 else 0

        return BacktestResult(
            trades=trades,
            total_trades=len(trades),
            win_rate=win_rate,
            avg_win=avg_win,
            avg_loss=avg_loss,
            profit_factor=profit_factor,
            total_pnl=total_pnl,
            max_drawdown=max_drawdown
        )

print("✅ Backtest engine ready")
