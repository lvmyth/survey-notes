// Agentic RAG 升级实践文章
ARTICLE_CONTENTS["rag-agentic-practice"] = "# Agentic RAG 升级实践：从「会算」到「会想」\n\
\n\
> 上一篇文章《让 RAG 测量助手会算数据》讲的是 Function Calling——助手学会了「听懂人话、选对工具、填好参数」。但用起来会发现一个限制：它仍然是一次问答一次工具调用，遇到「先查资料再算」的多步任务就不行了。这次我把本地 RAG 测量助手升级成了 **Agentic RAG**：让大模型不再是被动的问答器，而是会**自主规划步骤、循环调用工具、检查中间结果**的智能体。本地 `scripts/` 里新增了 `agent_tools.py`（9 个测量工具的 function calling Schema 与执行入口），`rag.py` 增加了 `agent_ask`（ReAct 决策循环），Streamlit 界面也已接入。本文记录这次升级的完整实践：从 Function Calling 到 Agent 决策循环的原理、为什么用 DeepSeek API 做决策而把计算留在本地、测量场景的多步流程设计（平差+限差校验、查表+计算等）、以及实际调优中踩过的坑和经验。\n\
\n\
## 一、为什么还要升级：从「会算」到「会想」\n\
\n\
### 1.1 Function Calling 的边界\n\
\n\
升级前的助手（Function Calling 版）能力模型：\n\
\n\
```text\n\
用户 → LLM 判断 → 调一个工具 → 回答\n\
```\n\
\n\
问题场景：\n\
\n\
```text\n\
「把这段导线平差了，看看闭合差符不符合一级导线要求」\n\
旧助手：调 traverse_adjust → 返回闭合差 → 结束\n\
         ✗ 不会再去查规范允许值、不会对比、不会给结论\n\
```\n\
\n\
它**算**了，但没「**办完事**」——中间还缺「查规范限差」和「对比下结论」两步。\n\
\n\
### 1.2 Agentic RAG 的能力模型\n\
\n\
```text\n\
用户 → LLM 自主决策（循环）：\n\
   ├─ 「需要平差」 → 调 traverse_adjust\n\
   ├─ 「需要规范」 → 调 search_kb（检索限差）\n\
   ├─ 「可以对比了」 → 调 check_limits\n\
   └─ 「办完了」 → 组织最终回答\n\
```\n\
\n\
关键区别：**工具调用由模型自主编排，不再一次定生死**。模型每一步都在问自己：「信息够了吗？不够就调工具，够了就回答。」\n\
\n\
### 1.3 能力对比\n\
\n\
| 能力 | 普通 RAG | Function Calling | **Agentic RAG** |\n\
|---|---|---|---|\n\
| 单步问答 | ✅ | ✅ | ✅ |\n\
| 单步计算 | ❌ | ✅ | ✅ |\n\
| 多步编排 | ❌ | ❌ | ✅ |\n\
| 自主查漏 | ❌ | ❌ | ✅ |\n\
| 结果自查 | ❌ | 部分 | ✅ |\n\
\n\
> 注意：Agentic RAG 不是推倒重来——它是在 Function Calling 基础上加了**决策循环**。工具、算法、注册表全部复用，只多了一个「while 循环」。\n\
\n\
---\n\
\n\
## 二、Agent 决策循环（核心机制）\n\
\n\
### 2.1 循环本质\n\
\n\
Agentic RAG 的引擎是经典的 **ReAct 模式**（Reason + Act）：\n\
\n\
```text\n\
循环直到模型说「可以回答」：\n\
  思考（Reason）：现在缺什么？\n\
  行动（Act）：调工具 or 直接回答\n\
  观察（Observe）：拿到工具结果，更新认知\n\
```\n\
\n\
### 2.2 为什么本地也能跑\n\
\n\
- **决策层**：需要较强推理能力 → DeepSeek API（便宜、解析强）\n\
- **执行层**：计算/检索 → 本地算法库 + 本地 RAG（公式可靠、不花钱）\n\
- **数据层**：规范/表格 → 本地向量库 + SQLite\n\
\n\
**决策花钱但算得快，执行免费且绝对可靠**——这是个人项目最优解。\n\
\n\
---\n\
\n\
## 三、升级实现：DeepSeek API + 本地执行\n\
\n\
### 3.1 工具层（完全复用）\n\
\n\
测量算法库、工具注册表、工具分发函数——全部沿用 Function Calling 版。我本地把它整理成了 `agent_tools.py`，给 `calculators.py` 的 9 个工具定义了完整 Schema：\n\
\n\
```python\n\
# agent_tools.py — 9 个工具的 function calling Schema\n\
TOOL_DEFS = [\n\
    {\n\
        \"type\": \"function\",\n\
        \"function\": {\n\
            \"name\": \"coord_inverse\",\n\
            \"description\": \"坐标反算：由两点坐标计算平距和方位角（度）。测量常用。\",\n\
            \"parameters\": {\n\
                \"type\": \"object\",\n\
                \"properties\": {\n\
                    \"x1\": {\"type\": \"number\", \"description\": \"起点 X 坐标\"},\n\
                    \"y1\": {\"type\": \"number\", \"description\": \"起点 Y 坐标\"},\n\
                    \"x2\": {\"type\": \"number\", \"description\": \"终点 X 坐标\"},\n\
                    \"y2\": {\"type\": \"number\", \"description\": \"终点 Y 坐标\"},\n\
                },\n\
                \"required\": [\"x1\", \"y1\", \"x2\", \"y2\"],\n\
            },\n\
        },\n\
    },\n\
    # coord_forward / angle_convert / foot_point / radius_from_chord_arch\n\
    # arc_3points / polygon_area / traverse_adjust / leveling_adjust …… 依次追加\n\
]\n\
```\n\
\n\
执行入口统一走 `execute_tool(name, args)`——内部按名字分发到 `calculators` 的验证函数，返回统一格式的结果文本：\n\
\n\
```python\n\
def execute_tool(name, args):\n\
    \"\"\"执行工具，返回 (是否成功, 结果文本)\"\"\"\n\
    try:\n\
        if name == \"coord_inverse\":\n\
            r = calc.coord_inverse(args[\"x1\"], args[\"y1\"], args[\"x2\"], args[\"y2\"])\n\
            if r is None:\n\
                return False, \"两点重合，无法反算\"\n\
            d, a, dx, dy = r\n\
            return True, (f\"平距 D={d:.4f} m，方位角 α={a:.4f}°（{calc.dd2dms_str(a)}），\"\n\
                          f\"ΔX={dx:.4f}，ΔY={dy:.4f}\")\n\
        # …… 其余 8 个工具同理\n\
    except Exception as e:\n\
        return False, f\"计算失败: {e}\"\n\
```\n\
\n\
> 注意：`execute_tool` 返回 `(成功与否, 文本)` 二元组——失败信息也回填给模型，让它改参数重试或问用户，而不是静默出错。\n\
\n\
### 3.2 决策层：Agent 循环（`rag.py` 的 `agent_ask`）\n\
\n\
与 Function Calling 的唯一区别：**循环 + 让模型自己决定何时停止**：\n\
\n\
```python\n\
def agent_ask(self, query, k=None):\n\
    \"\"\"Agentic RAG：检索 → LLM 带工具决策 → 执行计算工具 → 汇总回答\"\"\"\n\
    from agent_tools import TOOL_DEFS, execute_tool\n\
    import json as _json\n\
\n\
    client = OpenAI(api_key=DEEPSEEK_KEY, base_url=DEEPSEEK_BASE)\n\
    chunks, metas, dists = self.search(query, k)   # 先检索资料\n\
    prompt = self.build_prompt(query, chunks, metas)\n\
    messages = [\n\
        {\"role\": \"system\", \"content\": SYSTEM_PROMPT + \" 如需计算，调用提供的测量计算工具。\"},\n\
        {\"role\": \"user\", \"content\": prompt},\n\
    ]\n\
    tool_events = []\n\
    max_rounds = 3\n\
\n\
    for _round in range(max_rounds):\n\
        resp = client.chat.completions.create(\n\
            model=DEEPSEEK_MODEL, messages=messages, tools=TOOL_DEFS,\n\
        )\n\
        msg = resp.choices[0].message\n\
        tool_calls = getattr(msg, \"tool_calls\", None)\n\
\n\
        if not tool_calls:            # 没有工具调用 → 最终回答\n\
            return (msg.content or \"\", chunks, metas, tool_events), None\n\
\n\
        # 有工具调用：回填 assistant 消息 + 执行工具 + 回填 tool 结果\n\
        messages.append({\"role\": \"assistant\", \"content\": msg.content or \"\",\n\
                          \"tool_calls\": [{\"id\": tc.id, \"type\": \"function\",\n\
                                          \"function\": tc.function} for tc in tool_calls]})\n\
        for tc in tool_calls:\n\
            fn_name = tc.function.name\n\
            fn_args = _json.loads(tc.function.arguments or \"{}\")\n\
            ok, text = execute_tool(fn_name, fn_args)\n\
            tool_events.append({\"tool\": fn_name, \"args\": fn_args, \"ok\": ok, \"result\": text})\n\
            messages.append({\"role\": \"tool\", \"tool_call_id\": tc.id, \"content\": text})\n\
\n\
        # ← 关键：continue 回到循环，让模型看工具结果再决策下一步\n\
\n\
    # 超出轮数兜底：用最后消息再问一次\n\
    resp = client.chat.completions.create(\n\
        model=DEEPSEEK_MODEL, messages=messages, temperature=TEMPERATURE,\n\
    )\n\
    return (resp.choices[0].message.content or \"\", chunks, metas, tool_events), None\n\
```\n\
\n\
**核心就一行：工具结果回填后回到循环开头**——让模型「看一眼结果再决定下一步」。这就是 Agent 和 Function Calling 的分水岭。\n\
\n\
### 3.3 界面接入（app.py）\n\
\n\
Streamlit 里 DeepSeek 模式直接走 `engine.agent_ask(q, k=k)`，并把 `tool_events` 渲染出来——用户能看到助手「调了什么工具、拿到什么结果」，透明可验算：\n\
\n\
```python\n\
# app.py — DeepSeek 模式：直接走 Agentic RAG（LLM 自主决定是否调用计算工具）\n\
resp, err = engine.agent_ask(q, k=k)\n\
if err:\n\
    st.error(err)\n\
else:\n\
    answer, chunks, metas, tool_events = resp\n\
    # 展示工具调用过程（tool_events）+ 最终回答 + 引用来源\n\
```\n\
\n\
---\n\
\n\
## 四、测量场景的多步流程（升级后的能力）\n\
\n\
### 场景 A：导线平差 + 限差校验（查 + 算 + 结论）\n\
\n\
```text\n\
用户：「把这段导线平差了，看看符不符合一级导线要求」\n\
  ↓ 步骤1  traverse_adjust(观测数据)      → 闭合差 8″，相对 1/144972\n\
  ↓ 步骤2  search_kb(「一级导线 闭合差允许值」) → ±10√n″、1/20000\n\
  ↓ 步骤3  check_limits(结果, 等级)      → 8″ ≤ 20″ ✅，1/144972 ≥ 1/20000 ✅\n\
  ↓ 步骤4  回答：「闭合差合格，平差坐标如下……结论：✅ 成果可用」\n\
```\n\
\n\
**升级前做不到**——旧助手算完就停了，不会去查规范、不会对比。\n\
\n\
### 场景 B：查表 + 计算（数据衔接）\n\
\n\
```text\n\
用户：「K1+120 的设计高程是多少？顺带算下它和地面的填挖值」\n\
  ↓ query_table(设计高程表, K1+120) → 45.350\n\
  ↓ query_table(地面高程表, K1+120) → 100.200\n\
  ↓ fill_cut_calc(45.350, 100.200) → +45.150 异常偏大\n\
  ↓ 自查：|填挖值| > 阈值 → 提示「数据可能有误，请核对」\n\
  ↓ 回答 + 异常警示\n\
```\n\
\n\
### 场景 C：坐标正算 + 反算校验（结果自洽）\n\
\n\
```text\n\
用户：「从 A(500,300) 方位角 45° 距离 100m 求 B」\n\
  ↓ coordinate_forward → B(570.711, 370.711)\n\
  ↓ coordinate_inverse(A, B) → 平距 100.000、方位 45° ✓ 自洽\n\
  ↓ 回答（附校验：「正算结果经反算校验一致」）\n\
```\n\
\n\
> 注意：**正算→反算校验**是测量 Agent 最值得做的自查——算错当场发现，不用等用户验算。这类「业务自检」逻辑比通用 Prompt 约束有效得多。\n\
\n\
### 真实部署效果\n\
\n\
下面是本地 Agentic RAG 助手的三个真实截图（场景 A「导线平差+限差校验」），展示助手自主完成多步决策的全过程：\n\
\n\
#### 1) 助手主界面与示例问\n\
\n\
![助手主界面](images/agentic-rag-angle-convert.png)\n\
\n\
顶部展示 6 个常见测量问题的示例问（坐标反算/角度闭合差/水准限差/弧形调控/全站仪放样/GB50026 等），方便快速点击。向量模型 BAAI/bge-small-zh-v1.5，DeepSeek + 本地 FAISS 混合架构。\n\
\n\
#### 2) 多步决策过程（5 轮工具调用）\n\
\n\
![多步决策过程](images/agentic-rag-traverse-adjust.png)\n\
\n\
用户问「帮我算个闭合导线平差」后，助手自主规划了 5 步：先 4 次 angle_convert 把度分秒转十进制度（1°11′48.0″、190°14′47.0″、59°5′59.0″、78°2′53.0″），再调一次 traverse_adjust 完成 11 个测站的角度闭合差和坐标推算。\n\
\n\
#### 3) 最终结果与精度评定\n\
\n\
![最终结果](images/agentic-rag-traverse-result.png)\n\
\n\
助手一次性给出**角度闭合差（-5.0″，合格）、坐标闭合差（fx=+0.006m, fy=+0.025m, fs=0.025m）、全长 1432.35m、相对闭合差 1/57000（远优于 1/2000 规范要求）、平差后 11 个点坐标、精度评定**——所有数值来自 calculators 算法的真实计算，**结论引自规范条文（通过本地 RAG 检索）**。整个过程不需要用户介入「查规范」「写脚本」「算坐标」，助手自己串联。\n\
\n\
---\n\
\n\
## 五、调优实战：踩过的坑与经验\n\
\n\
### 5.1 DeepSeek 决策的实际表现\n\
\n\
- **多步决策（2~4 步）**：稳定，工具选择正确率高\n\
- **参数抽取**：坐标、角度、边长等数字参数准确；度分秒（「120°15′30″」）能正确转十进制\n\
- **编造参数**：偶发——`required` 校验 + 关键参数回显确认必须保留\n\
- **过度调用**：偶尔连续调同一个工具（拿到结果还调）——靠 `max_rounds` 限制 + Prompt 约束「能回答就停止」\n\
\n\
### 5.2 Schema 描述是调优主线\n\
\n\
实测规律：**解析不准，八成是 description 没写清楚**。有效做法：\n\
\n\
- 参数写清单位：「角度为十进制度（120°15′30″=120.2583）」\n\
- 数组参数写结构：「每项 {点名, 水平角, 边长}」\n\
- 写清边界：「obs 至少 3 项」\n\
\n\
### 5.3 循环兜底\n\
\n\
```text\n\
1. max_rounds 上限（默认 3 轮）——防死循环\n\
2. 工具返回错误 → 回填给模型 → 让它改参数重试或问用户\n\
3. 超轮数 → 用最后消息再问一次，明确提示用户简化问题\n\
```\n\
\n\
### 5.4 成本控制\n\
\n\
- 决策走 DeepSeek（便宜，多步也就几分钱）\n\
- 执行走本地（免费）\n\
- 规范问答仍走本地 RAG（省 API）——只在**需要计算/多步**时才走 Agent 循环\n\
\n\
---\n\
\n\
## 六、防坑清单\n\
\n\
| 坑 | 对策 |\n\
|---|---|\n\
| 模型自己「算」而不调工具 | System Prompt 强制「禁止自行计算」+ 工具结果回填 |\n\
| 编造缺失参数 | required 校验 + 关键参数回显确认 |\n\
| 死循环/过度调用 | max_rounds + 「能回答就停止」约束 |\n\
| 多步中结果被遗忘 | 每步把工具结果完整回填进 messages |\n\
| 单位/格式不一致 | Schema description 写死单位与格式 |\n\
| 异常数值被忽略 | 业务自检（反算校验/阈值检查）写进流程 |\n\
| API 调用失败 | 重试机制 + 降级到本地模型 |\n\
\n\
---\n\
\n\
## 七、小结\n\
\n\
这次升级的本质，是把助手从「问答器」变成了「办事员」：\n\
\n\
- **Function Calling 让助手会算**（单步工具调用）\n\
- **Agentic RAG 让助手会想**（多步自主决策循环）\n\
- **DeepSeek 决策 + 本地执行**，让「想」很聪明、「算」很可靠、成本很低\n\
\n\
对测量场景，Agentic RAG 最有价值的不是复杂推理，而是**把「查资料→算数据→对规范→下结论」串成自动化流程**——平差完自动对照限差、查完表自动算填挖、算完坐标自动反算校验。这些「查+算+检」组合，是普通 RAG 和计算器都做不到的，也是测量 AI 助手真正值钱的地方。\n\
\n\
> 相关文章：本文承接《让 RAG 测量助手会算数据》（Function Calling 基础）与 RAG 系列前几篇；Agent 涉及的测量算法见《测量辅助计算 Python 程序集》《导线计算原理与 Python 实现》。\n\
";
