import datetime as dt
from dataclasses import dataclass
from typing import Optional

import pandas as pd
import streamlit as st

try:
    import requests
except Exception:
    requests = None

try:
    import akshare as ak
except Exception:
    ak = None

try:
    import baostock as bs
except Exception:
    bs = None

SINA_SPOT_URL = "https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData"
JISILU_CB_LIST_URL = "https://www.jisilu.cn/web/data/cb/list"
EASTMONEY_CB_SPOT_URL = "https://push2.eastmoney.com/api/qt/clist/get"


@dataclass
class DataFetchResult:
    df: pd.DataFrame
    source: str
    note: str = ""


def _normalize_bond_code(code: str) -> str:
    code = code.strip().lower()
    if code.startswith(("sh", "sz")):
        return code
    if code.startswith(("11","12")):
        return f"sh{code}" if code.startswith("11") else f"sz{code}"
    return code


def _build_demo_data(end: dt.date, days: int = 30) -> pd.DataFrame:
    dates = pd.date_range(end=end, periods=days, freq="B")
    base = pd.Series(range(days), dtype=float) * 0.05 + 100
    return pd.DataFrame({"trade_date": dates, "open": base, "high": base + 0.2, "low": base - 0.2, "close": base})


def _http_get_json(url: str, params: Optional[dict] = None, headers: Optional[dict] = None, timeout: int = 15):
    if requests is None:
        return None
    try:
        r = requests.get(url, params=params, headers=headers, timeout=timeout)
        r.raise_for_status()
        return r.json()
    except Exception:
        return None


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




def get_cbond_spot_akshare() -> Optional[pd.DataFrame]:
    if ak is None:
        return None
    try:
        df = ak.bond_zh_hs_cov_spot()
        if df is None or df.empty:
            return None
        rename_map = {"symbol": "bond_code", "code": "bond_code", "name": "bond_name", "trade": "price", "price": "price"}
        df = df.rename(columns=rename_map)
        if "bond_code" not in df.columns:
            return None
        df["bond_code"] = df["bond_code"].astype(str).str.replace("sh", "", regex=False).str.replace("sz", "", regex=False)
        if "price" in df.columns:
            df["price"] = pd.to_numeric(df["price"], errors="coerce")
        return df
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
        rows = []
        while rs.error_code == "0" and rs.next():
            rows.append(rs.get_row_data())
        bs.logout()
        if not rows:
            return None
        df = pd.DataFrame(rows, columns=rs.fields).rename(columns={"date": "trade_date"})
        for col in ["open", "high", "low", "close", "volume", "amount"]:
            df[col] = pd.to_numeric(df[col], errors="coerce")
        df["trade_date"] = pd.to_datetime(df["trade_date"])
        return df
    except Exception:
        return None


def get_cbond_spot_jisilu() -> Optional[pd.DataFrame]:
    if requests is None:
        return None
    headers = {
        "User-Agent": "Mozilla/5.0",
        "Referer": "https://www.jisilu.cn/data/cbnew/",
        "X-Requested-With": "XMLHttpRequest",
    }
    payload = {"fprice": "", "tprice": "", "curr_iss_amt": "", "volume": "", "svolume": "", "premium_rt": "", "ytm_rt": ""}

    try:
        s = requests.Session()
        s.get("https://www.jisilu.cn/data/cbnew/", headers=headers, timeout=15)
        r = s.post(JISILU_CB_LIST_URL, headers=headers, data=payload, timeout=15)
        r.raise_for_status()
        data = r.json()
        rows = data.get("rows", []) if isinstance(data, dict) else []
        if not rows:
            return None
        records = []
        for row in rows:
            c = row.get("cell", {})
            records.append(
                {
                    "bond_code": str(c.get("bond_id", "")),
                    "bond_name": c.get("bond_nm"),
                    "price": pd.to_numeric(c.get("price"), errors="coerce"),
                    "premium_rt": c.get("premium_rt"),
                    "remain_size": c.get("remain_size"),
                    "redeem_flag": c.get("redeem_flag"),
                }
            )
        out = pd.DataFrame(records)
        return out if not out.empty else None
    except Exception:
        return None


def get_cbond_spot_eastmoney() -> Optional[pd.DataFrame]:
    params = {
        "pn": "1",
        "pz": "5000",
        "po": "1",
        "np": "1",
        "ut": "bd1d9ddb04089700cf9c27f6f7426281",
        "fltt": "2",
        "invt": "2",
        "fid": "f3",
        "fs": "b:MK0354",
        "fields": "f12,f14,f2,f3,f5,f6",
    }
    data = _http_get_json(EASTMONEY_CB_SPOT_URL, params=params)
    try:
        diff = data.get("data", {}).get("diff", []) if isinstance(data, dict) else []
        if not diff:
            return None
        df = pd.DataFrame(diff)
        df = df.rename(columns={"f12": "bond_code", "f14": "bond_name", "f2": "price", "f3": "change_pct", "f5": "volume", "f6": "amount"})
        df["price"] = pd.to_numeric(df["price"], errors="coerce")
        return df[["bond_code", "bond_name", "price", "change_pct", "volume", "amount"]]
    except Exception:
        return None




def calc_td9(df: pd.DataFrame) -> pd.DataFrame:
    work = df.copy().sort_values("trade_date").reset_index(drop=True)
    work["td_buy_setup"] = 0
    work["td_sell_setup"] = 0
    buy_count = 0
    sell_count = 0
    for i in range(len(work)):
        if i < 4:
            continue
        close_now = work.loc[i, "close"]
        close_4 = work.loc[i - 4, "close"]
        if close_now < close_4:
            buy_count += 1
            sell_count = 0
        elif close_now > close_4:
            sell_count += 1
            buy_count = 0
        else:
            buy_count = 0
            sell_count = 0
        work.loc[i, "td_buy_setup"] = min(buy_count, 9)
        work.loc[i, "td_sell_setup"] = min(sell_count, 9)
    work["td9_signal"] = "NONE"
    work.loc[work["td_buy_setup"] >= 9, "td9_signal"] = "TD9_BUY"
    work.loc[work["td_sell_setup"] >= 9, "td9_signal"] = "TD9_SELL"
    return work


def build_agent_discussion(latest_row: pd.Series) -> list[dict]:
    trend_agent = "趋势中性"
    if latest_row.get("signal") == "BUY":
        trend_agent = "MA趋势偏多，建议关注回踩后的低吸机会"
    elif latest_row.get("signal") == "SELL":
        trend_agent = "MA趋势偏空，建议控制仓位并等待止跌确认"

    td9_agent = "TD9 未到关键计数"
    if latest_row.get("td9_signal") == "TD9_BUY":
        td9_agent = "TD9买入9触发，短线可能进入衰竭反弹窗口"
    elif latest_row.get("td9_signal") == "TD9_SELL":
        td9_agent = "TD9卖出9触发，短线冲高回落风险上升"

    risk_agent = "风险中性"
    ma20 = latest_row.get("ma20")
    close = latest_row.get("close")
    if pd.notna(ma20) and pd.notna(close):
        if close < ma20:
            risk_agent = "价格位于MA20下方，建议降低杠杆/仓位"
        else:
            risk_agent = "价格位于MA20上方，可保留趋势仓但设置止损"

    return [
        {"agent": "Trend Agent", "view": trend_agent},
        {"agent": "TD9 Agent", "view": td9_agent},
        {"agent": "Risk Agent", "view": risk_agent},
    ]


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
    code_plain = symbol[2:]

    for fn, name, note in [
        (lambda: get_cbond_daily_akshare(symbol, start, end), "AkShare", "使用 AkShare 日线数据。"),
        (lambda: get_cbond_daily_baostock(symbol, start, end), "Baostock", "AkShare 不可用，切换 Baostock 日线。"),
    ]:
        df = fn()
        if df is not None and not df.empty:
            return DataFetchResult(df, name, note)

    for fn, name in [(get_cbond_spot_akshare, "AkShareSpot"), (get_cbond_spot_jisilu, "Jisilu"), (get_cbond_spot_eastmoney, "Eastmoney")]:
        snap = fn()
        if snap is not None and not snap.empty:
            row = snap[snap["bond_code"].astype(str) == code_plain].copy() if "bond_code" in snap.columns else pd.DataFrame()
            if row.empty:
                row = snap.head(1).copy()
            close = pd.to_numeric(row.iloc[0].get("price"), errors="coerce")
            if pd.notna(close):
                out = pd.DataFrame({"trade_date": [pd.Timestamp.now().normalize()], "open": [close], "high": [close], "low": [close], "close": [close]})
                return DataFetchResult(out, name, f"已使用 {name} 实时快照数据。")

    demo = _build_demo_data(end)
    return DataFetchResult(demo, "Demo", "外部数据源不可用，已回退演示数据。")


def render() -> None:
    st.set_page_config(page_title="A股可转债 Trading Agents", layout="wide")
    st.title("A股可转债 Trading Agents（Streamlit 部署版）")
    st.caption("优先级：AkShare(日线) → Baostock(日线) → AkShare(快照) → Jisilu → Eastmoney → Demo")

    with st.sidebar:
        code = st.text_input("可转债代码", value="113601")
        start = st.date_input("开始日期", value=dt.date.today() - dt.timedelta(days=180))
        end = st.date_input("结束日期", value=dt.date.today())
        run = st.button("运行策略")

    if not run:
        st.info("请输入参数后点击运行。")
        return

    result = fetch_data(code, start, end)
    st.success(f"数据源：{result.source}")
    st.warning(result.note)

    sig = simple_signal(result.df)
    sig = calc_td9(sig)
    latest = sig.iloc[-1]
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("最新收盘", f"{latest['close']:.2f}")
    c2.metric("MA5", f"{latest['ma5']:.2f}" if pd.notna(latest["ma5"]) else "N/A")
    c3.metric("MA20", f"{latest['ma20']:.2f}" if pd.notna(latest["ma20"]) else "N/A")
    c4.metric("TD9", latest.get("td9_signal", "NONE"))
    st.dataframe(sig[["trade_date", "close", "ma5", "ma20", "signal", "td_buy_setup", "td_sell_setup", "td9_signal"]].tail(30), width="stretch")

    st.subheader("Agents 讨论")
    discussion = build_agent_discussion(latest)
    st.dataframe(pd.DataFrame(discussion), width="stretch")


if __name__ == "__main__":
    render()
