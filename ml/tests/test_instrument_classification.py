import pandas as pd

from ml.scripts.classify_indian_instruments import classify


def test_instrument_classification_requires_exchange_match_and_excludes_funds():
    masters = {
        "equity": pd.DataFrame([
            {"SYMBOL": "ORDINARY", "SERIES": "EQ", "ISIN NUMBER": "INE123A01011"},
            {"SYMBOL": "RESTRICTED", "SERIES": "BE", "ISIN NUMBER": "INE123A01012"},
            {"SYMBOL": "NAMELOOKALIKE", "SERIES": "EQ", "ISIN NUMBER": "INF123A01013"},
        ]),
        "etf": pd.DataFrame([{"Symbol": "FUND"}]),
        "reit": pd.DataFrame([{"Symbol": "PROPERTY"}]),
        "invit": pd.DataFrame([{"Symbol": "INFRA"}]),
    }
    history = pd.DataFrame([
        {"symbol": "ORDINARY", "series": "EQ", "isin": "INE123A01011"},
        {"symbol": "FUND", "series": "EQ", "isin": "INF123A01014"},
        {"symbol": "RESTRICTED", "series": "BE", "isin": "INE123A01012"},
        {"symbol": "NAMELOOKALIKE", "series": "EQ", "isin": "INF123A01013"},
        {"symbol": "DELISTED", "series": "EQ", "isin": "INE000A00000"},
    ])
    classified = classify(masters, history).set_index("symbol")
    assert classified.loc["ORDINARY", "instrument_class"] == "listed_equity_candidate"
    assert classified.loc["FUND", "instrument_class"] == "etf"
    assert classified.loc["RESTRICTED", "instrument_class"] == "other_or_restricted"
    assert classified.loc["NAMELOOKALIKE", "instrument_class"] == "other_or_restricted"
    assert classified.loc["DELISTED", "instrument_class"] == "unknown_historical_or_unmatched"
