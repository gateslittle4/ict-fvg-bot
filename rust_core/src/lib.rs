//! Isolated risk primitives for the Apex FVG platform.
//!
//! This crate is intentionally not wired into the live Node server yet. It
//! mirrors the existing JavaScript contracts so both implementations can be
//! compared before any execution path is migrated.

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SymbolSpec {
    pub point_size: f64,
    pub value_per_point_per_lot: f64,
    pub min_volume: f64,
    pub volume_step: f64,
    pub max_volume: f64,
    pub verified: bool,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LotResult {
    pub lots: f64,
    pub raw_lots: f64,
    pub risk_amount: f64,
    pub actual_risk_amount: f64,
    pub distance: f64,
    pub distance_in_points: f64,
    pub capped_by_min: bool,
    pub capped_by_max: bool,
    pub spec_verified: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LotError {
    InvalidBalance,
    InvalidRisk,
    InvalidPrice,
    InvalidSpec,
    ZeroDistance,
}

pub fn calculate_lot_size(
    balance: f64,
    risk_pct: f64,
    entry_price: f64,
    stop_price: f64,
    spec: SymbolSpec,
) -> Result<LotResult, LotError> {
    if !balance.is_finite() || balance <= 0.0 {
        return Err(LotError::InvalidBalance);
    }
    if !risk_pct.is_finite() || risk_pct <= 0.0 {
        return Err(LotError::InvalidRisk);
    }
    if !entry_price.is_finite() || !stop_price.is_finite() {
        return Err(LotError::InvalidPrice);
    }
    if !spec.point_size.is_finite()
        || spec.point_size <= 0.0
        || !spec.value_per_point_per_lot.is_finite()
        || spec.value_per_point_per_lot <= 0.0
        || !spec.min_volume.is_finite()
        || !spec.volume_step.is_finite()
        || spec.volume_step <= 0.0
        || !spec.max_volume.is_finite()
        || spec.max_volume <= 0.0
    {
        return Err(LotError::InvalidSpec);
    }

    let distance = (entry_price - stop_price).abs();
    if distance <= 0.0 {
        return Err(LotError::ZeroDistance);
    }

    let risk_amount = balance * (risk_pct / 100.0);
    let distance_in_points = ((distance / spec.point_size) * 1e8).round() / 1e8;
    let raw_lots = risk_amount / (distance_in_points * spec.value_per_point_per_lot);
    let rounded_lots = (raw_lots / spec.volume_step).floor() * spec.volume_step;
    let capped_by_min = rounded_lots < spec.min_volume;
    let capped_by_max = rounded_lots > spec.max_volume;
    let lots = if capped_by_min {
        spec.min_volume
    } else if capped_by_max {
        spec.max_volume
    } else {
        rounded_lots
    };

    Ok(LotResult {
        lots,
        raw_lots,
        risk_amount,
        actual_risk_amount: lots * distance_in_points * spec.value_per_point_per_lot,
        distance,
        distance_in_points,
        capped_by_min,
        capped_by_max,
        spec_verified: spec.verified,
    })
}

#[derive(Debug, Clone, PartialEq)]
pub struct GuardrailStatus {
    pub trades_today: usize,
    pub max_trades_per_day: usize,
    pub daily_pnl: f64,
    pub daily_loss_pct: f64,
    pub daily_loss_limit_pct: f64,
    pub target_reached: bool,
    pub blocked: bool,
    pub block_reasons: Vec<&'static str>,
}

#[derive(Debug, Clone)]
pub struct Guardrails {
    pub max_trades_per_day: usize,
    pub daily_loss_limit_pct: f64,
    pub target_pct: Option<f64>,
    starting_balance: Option<f64>,
    current_balance: Option<f64>,
    trades_today: Vec<f64>,
    target_ever_reached: bool,
}

impl Guardrails {
    pub fn new(
        max_trades_per_day: usize,
        daily_loss_limit_pct: f64,
        target_pct: Option<f64>,
    ) -> Self {
        Self {
            max_trades_per_day,
            daily_loss_limit_pct,
            target_pct,
            starting_balance: None,
            current_balance: None,
            trades_today: Vec::new(),
            target_ever_reached: false,
        }
    }

    pub fn set_balance(&mut self, balance: f64) {
        if self.starting_balance.is_none() {
            self.starting_balance = Some(balance);
        }
        self.current_balance = Some(balance);
        if let (Some(start), Some(target)) = (self.starting_balance, self.target_pct) {
            if balance >= start * (1.0 + target / 100.0) {
                self.target_ever_reached = true;
            }
        }
    }

    pub fn record_trade(&mut self, pnl: f64, balance_after: f64) {
        self.trades_today.push(pnl);
        self.set_balance(balance_after);
    }

    pub fn status(&self) -> GuardrailStatus {
        let daily_pnl: f64 = self.trades_today.iter().sum();
        let daily_loss_pct = match self.starting_balance {
            Some(balance) if balance > 0.0 && daily_pnl < 0.0 => -daily_pnl / balance * 100.0,
            _ => 0.0,
        };
        let mut reasons = Vec::new();
        if self.trades_today.len() >= self.max_trades_per_day {
            reasons.push("max_trades_reached");
        }
        if daily_loss_pct >= self.daily_loss_limit_pct {
            reasons.push("daily_loss_limit_reached");
        }
        if self.target_ever_reached {
            reasons.push("profit_target_reached");
        }
        GuardrailStatus {
            trades_today: self.trades_today.len(),
            max_trades_per_day: self.max_trades_per_day,
            daily_pnl,
            daily_loss_pct,
            daily_loss_limit_pct: self.daily_loss_limit_pct,
            target_reached: self.target_ever_reached,
            blocked: !reasons.is_empty(),
            block_reasons: reasons,
        }
    }

    pub fn can_take_new_trade(&self) -> bool {
        !self.status().blocked
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn us100() -> SymbolSpec {
        SymbolSpec {
            point_size: 1.0,
            value_per_point_per_lot: 1.0,
            min_volume: 0.01,
            volume_step: 0.01,
            max_volume: 200.0,
            verified: true,
        }
    }

    #[test]
    fn lot_size_rounds_down_without_overrisking() {
        let result = calculate_lot_size(20_000.0, 0.5, 19_500.0, 19_480.0, us100()).unwrap();
        // risk_amount = 20000 * 0.5% = 100; distance_in_points = (19500-19480)/0.1 = 200;
        // raw_lots = 100 / (200 * 1.0) = 0.5, already aligned to the 0.01 volume_step.
        assert_eq!(result.lots, 0.5);
        assert!(result.actual_risk_amount <= result.risk_amount);
    }

    #[test]
    fn invalid_distance_is_rejected() {
        assert_eq!(
            calculate_lot_size(10_000.0, 0.5, 100.0, 100.0, us100()),
            Err(LotError::ZeroDistance)
        );
    }

    #[test]
    fn target_blocks_after_reaching_it_and_stays_blocked() {
        let mut guardrails = Guardrails::new(3, 2.0, Some(10.0));
        guardrails.set_balance(10_000.0);
        assert!(guardrails.can_take_new_trade());
        guardrails.record_trade(1_000.0, 11_000.0);
        let reached = guardrails.status();
        assert!(reached.target_reached);
        assert!(reached.blocked);
        assert!(reached.block_reasons.contains(&"profit_target_reached"));
        guardrails.record_trade(-100.0, 10_900.0);
        assert!(!guardrails.can_take_new_trade());
    }
}
