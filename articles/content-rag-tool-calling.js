// RAG 工具调用文章
ARTICLE_CONTENTS["rag-tool-calling"] = "# 让 RAG 测量助手会算数据：Function Calling 工具调用实战\n\
\n\
> 我的本地 RAG 测量助手（`E:\\Lvmyth\\RAG测量助手`）跑通了三件事：规范问答、文档检索、进阶重排。但测量员真正高频使用的其实是**计算**：坐标反算、导线平差、竖曲线、填挖方——这些是公式固定的确定性运算。最初我在 `tool_dispatch.py` 里用关键词 + 正则来识别计算请求（「含'反算'两个字就走坐标反算」），能跑通简单场景，但遇到「帮我算一下从 A 点到 B 点的平距和方位角」这种绕弯的问法就抓瞎。能不能让 RAG 助手直接「算」？直接问大模型「算一下导线平差」，它会把公式算错、把数据编出来——测量数值错一个数字就是事故。正确的路线是：**让大模型只做「听懂人话、选对工具、填好参数」，把计算交给你自己验证过的测量算法**。本文承接 RAG 系列前几篇，讲解如何用 Function Calling（函数调用）把 RAG 测量助手升级为「会算数据」的助手：工具注册表设计、DeepSeek Function Calling 完整实现、多参数工具的 Schema 与校验、以及「计算 + 规范问答」双引擎混合路由，并附真实项目案例。\n\
\n\
## 一、为什么要让 RAG 助手会算\n\
\n\
### 1.1 问答与计算是两类需求\n\
\n\
| 类别 | 规范问答 | 测量计算 |\n\
|---|---|---|\n\
| 例子 | 「贯通误差允许多少？」 | 「坐标反算 (0,0)(100,100)」 |\n\
| 性质 | 检索 + 总结 | 确定性运算 |\n\
| 正确性 | 语义相关即可 | **数值必须精确** |\n\
| 适合谁来算 | 大模型生成 | 程序算法 |\n\
\n\
### 1.2 为什么不能让大模型直接算\n\
\n\
- LLM 是概率模型，公式推导和数值运算**天生不可靠**——平方、开方、三角函数都可能错\n\
- 测量公式是确定的（坐标正算、平差、曲线要素），完全没必要让 LLM 推理\n\
- 行业规矩：**测量数据必须可验算**，LLM 算的没法验算，算法算的有完整过程\n\
\n\
### 1.3 正确路线\n\
\n\
```text\n\
大模型：听懂意图 → 选择工具 → 抽取参数（结构化 JSON）\n\
你的算法：执行计算（验证过的公式，可打印计算过程）\n\
大模型：把结果组织成人话\n\
```\n\
\n\
关键原则一句话：**公式永远走你的代码，LLM 只当「翻译官」**。\n\
\n\
---\n\
\n\
## 二、我本地助手的现状与痛点\n\
\n\
### 2.1 现在的做法：关键词 + 正则（`tool_dispatch.py`）\n\
\n\
我本地 `scripts/tool_dispatch.py` 的思路是：问答前先检测是不是计算请求，用关键词匹配工具类型、正则提取参数、调用 `calculators.py` 计算：\n\
\n\
```python\n\
# tool_dispatch.py 核心逻辑（简化）\n\
def try_calculate(q):\n\
    q_clean = q.strip()\n\
    if len(q_clean) < 4:\n\
        return None\n\
    handlers = [\n\
        (_match_inverse, _calc_inverse, \"坐标反算\"),\n\
        (_match_forward, _calc_forward, \"坐标正算\"),\n\
        (_match_angle, _calc_angle, \"角度换算\"),\n\
        (_match_arch, _calc_arch, \"弦长拱高求半径\"),\n\
    ]\n\
    for matcher, calc_fn, tool in handlers:\n\
        params = matcher(q_clean)\n\
        if params is not None:\n\
            return calc_fn(tool, params)\n\
    return None\n\
```\n\
\n\
`calculators.py` 里是验证过的算法：`coord_forward`（正算）、`coord_inverse`（反算）、`traverse_adjust`（导线平差）、`leveling_adjust`（水准平差）、`polygon_area`（面积）等。\n\
\n\
### 2.2 这个方案的三个短板\n\
\n\
| 短板 | 例子 |\n\
|------|------|\n\
| **问法呆板** | 只认「反算」「正算」等固定词，绕弯问法就漏 |\n\
| **参数提取脆弱** | 「从 (0,0) 到 (100,100) 求平距」——「求平距」不在关键词表里 |\n\
| **多参数工具没法扩展** | 导线平差十几个测站，正则根本抠不出来 |\n\
\n\
**结论**：关键词方案适合当「快路径」兜底，真正的解法是 Function Calling——让模型来做意图识别和参数抽取（这是模型的强项），正则只管简单的。\n\
\n\
---\n\
\n\
## 三、工具调用（Function Calling）原理\n\
\n\
### 3.1 什么是 Function Calling\n\
\n\
大模型 API 支持的一种机制：你注册一批「工具」（函数名 + 参数 Schema），模型在回答时如果发现需要计算，**不是自己算，而是返回一段结构化调用请求**：\n\
\n\
```json\n\
{\n\
  \"name\": \"coordinate_inverse\",\n\
  \"arguments\": {\"x1\": 0, \"y1\": 0, \"x2\": 100, \"y2\": 100}\n\
}\n\
```\n\
\n\
你的程序收到后执行真实函数，把结果回传给模型，模型再组织成最终回答。\n\
\n\
### 3.2 流程\n\
\n\
```text\n\
用户：「坐标反算 (0,0) (100,100)」\n\
  ↓\n\
① 模型 + 工具列表 → 决定调用 coordinate_inverse，生成参数\n\
  ↓\n\
② 你的程序执行算法 → 返回 {平距: 141.4214, 方位角: 45}\n\
  ↓\n\
③ 结果回填 → 模型组织回答：「平距 141.4214m，方位角 45°00′00″」\n\
```\n\
\n\
### 3.3 为什么比「自然语言解析」强\n\
\n\
- 多参数工具（导线平差十几个测站）靠提示词「从话里抠参数」必然出错\n\
- Function Calling 让模型**结构化输出**——参数抽取是模型的本职，不是附带的文本生成\n\
- 参数缺失时模型会明确不调用或反问，而不是瞎填\n\
\n\
> 注意：Function Calling 不是让模型「会写代码」，而是让模型「会填参数」。计算逻辑始终在你这边。\n\
\n\
---\n\
\n\
## 四、工具注册表设计\n\
\n\
### 4.1 每个工具一份 Schema\n\
\n\
```python\n\
TOOLS = [\n\
    {\n\
        \"type\": \"function\",\n\
        \"function\": {\n\
            \"name\": \"coordinate_inverse\",\n\
            \"description\": \"坐标反算：由两点坐标求平距与方位角\",\n\
            \"parameters\": {\n\
                \"type\": \"object\",\n\
                \"properties\": {\n\
                    \"x1\": {\"type\": \"number\", \"description\": \"起点X坐标(m)\"},\n\
                    \"y1\": {\"type\": \"number\", \"description\": \"起点Y坐标(m)\"},\n\
                    \"x2\": {\"type\": \"number\", \"description\": \"终点X坐标(m)\"},\n\
                    \"y2\": {\"type\": \"number\", \"description\": \"终点Y坐标(m)\"}\n\
                },\n\
                \"required\": [\"x1\", \"y1\", \"x2\", \"y2\"]\n\
            }\n\
        }\n\
    },\n\
    # 导线平差、水准平差、弧上三点…… 依次追加\n\
]\n\
```\n\
\n\
工具名与 `calculators.py` 里的函数一一对应——`coordinate_inverse` 对应 `coord_inverse`，`traverse_adjust` 对应 `traverse_adjust`，这样分发逻辑最简单。\n\
\n\
### 4.2 Schema 的质量决定解析质量\n\
\n\
- **description 写清楚**：参数含义、单位（m/度/%）、取值范围\n\
- **required 列全**：缺了模型才知道要问用户\n\
- **多参数用数组/对象**：导线平差的观测列表用 `array`，模型能结构化抽取\n\
\n\
### 4.3 多参数工具 Schema 示例（导线平差）\n\
\n\
```python\n\
{\n\
    \"name\": \"traverse_adjust\",\n\
    \"description\": \"导线平差：输入起算点、起始方位角与各边观测数据，返回平差后坐标\",\n\
    \"parameters\": {\n\
        \"type\": \"object\",\n\
        \"properties\": {\n\
            \"start\": {\n\
                \"type\": \"object\",\n\
                \"description\": \"起算点坐标\",\n\
                \"properties\": {\"x\": {\"type\": \"number\"}, \"y\": {\"type\": \"number\"}},\n\
                \"required\": [\"x\", \"y\"]\n\
            },\n\
            \"start_azimuth\": {\"type\": \"number\", \"description\": \"起始方位角（度）\"},\n\
            \"obs\": {\n\
                \"type\": \"array\",\n\
                \"description\": \"观测数据，每项一段边\",\n\
                \"items\": {\n\
                    \"type\": \"object\",\n\
                    \"properties\": {\n\
                        \"point\": {\"type\": \"string\", \"description\": \"前视点名\"},\n\
                        \"angle\": {\"type\": \"number\", \"description\": \"水平角（十进制度）\"},\n\
                        \"dist\": {\"type\": \"number\", \"description\": \"边长（m）\"}\n\
                    },\n\
                    \"required\": [\"point\", \"angle\", \"dist\"]\n\
                }\n\
            }\n\
        },\n\
        \"required\": [\"start\", \"start_azimuth\", \"obs\"]\n\
    }\n\
}\n\
```\n\
\n\
---\n\
\n\
## 五、DeepSeek Function Calling 完整实现\n\
\n\
### 5.1 依赖与客户端\n\
\n\
```bash\n\
pip install openai\n\
```\n\
\n\
```python\n\
import json\n\
from openai import OpenAI\n\
\n\
client = OpenAI(api_key=\"你的KEY\", base_url=\"https://api.deepseek.com\")\n\
```\n\
\n\
### 5.2 核心循环\n\
\n\
```python\n\
def ask_with_tools(user_input, history=None):\n\
    messages = list(history or []) + [{\"role\": \"user\", \"content\": user_input}]\n\
\n\
    resp = client.chat.completions.create(\n\
        model=\"deepseek-chat\",\n\
        messages=messages,\n\
        tools=TOOLS,\n\
        tool_choice=\"auto\"\n\
    )\n\
    msg = resp.choices[0].message\n\
\n\
    # 模型要求调用工具\n\
    if msg.tool_calls:\n\
        for tc in msg.tool_calls:\n\
            fn_name = tc.function.name\n\
            args = json.loads(tc.function.arguments)\n\
            result = run_survey_tool(fn_name, args)     # 执行你的算法\n\
            messages.append(msg)\n\
            messages.append({\n\
                \"role\": \"tool\",\n\
                \"tool_call_id\": tc.id,\n\
                \"content\": json.dumps(result, ensure_ascii=False)\n\
            })\n\
        # 结果回填后，模型组织最终回答\n\
        final = client.chat.completions.create(\n\
            model=\"deepseek-chat\", messages=messages, tools=TOOLS\n\
        )\n\
        return final.choices[0].message.content\n\
    return msg.content\n\
```\n\
\n\
### 5.3 工具分发（名字 → 你的函数）\n\
\n\
```python\n\
def run_survey_tool(name, args):\n\
    # 你的测量工具 Python 模块——公式都在这里，验证过的\n\
    import calculators as T   # 我本地 scripts/calculators.py\n\
\n\
    if not hasattr(T, name):\n\
        return {\"error\": f\"未注册工具: {name}\"}\n\
    try:\n\
        fn = getattr(T, name)\n\
        return fn(**args)          # 参数解包，直接调用\n\
    except TypeError as e:\n\
        return {\"error\": f\"参数错误: {e}\", \"need_more_info\": True}\n\
```\n\
\n\
> 注意：`calculators` 就是你的测量算法库——坐标、平差、曲线计算都在里面。工具名与函数名一一对应，Schema 里的 description 可以直接用函数的 docstring 生成，保证描述与实现一致。\n\
\n\
---\n\
\n\
## 六、参数解析与校验（多参数工具的关键）\n\
\n\
### 6.1 角度单位约定\n\
\n\
Schema 里统一「十进制度」，模型抽取时自行换算：\n\
\n\
```text\n\
用户：「A-B 边 120°15′30″」\n\
模型输出：{\"angle\": 120.2583}\n\
```\n\
\n\
换算规则写在 description 里，模型会处理。返回结果时程序再转回度分秒显示（`calculators.dd2dms_str` 已实现）。\n\
\n\
### 6.2 缺失参数反问\n\
\n\
```python\n\
def validate_args(fn_name, args):\n\
    schema = get_schema(fn_name)      # 从 TOOLS 里找\n\
    required = schema[\"function\"][\"parameters\"].get(\"required\", [])\n\
    missing = [r for r in required if r not in args or args[r] in (None, \"\", [])]\n\
    return missing\n\
\n\
# 缺参数时，把提示回传给模型，让它反问用户\n\
missing = validate_args(fn_name, args)\n\
if missing:\n\
    return {\"error\": f\"缺少参数: {missing}，请向用户询问\"}\n\
```\n\
\n\
### 6.3 关键参数回显确认\n\
\n\
起算坐标、起算方位角这类**输错代价大**的参数，解析后回显让用户确认：\n\
\n\
```python\n\
def confirm_critical(fn_name, args):\n\
    if fn_name == 'traverse_adjust':\n\
        return (f\"确认导线起算：起点({args['start']['x']}, {args['start']['y']})，\"\n\
                f\"起始方位角 {args['start_azimuth']}°？回复'确认'开始计算\")\n\
    return None\n\
```\n\
\n\
### 6.4 本地备用（ollama qwen2.5）\n\
\n\
不想联网时本地模型也支持 tools 参数，代码几乎一致：\n\
\n\
```python\n\
resp = requests.post(\"http://localhost:11434/api/chat\", json={\n\
    \"model\": \"qwen2.5:7b\", \"messages\": messages, \"tools\": TOOLS\n\
})\n\
```\n\
\n\
局限：大数组参数（十几站导线）本地模型容易截断——这正是推荐 DeepSeek 做主力解析的原因。\n\
\n\
---\n\
\n\
## 七、双引擎混合路由：完整的测量助手\n\
\n\
```text\n\
用户问题\n\
  ├─ 需要计算？ → Function Calling 引擎（DeepSeek 解析 + calculators 算法）\n\
  └─ 规范/文档问答？ → 向量检索 RAG 引擎（前几篇）\n\
```\n\
\n\
路由判断可以简单规则（含「算/平差/反算/坐标」等词走计算），也可以让模型自己判断（tools + 一个 query 工具）。我本地采用**先快路径后兜底**：先跑 `tool_dispatch.try_calculate`（零成本的关键词匹配），命中直接返回；未命中再走 Function Calling 让模型判断；两者都判定不是计算，才进向量 RAG。\n\
\n\
```text\n\
测量员 AI 知识助手（一个入口）\n\
  ├── 坐标反算/正算\n\
  ├── 导线平差、水准平差\n\
  ├── 竖曲线、曲线要素\n\
  ├── 弧上三点、后方交会\n\
  ├── 横断面填挖、断面计算\n\
  └── 规范条文、博客文章（向量 RAG）\n\
```\n\
\n\
---\n\
\n\
## 八、实战效果（真实案例）\n\
\n\
以本地部署的助手为例：\n\
\n\
```text\n\
用户：坐标反算 (0,0) (100,100)\n\
\n\
助手：\n\
■ 坐标反算  平距 141.4214 m，方位角 45.0000°（45°0'0.0\"）\n\
\n\
计算过程：\n\
- 起点 A (0.0000, 0.0000) → 终点 B (100.0000, 100.0000)\n\
- ΔX = 100.0000  ΔY = 100.0000\n\
- 平距 D = 141.4214 m\n\
- 方位角 α = 45.0000° = 45°0'0.0\"\n\
\n\
⚡ 已自动调用测量程序算法直接计算（未经过 LLM，结果可靠）\n\
```\n\
\n\
三个细节值得坚持：\n\
\n\
1. **标注「未经过 LLM」**——让用户知道结果是算法算的，可信\n\
2. **展示计算过程**——可验算，工程习惯\n\
3. **度分秒转换显示**——符合测量员阅读习惯\n\
\
### 真实部署效果\n\
\
下面是三个本地实测案例（坐标反算 / 坐标正算 / 角度换算），分别展示三种最常用的工具调用效果：\n\
\
#### 1) 坐标反算（A→B 的平距与方位角）\n\
\
![坐标反算](images/tool-calling-coord-inverse.png)\n\
\
#### 2) 坐标正算（已知起点+平距+方位角 → 终点）\n\
\
![坐标正算](images/tool-calling-coord-forward.png)\n\
\
#### 3) 角度换算（度分秒 → 十进制度）\n\
\
![角度换算](images/tool-calling-angle-convert.png)\n\
\
三个截图都显示助手在最后一行标注「已自动调用测量程序算法直接计算（未经过 LLM，结果可靠）」——这是规范，工程化 AI 助手就该这样让用户知道结果来源。\n\
\
---\n\
\n\
## 九、防坑清单\n\
\n\
| 坑 | 对策 |\n\
|---|---|\n\
| 让模型「算」而不是「调工具」 | System Prompt 明确：「涉及计算必须调用工具，禁止自行计算」 |\n\
| 模型编造参数 | required 校验 + 关键参数回显确认 |\n\
| 单位不一致 | Schema 统一单位并写进 description |\n\
| 大数组被截断 | 用 DeepSeek 而非本地小模型；必要时分批让用户确认 |\n\
| 工具名与函数不一致 | 用 docstring 自动生成 description，工具注册表单一来源 |\n\
| 计算结果格式混乱 | 程序返回结构化数据（列表/字典），模型只负责转述 |\n\
| 用户输入不规范 | 模型抽取容错 + 反问机制兜底 |\n\
\n\
---\n\
\n\
## 十、小结\n\
\n\
让 RAG 助手「会算」，本质是给助手**接了手脚**：\n\
\n\
- **理解层**：DeepSeek Function Calling 把自然语言变成结构化工具调用（听懂人话、选对工具、填好参数）\n\
- **执行层**：你自己的测量算法库（验证过的公式、可打印过程、可验算）\n\
- **组织层**：模型把结果翻译成人话，标注「算法计算，结果可靠」\n\
\n\
从我本地助手的演进看，`tool_dispatch.py` 的关键词快路径 + Function Calling 兜底是性价比最高的组合——快路径零成本覆盖常见问法，Function Calling 补齐绕弯问法和多参数工具。一条铁律：**公式永远在你自己手里**。模型负责「想」，算法负责「算」，这个分工让 AI 助手既有大模型的自然语言能力，又有测量程序的计算可靠性——这才是测量行业用 AI 的正确姿势。\n\
\n\
> 相关文章：本文是 RAG 系列的进阶篇，前序为《本地部署RAG测量助手》《Faiss向量检索实战》《RAG 进阶》；工具算法本身见《测量辅助计算 Python 程序集》《导线计算原理与 Python 实现》。\n\
";
