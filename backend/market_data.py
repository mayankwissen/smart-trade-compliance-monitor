import uuid
import random
import logging
from datetime import datetime, timedelta

try:
    import yfinance as yf
    YFINANCE_AVAILABLE = True
except ImportError:
    YFINANCE_AVAILABLE = False
    logging.warning("yfinance not available, using fallback prices")

NSE_SYMBOLS = {
    'HDFCBANK': 'HDFCBANK.NS',
    'RELIANCE': 'RELIANCE.NS',
    'INFY':     'INFY.NS',
    'TCS':      'TCS.NS',
    'ICICIBANK':'ICICIBANK.NS',
    'WIPRO':    'WIPRO.NS',
    'SBIN':     'SBIN.NS',
}

FALLBACK_PRICES = {
    'HDFCBANK':  1820.00,
    'RELIANCE':  2890.00,
    'INFY':      1845.00,
    'TCS':       3850.00,
    'ICICIBANK': 1125.00,
    'WIPRO':      465.00,
    'SBIN':       785.00,
}


def fetch_real_prices():
    prices = {}
    if not YFINANCE_AVAILABLE:
        for sym, price in FALLBACK_PRICES.items():
            prices[sym] = {
                'current': price,
                'high': round(price * 1.015, 2),
                'low':  round(price * 0.985, 2),
                'volume': random.randint(1_000_000, 10_000_000),
                'history': None,
                'source': 'fallback',
            }
        return prices

    for symbol, ticker in NSE_SYMBOLS.items():
        try:
            data = yf.Ticker(ticker)
            hist = data.history(period='5d', interval='1m')
            if not hist.empty:
                prices[symbol] = {
                    'current': round(float(hist['Close'].iloc[-1]), 2),
                    'high':    round(float(hist['High'].max()), 2),
                    'low':     round(float(hist['Low'].min()), 2),
                    'volume':  int(hist['Volume'].sum()),
                    'history': hist,
                    'source':  'live',
                }
            else:
                raise ValueError("empty history")
        except Exception as e:
            logging.warning(f"yfinance fetch failed for {symbol}: {e}, using fallback")
            fb = FALLBACK_PRICES.get(symbol, 1000.0)
            prices[symbol] = {
                'current': fb,
                'high':    round(fb * 1.015, 2),
                'low':     round(fb * 0.985, 2),
                'volume':  random.randint(1_000_000, 10_000_000),
                'history': None,
                'source':  'fallback',
            }

    return prices


def generate_realistic_trades(prices):
    trades = []
    base_date = datetime.now().replace(hour=9, minute=15, second=0, microsecond=0)

    # 250 normal traders
    for i in range(250):
        symbol = random.choice(list(prices.keys()))
        real_price = prices[symbol]['current']
        price = round(real_price * random.uniform(0.995, 1.005), 2)
        status = random.choice(['EXECUTED', 'EXECUTED', 'EXECUTED', 'CANCELLED'])
        cancel_ms = random.randint(800, 3000) if status == 'CANCELLED' else 0
        trades.append({
            'trade_id':      f'TRD-{str(uuid.uuid4())[:8].upper()}',
            'timestamp':     (base_date + timedelta(
                                minutes=random.randint(0, 360),
                                seconds=random.randint(0, 59)
                              )).strftime('%Y-%m-%d %H:%M:%S'),
            'trader_id':     f'T-{random.randint(1, 999):04d}',
            'account_id':    f'A-{random.randint(1, 999):04d}',
            'instrument':    symbol,
            'order_type':    random.choice(['BUY', 'SELL']),
            'order_size':    random.randint(100, 5000),
            'price':         price,
            'order_status':  status,
            'cancel_time_ms': cancel_ms,
            'session_id':    f'SES-{random.randint(1000, 9999)}',
        })

    # LAYERING cluster at real HDFCBANK price
    hdfcbank_price = prices.get('HDFCBANK', {}).get('current', 1820)
    base_time = base_date.replace(hour=9, minute=44)
    for i in range(14):
        is_cancelled = i < 12
        trades.append({
            'trade_id':      f'TRD-LAY-{i:03d}',
            'timestamp':     (base_time + timedelta(seconds=i * 10)).strftime('%Y-%m-%d %H:%M:%S'),
            'trader_id':     'T-1042',
            'account_id':    'A-1042',
            'instrument':    'HDFCBANK',
            'order_type':    'SELL' if not is_cancelled else 'BUY',
            'order_size':    random.randint(45000, 55000),
            'price':         round(hdfcbank_price * (1.008 if not is_cancelled else 1.0), 2),
            'order_status':  'CANCELLED' if is_cancelled else 'EXECUTED',
            'cancel_time_ms': random.randint(420, 780) if is_cancelled else 0,
            'session_id':    'SES-1042-A',
        })

    # SPOOFING cluster at real RELIANCE price
    reliance_price = prices.get('RELIANCE', {}).get('current', 2890)
    base_time2 = base_date.replace(hour=10, minute=15)
    for i in range(9):
        trades.append({
            'trade_id':      f'TRD-SPF-{i:03d}',
            'timestamp':     (base_time2 + timedelta(seconds=i * 8)).strftime('%Y-%m-%d %H:%M:%S'),
            'trader_id':     'T-2891',
            'account_id':    'A-2891',
            'instrument':    'RELIANCE',
            'order_type':    'SELL' if i == 8 else 'BUY',
            'order_size':    80000,
            'price':         round(reliance_price * (1.008 if i == 8 else 1.0), 2),
            'order_status':  'EXECUTED' if i == 8 else 'CANCELLED',
            'cancel_time_ms': random.randint(180, 490) if i < 8 else 0,
            'session_id':    'SES-2891-B',
        })

    # WASH TRADING at real INFY price
    infy_price = prices.get('INFY', {}).get('current', 1845)
    base_time3 = base_date.replace(hour=11, minute=30)
    trades.extend([
        {
            'trade_id':      'TRD-WSH-001',
            'timestamp':     base_time3.strftime('%Y-%m-%d %H:%M:%S'),
            'trader_id':     'T-3301',
            'account_id':    'A-3301',
            'instrument':    'INFY',
            'order_type':    'BUY',
            'order_size':    10000,
            'price':         round(infy_price, 2),
            'order_status':  'EXECUTED',
            'cancel_time_ms': 0,
            'session_id':    'SES-3301-C1',
        },
        {
            'trade_id':      'TRD-WSH-002',
            'timestamp':     (base_time3 + timedelta(seconds=18)).strftime('%Y-%m-%d %H:%M:%S'),
            'trader_id':     'T-3301',
            'account_id':    'A-3302',
            'instrument':    'INFY',
            'order_type':    'SELL',
            'order_size':    10000,
            'price':         round(infy_price * 1.0005, 2),
            'order_status':  'EXECUTED',
            'cancel_time_ms': 0,
            'session_id':    'SES-3301-C2',
        },
    ])

    return sorted(trades, key=lambda x: x['timestamp'])
