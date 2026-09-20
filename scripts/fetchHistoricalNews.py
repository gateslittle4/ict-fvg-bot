#!/usr/bin/env python3
"""fetchHistoricalNews.py - builds data/news-calendar-2019-2023.json from OFFICIAL sources only (2026-09-20).

Usage: python3 scripts/fetchHistoricalNews.py [cache_dir]   (cached HTML is reused when present)

Sources (nothing guessed - every date is read from an official page):
  CPI + Employment Situation (NFP): bls.gov/schedule/news_release/{cpi,empsit}.htm, read through the Internet Archive's
      copies of the OFFICIAL BLS pages (bls.gov itself answers 403 to scripts). Snapshots every 6 months 2019-2025; for a
      reference month the LATEST snapshot wins, so a rescheduled release (shutdowns, pandemic) keeps its real date.
  FOMC statements: federalreserve.gov/monetarypolicy/fomchistorical{2019,2020}.htm and fomccalendars.htm (2021+),
      scheduled meetings only, last day of the meeting, 14:00 ET. The unscheduled March 2020 meetings are listed under
      `excluded` (their statement times are not on the page and were not guessed).
  GDP advance estimate + Personal Income and Outlays (PCE): bea.gov/news/schedule/full through the Internet Archive
      (snapshots March and September of each year, latest wins). The page has dates but no times: 08:30 ET is assumed
      (BEA's usual time); BEA occasionally uses 10:00 ET (e.g. PCE 2024-11-27, see newsEvents.js) - flagged `timeAssumed`.
Not covered (and NOT invented): ECB decisions (ecb.europa.eu lists load dynamically), Census retail sales, ISM/PMI.
The same method is checked against the already-verified 2024 list of src/backtest/newsEvents.js (see `validation`).
"""
import glob, html, json, os, re, sys, time, datetime, urllib.request

CACHE = sys.argv[1] if len(sys.argv) > 1 else '/tmp/news-cache'
os.makedirs(CACHE, exist_ok=True)
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
MONTH = {m: i + 1 for i, m in enumerate(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'])}
MON3 = {k[:3]: v for k, v in MONTH.items()}

def get(name, url):
    path = os.path.join(CACHE, name)
    if not os.path.exists(path) or os.path.getsize(path) < 30000:
        for _ in range(4):
            try:
                req = urllib.request.Request(url, headers={'User-Agent': UA})
                open(path, 'wb').write(urllib.request.urlopen(req, timeout=60).read())
                if os.path.getsize(path) > 30000: break
            except Exception:
                pass
            time.sleep(4)
        time.sleep(1)
    return open(path, encoding='utf8', errors='ignore').read()

def text(s):
    t = re.sub(r'<script.*?</script>|<style.*?</style>', '', s, flags=re.S)
    t = re.sub(r'<[^>]+>', '|', t); t = html.unescape(t); t = re.sub(r'\s+', ' ', t)
    return re.sub(r'(\| ?)+', '|', t)

events, excluded = [], []
# ---- BLS
for rel, kind in (('cpi', 'CPI'), ('empsit', 'NFP')):
    best = {}
    for y in range(2019, 2026):
        for md in ('0301', '0901'):
            snap = f'{y}{md}'
            t = text(get(f'{rel}_{snap}.html', f'https://web.archive.org/web/{snap}000000/https://www.bls.gov/schedule/news_release/{rel}.htm'))
            for ref, d, tm in re.findall(r'([A-Z][a-z]+ \d{4})[\s|]+([A-Z][a-z]{2,8}\.? \d{1,2}, \d{4})[\s|]+(\d{2}:\d{2} [AP]M)', t):
                try: dt = datetime.datetime.strptime(d.replace('.', ''), '%b %d, %Y')
                except ValueError: dt = datetime.datetime.strptime(d, '%B %d, %Y')
                best[ref] = (dt.strftime('%Y-%m-%d'), datetime.datetime.strptime(tm, '%I:%M %p').strftime('%H:%M'), snap)
    for ref, (d, tm, snap) in best.items():
        events.append({'kind': kind, 'date': d, 'time': tm, 'tz': 'America/New_York', 'reference': ref, 'source': f'https://www.bls.gov/schedule/news_release/{rel}.htm (Internet Archive snapshot {snap})'})
# ---- FOMC
def monnum(name):
    last = name.split('/')[-1]; return MONTH.get(last) or MON3.get(last[:3])
for y in (2019, 2020):
    url = f'https://www.federalreserve.gov/monetarypolicy/fomchistorical{y}.htm'
    t = text(get(f'fomc{y}.html', url))
    for mon, d1, d2, flag, kind, yr in re.findall(r'([A-Z][a-z]+(?:/[A-Z][a-z]+)?) (\d{1,2})(?:-(\d{1,2}))?( \((?:unscheduled|cancelled)\))? (Meeting|Conference Call) - (\d{4})', t):
        if int(yr) != y: continue
        date = f'{y}-{monnum(mon):02d}-{int(d2 or d1):02d}'
        if flag: excluded.append({'kind': 'FOMC', 'date': date, 'why': f'listed as {flag.strip(" ()")} on the Fed page; statement time not on the page, not guessed', 'source': url})
        else: events.append({'kind': 'FOMC', 'date': date, 'time': '14:00', 'tz': 'America/New_York', 'source': url})
cal = text(get('fomccal.html', 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'))
for y in range(2021, 2025):
    i = cal.find(f'{y} FOMC Meetings'); j = cal.find(f'{y-1} FOMC Meetings', i + 10)
    for mon, d1, d2, st in re.findall(r'\|([A-Z][a-z]+(?:/[A-Z][a-z]+)?)\|(\d{1,2})(?:-(\d{1,2}))?(\*?)\|Statement', cal[i:j if j > 0 else i + 9000]):
        events.append({'kind': 'FOMC', 'date': f'{y}-{monnum(mon):02d}-{int(d2 or d1):02d}', 'time': '14:00', 'tz': 'America/New_York', 'source': 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'})
# ---- BEA
gdp, pce = {}, {}
for y in range(2019, 2025):
    for md in ('0301', '0901'):
        snap = f'{y}{md}'
        t = text(get(f'beafull_{snap}.html', f'https://web.archive.org/web/{snap}000000/https://www.bea.gov/news/schedule/full'))
        for title, mon, d in re.findall(r'\|([^|]{5,220}?) ?\|([A-Z][a-z]+) (\d{1,2}) ?\|', t):
            if mon not in MONTH: continue
            date = f'{y}-{MONTH[mon]:02d}-{int(d):02d}'; tl = title.lower()
            if title.startswith('Personal Income and Outlays'): pce.setdefault(title + str(y), (date, snap))
            elif (tl.startswith('gross domestic product') and 'advance estimate' in tl) or tl.startswith('initial gross domestic product'): gdp.setdefault(title + str(y), (date, snap))
            if title.startswith('Personal Income and Outlays'): pce[title + str(y)] = (date, snap)
            elif (tl.startswith('gross domestic product') and 'advance estimate' in tl) or tl.startswith('initial gross domestic product'): gdp[title + str(y)] = (date, snap)
for kind, d in (('GDP', gdp), ('PCE', pce)):
    for (date, snap) in sorted(set(d.values())):
        events.append({'kind': kind, 'date': date, 'time': '08:30', 'tz': 'America/New_York', 'timeAssumed': True, 'source': f'https://www.bea.gov/news/schedule/full (Internet Archive snapshot {snap})'})

events = [e for e in events if '2019-01-01' <= e['date'] <= '2023-12-31']
events.sort(key=lambda e: (e['date'], e['time'], e['kind']))
seen = set(); uniq = []
for e in events:
    k = (e['kind'], e['date'])
    if k in seen: continue
    seen.add(k); uniq.append(e)
# ---- validation on the already-verified 2024 list (same method, 2024 window)
validation = {}
js = open(os.path.join(os.path.dirname(__file__), '..', 'src', 'backtest', 'newsEvents.js')).read()
existing = {tuple(map(int, x)) for x in re.findall(r'\[(\d+),(\d+),(\d+),(\d+),(\d+)\]', js)}
def y24(kind):
    if kind in ('CPI', 'NFP'):
        rel = 'cpi' if kind == 'CPI' else 'empsit'; out = set()
        for md in ('0301', '0901'):
            t = text(get(f'{rel}_2024{md}.html', ''))
            for ref, d, tm in re.findall(r'([A-Z][a-z]+ \d{4})[\s|]+([A-Z][a-z]{2,8}\.? \d{1,2}, \d{4})[\s|]+(\d{2}:\d{2} [AP]M)', t):
                try: dt = datetime.datetime.strptime(d.replace('.', ''), '%b %d, %Y')
                except ValueError: dt = datetime.datetime.strptime(d, '%B %d, %Y')
                if dt.year == 2024: out.add((2024, dt.month, dt.day))
        return out
    return set()
for kind in ('CPI', 'NFP'):
    got = y24(kind); ok = {d for d in got if d + (8, 30) in existing}
    validation[kind + ' 2024'] = {'archive': len(got), 'matching the verified list': len(ok)}
out = {'generatedAt': datetime.date.today().isoformat(), 'method': __doc__, 'events': uniq, 'excluded': excluded, 'validation': validation,
       'counts': {k: sum(1 for e in uniq if e['kind'] == k) for k in ('CPI', 'NFP', 'FOMC', 'GDP', 'PCE')}}
json.dump(out, open(os.path.join(os.path.dirname(__file__), '..', 'data', 'news-calendar-2019-2023.json'), 'w'), ensure_ascii=False, indent=1)
print(json.dumps({'counts': out['counts'], 'validation': validation, 'excluded': len(excluded)}))
