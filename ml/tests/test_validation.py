import numpy as np
import pandas as pd

from ml.calibration import SigmoidCalibratedClassifier
from ml.scripts.validate_stock_models import FEATURES, metric_dict, split_blocks
from sklearn.linear_model import LogisticRegression


def test_chronological_blocks_leave_horizon_purge():
    dates = pd.date_range("2020-01-01", periods=100, freq="D", tz="UTC")
    frame = pd.DataFrame({"date": dates.repeat(2), "symbol": ["A", "B"] * 100})
    folds, final_test = split_blocks(frame, 20)
    assert folds[0]["trainEndExclusive"] < folds[0]["validationStart"]
    assert folds[1]["trainEndExclusive"] < folds[1]["validationStart"]
    assert frame.loc[final_test, "date"].min() > frame.loc[frame.date < frame.loc[final_test, "date"].min(), "date"].max()


def test_metrics_include_prevalence_and_probability_quality():
    result = metric_dict([0, 1, 1, 0], [0.2, 0.8, 0.6, 0.4])
    assert result["positivePrevalence"] == 0.5
    assert "pr_auc" in result and "brierScore" in result and "logLoss" in result


def test_sigmoid_calibrator_is_reproducible_and_probability_bounded():
    x = np.arange(20, dtype=float).reshape(-1, 1)
    y = (x[:, 0] > 9).astype(int)
    base = LogisticRegression().fit(x, y)
    calibrated = SigmoidCalibratedClassifier(base).fit_calibrator(x, y)
    first = calibrated.predict_proba(x)
    second = calibrated.predict_proba(x)
    assert np.allclose(first, second)
    assert np.all((first >= 0) & (first <= 1))
    assert first.shape == (20, 2)
