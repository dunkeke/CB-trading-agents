import datetime as dt
from dataclasses import dataclass
from typing import Optional

import pandas as pd
import requests
import streamlit as st

try:
    import akshare as ak
except Exception:
    ak = None


SINA_SPOT_URL = "https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData"


@dataclass
class DataFetchResult:
    df: pd.DataFrame
    source: str
    note: str = ""


def _normalize_bond_code(code: str) -> str:
    code = code.strip()
    if code.startswith(("sh", "sz")):
        return code
    if code.startswith("11"):
        return f"sh{code}"
    return f"sz{code}"


def get_cbond_daily_akshare(symbol: str, start: dt.date, end: dt.date) -> Optional[pd.DataFrame]:
    if ak is None:
        return None
    try:
        df = ak.bond_zh_hs_cov_daily(symbol=symbol)
        if df is None or df.empty:
            return None
        df = df.reset_index().rename(columns={"date": "trade_date"})
        df["trade_date"] = pd.to_datetime(df["trade_date"])
        return df[(df["trade_date"] >= pd.to_datetime(start)) & (df["trade_date"] <= pd.to_datetime(end))].copy()
    except Exception:
        return None


def get_cbond_spot_sina() -> Optional[pd.DataFrame]:
    try:
        params = {"page": "1", "num": "5000", "sort": "changepercent", "asc": "0", "node": "cb", "symbol": ""}
        resp = requests.get(SINA_SPOT_URL, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        if not data:
            return None
        df = pd.DataFrame(data)
        for col in ["trade", "pricechange", "changepercent", "volume", "amount"]:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce")
        return df
    except Exception:
        return None


def simple_signal(df: pd.DataFrame) -> pd.DataFrame:
    work = df.copy().sort_values("trade_date")
    work["ma5"] = work["close"].rolling(5).mean()
    work["ma20"] = work["close"].rolling(20).mean()
    work["signal"] = "HOLD"
    work.loc[work["ma5"] > work["ma20"], "signal"] = "BUY"
    work.loc[work["ma5"] < work["ma20"], "signal"] = "SELL"
    return work


def fetch_data(code: str, start: dt.date, end: dt.date) -> DataFetchResult:
    symbol = _normalize_bond_code(code)
    ak_df = get_cbond_daily_akshare(symbol, start, end)
    if ak_df is not None and not ak_df.empty:
        note = "使用 AkShare 日线数据进行策略分析。"
        return DataFetchResult(df=ak_df, source="AkShare", note=note)

    sina_spot = get_cbond_spot_sina()
    if sina_spot is not None and not sina_spot.empty:
        code_plain = symbol[2:]
        target = sina_spot[sina_spot.get("code", "") == code_plain].copy()
        if target.empty:
            target = sina_spot.head(1).copy()
        now = pd.Timestamp.now().normalize()
        target = target.rename(columns={"trade": "close"})
        target["trade_date"] = now
        target["open"] = target["close"]
        target["high"] = target["close"]
        target["low"] = target["close"]
        note = "AkShare 不可用，已降级为新浪实时快照数据（仅用于看盘，不建议回测）。"
        return DataFetchResult(df=target[["trade_date", "open", "high", "low", "close"]], source="Sina", note=note)

    raise RuntimeError("数据拉取失败：AkShare 与新浪接口均不可用。")


def render():
    st.set_page_config(page_title="A股可转债 Trading Agents", layout="wide")
    st.title("A股可转债 Trading Agents（Streamlit 部署版）")
    st.caption("双轨数据源：AkShare（日线）+ 新浪（降级快照）。")

    with st.sidebar:
        st.header("参数")
        code = st.text_input("可转债代码", value="113601")
        start = st.date_input("开始日期", value=dt.date.today() - dt.timedelta(days=180))
        end = st.date_input("结束日期", value=dt.date.today())
        run = st.button("运行策略")

    if not run:
        st.info("请输入参数后点击“运行策略”。")
        return

    if start > end:
        st.error("开始日期不能晚于结束日期。")
        return

    with st.spinner("正在拉取数据并运行策略..."):
        result = fetch_data(code, start, end)

    st.success(f"数据源：{result.source}")
    if result.note:
        st.warning(result.note)

    df = result.df
    if "close" not in df.columns:
        st.error("数据中缺少 close 字段，无法分析。")
        return

    if len(df) >= 20:
        sig = simple_signal(df)
        latest = sig.iloc[-1]
        c1, c2, c3 = st.columns(3)
        c1.metric("最新收盘", f"{latest['close']:.2f}")
        c2.metric("MA5", f"{latest['ma5']:.2f}")
        c3.metric("MA20", f"{latest['ma20']:.2f}")
        st.subheader("策略信号")
        st.dataframe(sig[["trade_date", "close", "ma5", "ma20", "signal"]].tail(20), use_container_width=True)
        st.line_chart(sig.set_index("trade_date")[["close", "ma5", "ma20"]])
    else:
        st.warning("可用数据不足 20 条，仅展示原始数据。")
        st.dataframe(df, use_container_width=True)


if __name__ == "__main__":
    render()
