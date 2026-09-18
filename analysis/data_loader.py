"""Load and prepare market data for analysis."""
import pandas as pd
import numpy as np
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / 'data' / 'backtest-input'

def load_symbol(symbol: str) -> pd.DataFrame:
    """Load OHLC data for a symbol.

    Args:
        symbol: Instrument name (e.g., 'US100', 'XAUUSD')

    Returns:
        DataFrame with columns: time, open, high, low, close (time as datetime)
    """
    csv_path = DATA_DIR / f'{symbol}.csv'
    df = pd.read_csv(csv_path)
    df['time'] = pd.to_datetime(df['time'], unit='ms')
    df = df.sort_values('time').reset_index(drop=True)
    return df

def split_train_test(df: pd.DataFrame, split_date='2024-01-01') -> tuple[pd.DataFrame, pd.DataFrame]:
    """Split data into training and test sets.

    Args:
        df: DataFrame with datetime index
        split_date: Date string (YYYY-MM-DD) to split on

    Returns:
        (train_df, test_df)
    """
    split = pd.Timestamp(split_date)
    train = df[df['time'] < split].reset_index(drop=True)
    test = df[df['time'] >= split].reset_index(drop=True)
    return train, test

def atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    """Calculate Average True Range."""
    high = df['high']
    low = df['low']
    close = df['close']

    tr1 = high - low
    tr2 = abs(high - close.shift(1))
    tr3 = abs(low - close.shift(1))
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    return tr.rolling(period).mean()

def ema(df: pd.DataFrame, column: str = 'close', period: int = 50) -> pd.Series:
    """Calculate Exponential Moving Average."""
    return df[column].ewm(span=period, adjust=False).mean()

def rsi(df: pd.DataFrame, period: int = 14) -> pd.Series:
    """Calculate RSI (Relative Strength Index)."""
    delta = df['close'].diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
    rs = gain / loss
    return 100 - (100 / (1 + rs))

def zscore(series: pd.Series, period: int = 20) -> pd.Series:
    """Calculate Z-score (standard deviations from mean)."""
    mean = series.rolling(period).mean()
    std = series.rolling(period).std()
    return (series - mean) / std

print("✅ Data loader ready")
