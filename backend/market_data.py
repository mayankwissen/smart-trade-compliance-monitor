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
    'HDFCBANK':  'HDFCBANK.NS',
    'RELIANCE':  'RELIANCE.NS',
    'INFY':      'INFY.NS',
    'TCS':       'TCS.NS',
    'ICICIBANK': 'ICICIBANK.NS',
    'WIPRO':     'WIPRO.NS',
    'SBIN':      'SBIN.NS',
}

FALLBACK_PRICES = {
    'HDFCBANK':  748.00,
    'RELIANCE':  1291.50,
    'INFY':      1199.00,
    'TCS':       2196.00,
    'ICICIBANK': 1260.30,
    'WIPRO':      198.05,
    'SBIN':       977.00,
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
            logging.warning(f"yfinance failed for {symbol}: {e}, using fallback")
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
    symbols = list(prices.keys())

    # Last 3 trading days (Mon–Fri) ending today
    today = datetime.now().replace(hour=9, minute=15, second=0, microsecond=0)
    trading_days = []
    d = today
    while len(trading_days) < 3:
        if d.weekday() < 5:
            trading_days.insert(0, d)
        d -= timedelta(days=1)

    # 50 normal traders, each doing 3-8 trades over 3 days
    trader_ids = [f"T-{i:04d}" for i in range(1, 51)]
    trade_counter = 0

    for tid in trader_ids:
        acct = f"A-{tid[2:]}"
        num_trades = random.randint(3, 8)
        for _ in range(num_trades):
            day_base = random.choice(trading_days)
            symbol = random.choice(symbols)
            real_price = prices[symbol]['current']
            price = round(real_price * random.uniform(0.994, 1.006), 2)
            status_roll = random.random()
            if status_roll < 0.65:
                status = 'EXECUTED'
                cancel_ms = 0
            elif status_roll < 0.85:
                status = 'CANCELLED'
                cancel_ms = random.randint(900, 4000)
            else:
                status = 'PLACED'
                cancel_ms = 0

            trade_counter += 1
            trades.append({
                'trade_id':      f'TRD-N{trade_counter:04d}',
                'timestamp':     (day_base + timedelta(
                    minutes=random.randint(0, 375),
                    seconds=random.randint(0, 59)
                )).strftime('%Y-%m-%d %H:%M:%S'),
                'trader_id':     tid,
                'account_id':    acct,
                'instrument':    symbol,
                'order_type':    random.choice(['BUY', 'SELL']),
                'order_size':    random.randint(100, 10000),
                'price':         price,
                'order_status':  status,
                'cancel_time_ms': cancel_ms,
                'session_id':    f'SES-{tid[2:]}-{random.randint(100,999)}',
            })

    # Additional 100 trades from traders T-0051 to T-0099
    for i in range(100):
        tid = f"T-{random.randint(51, 99):04d}"
        acct = f"A-{tid[2:]}"
        day_base = random.choice(trading_days)
        symbol = random.choice(symbols)
        real_price = prices[symbol]['current']
        price = round(real_price * random.uniform(0.993, 1.007), 2)
        status = random.choice(['EXECUTED', 'EXECUTED', 'EXECUTED', 'CANCELLED', 'PLACED'])
        cancel_ms = random.randint(800, 3500) if status == 'CANCELLED' else 0
        trade_counter += 1
        trades.append({
            'trade_id':      f'TRD-X{trade_counter:04d}',
            'timestamp':     (day_base + timedelta(
                minutes=random.randint(0, 375),
                seconds=random.randint(0, 59)
            )).strftime('%Y-%m-%d %H:%M:%S'),
            'trader_id':     tid,
            'account_id':    acct,
            'instrument':    symbol,
            'order_type':    random.choice(['BUY', 'SELL']),
            'order_size':    random.randint(100, 5000),
            'price':         price,
            'order_status':  status,
            'cancel_time_ms': cancel_ms,
            'session_id':    f'SES-{tid[2:]}-{random.randint(100,999)}',
        })

    # CLUSTER A: LAYERING — T-1042 / HDFCBANK (14 orders)
    hdfcbank_price = prices.get('HDFCBANK', {}).get('current', 748.0)
    base_lay = trading_days[0].replace(hour=9, minute=44, second=0)
    for i in range(14):
        is_cancelled = i < 12
        trades.append({
            'trade_id':      f'TRD-LAY-{i:03d}',
            'timestamp':     (base_lay + timedelta(seconds=i * 10)).strftime('%Y-%m-%d %H:%M:%S'),
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

    # CLUSTER B: SPOOFING — T-2891 / RELIANCE (9 orders)
    reliance_price = prices.get('RELIANCE', {}).get('current', 1291.5)
    base_spf = trading_days[1].replace(hour=10, minute=15, second=0)
    for i in range(9):
        trades.append({
            'trade_id':      f'TRD-SPF-{i:03d}',
            'timestamp':     (base_spf + timedelta(seconds=i * 8)).strftime('%Y-%m-%d %H:%M:%S'),
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

    # CLUSTER C: WASH TRADING — T-3301 / INFY
    infy_price = prices.get('INFY', {}).get('current', 1199.0)
    base_wsh = trading_days[2].replace(hour=11, minute=30, second=0)
    trades.extend([
        {
            'trade_id':      'TRD-WSH-001',
            'timestamp':     base_wsh.strftime('%Y-%m-%d %H:%M:%S'),
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
            'timestamp':     (base_wsh + timedelta(seconds=18)).strftime('%Y-%m-%d %H:%M:%S'),
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

    # CLUSTER D: PUMP AND DUMP — T-4401 / TCS
    tcs_price = prices.get('TCS', {}).get('current', 2196.0)
    base_pnd = trading_days[1].replace(hour=10, minute=0, second=0)
    for i, offset in enumerate([0, 210, 420, 630, 840]):
        trades.append({
            'trade_id':       f'TRD-PND-B{i:02d}',
            'timestamp':      (base_pnd + timedelta(seconds=offset)).strftime('%Y-%m-%d %H:%M:%S'),
            'trader_id':      'T-4401',
            'account_id':     'A-4401',
            'instrument':     'TCS',
            'order_type':     'BUY',
            'order_size':     22000,
            'price':          round(tcs_price, 2),
            'order_status':   'EXECUTED',
            'cancel_time_ms': 0,
            'session_id':     'SES-4401-D',
        })
    for i, offset in enumerate([1080, 1320]):
        trades.append({
            'trade_id':       f'TRD-PND-S{i:02d}',
            'timestamp':      (base_pnd + timedelta(seconds=offset)).strftime('%Y-%m-%d %H:%M:%S'),
            'trader_id':      'T-4401',
            'account_id':     'A-4401',
            'instrument':     'TCS',
            'order_type':     'SELL',
            'order_size':     55000,
            'price':          round(tcs_price * 1.012, 2),
            'order_status':   'EXECUTED',
            'cancel_time_ms': 0,
            'session_id':     'SES-4401-D',
        })

    return sorted(trades, key=lambda x: x['timestamp'])
