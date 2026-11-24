"""Small, serializable probability calibration wrapper used by inference."""
import numpy as np
from sklearn.linear_model import LogisticRegression


class SigmoidCalibratedClassifier:
    def __init__(self, base):
        self.base = base
        self.calibrator = LogisticRegression(max_iter=1000, random_state=42)

    def fit_calibrator(self, X, y):
        probability = np.clip(self.base.predict_proba(X)[:, 1], 1e-6, 1 - 1e-6)
        logits = np.log(probability / (1 - probability)).reshape(-1, 1)
        self.calibrator.fit(logits, np.asarray(y).astype(int))
        return self

    def predict_proba(self, X):
        probability = np.clip(self.base.predict_proba(X)[:, 1], 1e-6, 1 - 1e-6)
        logits = np.log(probability / (1 - probability)).reshape(-1, 1)
        positive = self.calibrator.predict_proba(logits)[:, 1]
        return np.column_stack([1 - positive, positive])
