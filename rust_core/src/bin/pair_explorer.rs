use std::{env, fs, path::Path};

#[derive(Clone, Copy)]
struct Candle {
    time: i64,
    close: f64,
}

fn load_csv(path: &Path) -> Vec<Candle> {
    let text = fs::read_to_string(path).expect("cannot read CSV");
    text.lines()
        .skip(1)
        .filter_map(|line| {
            let fields: Vec<&str> = line.split(',').collect();
            if fields.len() < 5 {
                return None;
            }
            Some(Candle {
                time: fields[0].parse().ok()?,
                close: fields[4].parse().ok()?,
            })
        })
        .collect()
}

fn correlation(xs: &[f64], ys: &[f64]) -> f64 {
    let mean_x = xs.iter().sum::<f64>() / xs.len() as f64;
    let mean_y = ys.iter().sum::<f64>() / ys.len() as f64;
    let mut numerator = 0.0;
    let mut denom_x = 0.0;
    let mut denom_y = 0.0;
    for (&x, &y) in xs.iter().zip(ys) {
        let dx = x - mean_x;
        let dy = y - mean_y;
        numerator += dx * dy;
        denom_x += dx * dx;
        denom_y += dy * dy;
    }
    numerator / (denom_x * denom_y).sqrt()
}

fn aligned_returns(a: &[Candle], b: &[Candle]) -> (Vec<f64>, Vec<f64>, Vec<f64>) {
    let mut ia = 0;
    let mut ib = 0;
    let mut common = Vec::new();
    while ia < a.len() && ib < b.len() {
        if a[ia].time == b[ib].time {
            common.push((a[ia].time, a[ia].close, b[ib].close));
            ia += 1;
            ib += 1;
        } else if a[ia].time < b[ib].time {
            ia += 1;
        } else {
            ib += 1;
        }
    }
    let mut ra = Vec::new();
    let mut rb = Vec::new();
    let mut ratio = Vec::new();
    for pair in common.windows(2) {
        let (_, a0, b0) = pair[0];
        let (_, a1, b1) = pair[1];
        if a0 > 0.0 && b0 > 0.0 && a1 > 0.0 && b1 > 0.0 {
            ra.push((a1 / a0).ln());
            rb.push((b1 / b0).ln());
            ratio.push(a1.ln() - b1.ln());
        }
    }
    (ra, rb, ratio)
}

fn zscore_events(series: &[f64], lookback: usize, threshold: f64) -> (usize, usize) {
    let mut positive = 0;
    let mut negative = 0;
    if series.len() <= lookback {
        return (0, 0);
    }
    for i in lookback..series.len() {
        let window = &series[i - lookback..i];
        let mean = window.iter().sum::<f64>() / lookback as f64;
        let variance = window.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / lookback as f64;
        let std = variance.sqrt();
        if std == 0.0 {
            continue;
        }
        let z = (series[i] - mean) / std;
        if z >= threshold {
            positive += 1;
        } else if z <= -threshold {
            negative += 1;
        }
    }
    (positive, negative)
}

fn main() {
    let dir = env::args()
        .nth(1)
        .unwrap_or_else(|| "data/backtest-input".into());
    let symbols = ["US100", "US500", "GER40", "UKX", "AUX"];
    let mut loaded = Vec::new();
    for symbol in symbols {
        let path = Path::new(&dir).join(format!("{symbol}.csv"));
        if path.exists() {
            loaded.push((symbol, load_csv(&path)));
        }
    }

    println!("pair,correlation,overlap,ratio_z_ge_2,ratio_z_le_neg_2");
    for i in 0..loaded.len() {
        for j in (i + 1)..loaded.len() {
            let (a_name, a) = &loaded[i];
            let (b_name, b) = &loaded[j];
            let (ra, rb, ratio) = aligned_returns(a, b);
            if ra.len() < 100 {
                continue;
            }
            let (positive, negative) = zscore_events(&ratio, 100, 2.0);
            println!(
                "{a_name}/{b_name},{:.4},{},{},{}",
                correlation(&ra, &rb),
                ra.len(),
                positive,
                negative
            );
        }
    }
}
