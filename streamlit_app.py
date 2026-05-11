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

try:
    import baostock as bs
except Exception:
    bs = None

SINA_SPOT_URL = "https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData"
JISILU_CB_LIST_URL = "https://www.jisilu.cn/webapi/cb/list/"


@dataclass
class DataFetchResult:
    df: pd.DataFrame
    source: str
    note: str = ""


def _normalize_bond_code(code: str) -> str:
    code = code.strip().lower()
    if code.startswith(("sh", "sz")):
        return code
    return f"sh{code}" if code.startswith("11") else f"sz{code}"


def _build_demo_data(end: dt.date, days: int = 30) -> pd.DataFrame:
    dates = pd.date_range(end=end, periods=days, freq="B")
    base = pd.Series(range(days), dtype=float) * 0.05 + 100
    return pd.DataFrame(
        {
            "trade_date": dates,
            "open": base,
            "high": base + 0.2,
            "low": base - 0.2,
            "close": base + (base.index % 3 - 1) * 0.08,
        }
    )


def get_cbond_daily_akshare(symbol: str, start: dt.date, end: dt.date) -> Optional[pd.DataFrame]:
    if ak is None:
        return None
    try:
        df = ak.bond_zh_hs_cov_daily(symbol=symbol)
        if df is None or df.empty:
            return None
        df = df.reset_index().rename(columns={"date": "trade_date"})
        df["trade_date"] = pd.to_datetime(df["trade_date"])
        df = df[(df["trade_date"] >= pd.to_datetime(start)) & (df["trade_date"] <= pd.to_datetime(end))]
        return df.copy() if not df.empty else None
    except Exception:
        return None


def get_cbond_spot_sina() -> Optional[pd.DataFrame]:
    try:
        resp = requests.get(
            SINA_SPOT_URL,
            params={"page": "1", "num": "5000", "sort": "changepercent", "asc": "0", "node": "cb", "symbol": ""},
            timeout=10,
        )
        resp.raise_for_status()
        try:
            data = resp.json()
        except Exception:
            import ast

            text = resp.text.strip()
            if not text or text in {"null", "None"}:
                return None
            data = ast.literal_eval(text)

        if not data:
            return None
        df = pd.DataFrame(data)
        if df.empty:
            return None
        for col in ["trade", "pricechange", "changepercent", "volume", "amount"]:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce")
        return df
    except Exception:
        return None


def get_cbond_spot_jisilu() -> Optional[pd.DataFrame]:
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            "Referer": "https://www.jisilu.cn/data/cbnew/",
        }
        resp = requests.get(JISILU_CB_LIST_URL, headers=headers, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        rows = data.get("rows", []) if isinstance(data, dict) else []
        if not rows:
            return None

        records = []
        for r in rows:
            cell = r.get("cell", {})
            records.append(
                {
                    "bond_code": str(cell.get("bond_id", "")),
                    "bond_name": cell.get("bond_nm"),
                    "price": pd.to_numeric(cell.get("price"), errors="coerce"),
                    "premium_rt": cell.get("premium_rt"),
                    "remain_size": cell.get("remain_size"),
                    "year_left": cell.get("year_left"),
                    "redeem_flag": cell.get("redeem_flag"),
                    "volume": pd.to_numeric(cell.get("volume"), errors="coerce"),
                }
            )
        df = pd.DataFrame(records)
        return df if not df.empty else None
    except Exception:
        return None


def get_cbond_daily_baostock(symbol: str, start: dt.date, end: dt.date) -> Optional[pd.DataFrame]:
    if bs is None:
        return None
    try:
        lg = bs.login()
        if lg.error_code != "0":
            return None

        rs = bs.query_history_k_data_plus(
            symbol,
            "date,open,high,low,close,volume,amount",
            start_date=start.strftime("%Y-%m-%d"),
            end_date=end.strftime("%Y-%m-%d"),
            frequency="d",
            adjustflag="2",
        )
        data_list = []
        while (rs.error_code == "0") and rs.next():
            data_list.append(rs.get_row_data())
        bs.logout()
        if not data_list:
            return None

        df = pd.DataFrame(data_list, columns=rs.fields)
        for col in ["open", "high", "low", "close", "volume", "amount"]:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce")
        df = df.rename(columns={"date": "trade_date"})
        df["trade_date"] = pd.to_datetime(df["trade_date"])
        return df if not df.empty else None
    except Exception:
        try:
            bs.logout()
        except Exception:
            pass
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
    if ak_df is not None:
        return DataFetchResult(ak_df, "AkShare", "使用 AkShare 日线数据进行策略分析。")

    baostock_df = get_cbond_daily_baostock(symbol, start, end)
    if baostock_df is not None:
        return DataFetchResult(baostock_df, "Baostock", "AkShare 不可用，已切换 Baostock 日线数据。")

    sina_spot = get_cbond_spot_sina()
    if sina_spot is not None:
        code_plain = symbol[2:]
        target = sina_spot[sina_spot["code"].astype(str) == code_plain].copy() if "code" in sina_spot.columns else pd.DataFrame()
        if target.empty:
            target = sina_spot.head(1).copy()
        if "trade" in target.columns:
            target = target.rename(columns={"trade": "close"})
            target["trade_date"] = pd.Timestamp.now().normalize()
            for col in ["open", "high", "low"]:
                target[col] = target["close"]
            return DataFetchResult(
                target[["trade_date", "open", "high", "low", "close"]].copy(),
                "Sina",
                "AkShare/Baostock 不可用，已降级为新浪实时快照数据。",
            )

    jisilu = get_cbond_spot_jisilu()
    if jisilu is not None:
        code_plain = symbol[2:]
        row = jisilu[jisilu["bond_code"] == code_plain].copy()
        if row.empty:
            row = jisilu.head(1).copy()
        close = pd.to_numeric(row.iloc[0]["price"], errors="coerce")
        if pd.notna(close):
            out = pd.DataFrame(
                {
                    "trade_date": [pd.Timestamp.now().normalize()],
                    "open": [close],
                    "high": [close],
                    "low": [close],
                    "close": [close],
                }
            )
            return DataFetchResult(out, "Jisilu", "已使用集思录可转债快照数据（免费渠道）。")

    demo = _build_demo_data(end)
    return DataFetchResult(demo, "Demo", "外部数据源均不可用，已启用演示数据。")


def render() -> None:
    st.set_page_config(page_title="A股可转债 Trading Agents", layout="wide")
    st.title("A股可转债 Trading Agents（Streamlit 部署版）")
    st.caption("数据优先级：AkShare → Baostock → Sina → Jisilu → Demo")

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

    sig = simple_signal(result.df)
    latest = sig.iloc[-1]
    c1, c2, c3 = st.columns(3)
    c1.metric("最新收盘", f"{latest['close']:.2f}")
    c2.metric("MA5", f"{latest['ma5']:.2f}" if pd.notna(latest["ma5"]) else "N/A")
    c3.metric("MA20", f"{latest['ma20']:.2f}" if pd.notna(latest["ma20"]) else "N/A")
    st.dataframe(sig[["trade_date", "close", "ma5", "ma20", "signal"]].tail(30), use_container_width=True)
    st.line_chart(sig.set_index("trade_date")[["close", "ma5", "ma20"]])


if __name__ == "__main__":
    render()
