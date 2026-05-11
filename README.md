# CB Trading Agents

该仓库已新增 **Streamlit 可部署版本**（面向 A 股可转债交易 Agent 场景），并保留现有前后端代码结构。

## Streamlit 版本能力

- 双轨数据源：
  - **主数据源：AkShare**（可转债日线，适合策略计算）
  - **降级数据源：Sina**（实时快照，适合看盘兜底）
- 内置一个基础 Agent 策略示例：
  - MA5 / MA20 趋势信号（BUY / SELL / HOLD）
- 页面可直接部署到 Streamlit Community Cloud 或自建环境。

## 本地运行（Streamlit）

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-streamlit.txt
streamlit run streamlit_app.py
```

## 部署建议

### Streamlit Community Cloud

- 主文件：`streamlit_app.py`
- 依赖文件：`requirements-streamlit.txt`

### 自建 Docker / VM

可直接用同样命令运行，建议结合进程守护（supervisor/systemd）与反向代理（Nginx）。

## 说明

1. AkShare 接口偶发受网络环境影响；程序会自动降级到新浪快照。
2. 新浪快照模式只有当前时点数据，不建议用于历史回测。
3. 如需进一步贴近 energy trading agents 的多 Agent 编排风格，可在此基础上继续拆分：
   - Data Agent（多源聚合）
   - Signal Agent（技术因子）
   - Risk Agent（仓位/止损）
   - Execution Agent（模拟撮合/交易指令）
