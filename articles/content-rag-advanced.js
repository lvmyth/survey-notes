// RAG 进阶文章
ARTICLE_CONTENTS["rag-advanced"] = "# RAG 进阶：从「能问答」到「答得准」\n\
\n\
> 基础 RAG 搭起来很容易：文档切一切、向量化、检索、丢给大模型，一套流程半小时跑通。我的《本地部署RAG测量助手》就是这么干出来的——但用起来就发现各种问题：问「隧道贯通误差」答非所问、规范编号的数字答错、明明库里有的内容却答「不知道」，甚至一本正经地编造条文。这些问题的根源，分别出在检索（召回不准、排序不对）和生成（上下文利用不好、模型幻觉）两个环节。本文是《本地部署RAG测量助手》与《Faiss向量检索实战》的进阶篇，结合我本地助手的真实实现，系统讲解 RAG 的三大进阶方向：**检索质量提升**（分块策略、混合检索、查询改写、重排序）、**生成质量提升**（Prompt 工程、多轮对话、上下文管理）、**效果评估**（检索指标、生成指标、RAGAS），并给出测量知识库的完整进阶代码与评估脚本。\n\
\n\
## 一、先看看我本地助手的「症状」\n\
\n\
我本地 RAG 助手（`E:\\Lvmyth\\RAG测量助手`）基础链路是这样的：\n\
\n\
```text\n\
文档 → 按段落切分（500字+80重叠）→ bge-small-zh-v1.5 向量化 → FAISS 索引\n\
提问 → 向量化 → 检索 Top-K → 拼进 Prompt → Ollama/DeepSeek 生成\n\
```\n\
\n\
跑通之后，最典型的三个问题：\n\
\n\
| 问题 | 表现 | 根源 |\n\
|------|------|------|\n\
| **检索不准** | 问「贯通的允许偏差」返回的是别的段落 | 语义向量没抓住关键信息 |\n\
| **召回不全** | 明明库里有相关条文，Top-K 里却没有 | 单一路径检索漏掉关键词命中 |\n\
| **生成幻觉** | 编造不存在的规范数值 | 上下文冲突、模型「自信」生成 |\n\
\n\
进阶的目标就是逐个击破：**分块与混合检索解决召回，重排序解决排序，Prompt 与评估约束生成**。\n\
\n\
> 注意：进阶的前提是先跑通基础链路——连基础 RAG 都还没搭好的话，建议先看本系列前两篇。\n\
\n\
---\n\
\n\
## 二、检索质量提升\n\
\n\
### 2.1 分块策略（被低估的第一环）\n\
\n\
分块是 RAG 最容易忽视却影响最大的环节。我最初是按固定 500 字硬切的，后来改成**按段落优先 + 重叠**：\n\
\n\
- **按语义单元切分**：规范按「条文」、文章按「段落」，而不是机械按 512 字切\n\
- **重叠切分**：相邻块重叠 50~100 字，防止关键句被拦腰截断（我用的 80 字重叠）\n\
- **保留标题**：切分时把章节标题带到块里，检索时模型能理解上下文\n\
- **块的大小权衡**：块太小（<100 字）语义单薄，块太大（>800 字）检索粒度粗、token 浪费——500 字是个不错的起点\n\
\n\
```python\n\
# 简单重叠切分（字符级，中文够用）\n\
def split_text(text, chunk=400, overlap=100):\n\
    chunks = []\n\
    i = 0\n\
    while i < len(text):\n\
        chunks.append(text[i:i + chunk])\n\
        i += chunk - overlap\n\
    return chunks\n\
```\n\
\n\
我本地 `build_index.py` 里就是这么干的——先按空行分段落，超长段落内部再滑动切分，段落间带重叠拼接。实测对规范条文类内容，召回明显比固定切分稳。\n\
\n\
### 2.2 混合检索（BM25 + 向量）\n\
\n\
向量检索擅长「语义」，BM25 擅长「关键词精确匹配」——测量规范里大量「四等」「100mm」「DJ2」这类数字和代号，恰好是 BM25 的强项。两者互补：\n\
\n\
```python\n\
from rank_bm25 import BM25Okapi\n\
\n\
def hybrid_search(query, texts, vec_results, k=3, alpha=0.5):\n\
    \"\"\"alpha=1 纯向量；alpha=0 纯 BM25\"\"\"\n\
    # BM25 打分\n\
    tokenized = [list(t) for t in texts]      # 中文按字切分\n\
    bm25 = BM25Okapi(tokenized)\n\
    bm_scores = bm25.get_scores(list(query))\n\
\n\
    # 向量分数归一化（假设 vec_results 是 (id, score) 列表）\n\
    vec_scores = dict(vec_results)\n\
    max_v = max(vec_scores.values()) if vec_scores else 1\n\
    max_b = max(bm_scores) if len(bm_scores) else 1\n\
\n\
    fused = []\n\
    for i in range(len(texts)):\n\
        v = vec_scores.get(i, 0) / max_v\n\
        b = bm_scores[i] / max_b\n\
        fused.append((i, alpha * v + (1 - alpha) * b))\n\
    fused.sort(key=lambda x: -x[1])\n\
    return fused[:k]\n\
```\n\
\n\
> 注意：融合的 alpha 需要调——对规范问答这类「数字精确」场景，BM25 权重可以给高些（alpha≈0.3~0.4）；对「概念解释」类场景，向量权重高些。没有万能参数，用评估数据调（见第四章）。\n\
\n\
### 2.3 查询改写（让问题更利于检索）\n\
\n\
用户的原始问法常常不利于检索，改写后召回更稳：\n\
\n\
- **多查询扩展**：一个问题拆成多个角度同时检索，合并结果\n\
- **HyDE（假文档）**：先用 LLM 生成一个「假设答案」，用假答案去检索，再返回真结果\n\
\n\
```python\n\
# 多查询示例（用 LLM 生成不同问法）\n\
queries = [\n\
    \"隧道贯通误差允许值是多少\",\n\
    \"两相向开挖的对接允许偏差\",\n\
    \"贯通面横向中误差限值\",\n\
]\n\
# 分别检索后合并 Top-K，去重\n\
```\n\
\n\
### 2.4 重排序（Rerank）\n\
\n\
检索阶段拿到 Top-K（如 10 个候选），用**重排序模型**精排后取 Top-3 喂给 LLM——这是提升效果最立竿见影的一步：\n\
\n\
```python\n\
from sentence_transformers import CrossEncoder\n\
\n\
# 交叉编码器：把「问题+片段」一起编码直接打分（比双塔更准，但慢）\n\
reranker = CrossEncoder('BAAI/bge-reranker-base')\n\
\n\
def rerank(query, candidates, k=3):\n\
    pairs = [(query, text) for text in candidates]\n\
    scores = reranker.predict(pairs)\n\
    ranked = sorted(zip(scores, candidates), key=lambda x: -x[0])\n\
    return [t for _, t in ranked[:k]]\n\
```\n\
\n\
> 注意：Rerank 是「精排」，前面检索是「粗排」——流程是 向量/BM25 召回 10~20 条 → Rerank 精排取 3~5 条。检索阶段不要直接只取 3 条，给 Rerank 留出余地。\n\
\n\
---\n\
\n\
## 三、生成质量提升\n\
\n\
### 3.1 Prompt 工程：约束「照着说，别瞎编」\n\
\n\
同一个检索结果，Prompt 不同，输出质量天差地别。我本地助手的 `build_prompt` 已经带了基础约束（只依据资料、不带 HTML 标记），进阶版可以更严：\n\
\n\
```python\n\
prompt = f\"\"\"你是测量规范问答助手。请基于【资料】回答问题。\n\
\n\
要求：\n\
1. 只使用【资料】中的信息作答，资料没有的内容回答\"资料中未找到\"；\n\
2. 涉及数值、等级、仪器型号时，必须与【资料】完全一致，不得推测；\n\
3. 回答末尾标注信息来源片段编号，如【来源：片段3】。\n\
\n\
【资料】\n\
{context}\n\
\n\
【问题】\n\
{question}\n\
\"\"\"\n\
```\n\
\n\
三个关键约束：\n\
- **限制范围**：只依据资料，防止模型自由发挥\n\
- **数值约束**：规范问答最怕数字被「圆整」，明确要求一字不差\n\
- **来源标注**：既方便核验，也倒逼模型引用资料\n\
\n\
### 3.2 多轮对话：历史管理与压缩\n\
\n\
多轮问答时历史会膨胀，且新问题常依赖上文：\n\
\n\
- 携带最近 N 轮历史（控制 token）\n\
- 提问缺主语时（如「那高程的呢？」），用 LLM 把问题**补全为独立问句**再检索\n\
- 历史太长用「摘要压缩」：把旧对话总结成一段话\n\
\n\
```python\n\
# 问题补全（把多轮问题转为独立问题，再检索）\n\
def rewrite_question(history, new_question):\n\
    # 用 LLM：给定历史，把 new_question 改写成可独立检索的问句\n\
    ...\n\
```\n\
\n\
### 3.3 上下文管理\n\
\n\
- 检索片段按相关度排序拼入 Prompt，最相关放最前\n\
- 片段超长截断，控制总 token（一般资料部分不超过模型上下文的一半）\n\
- 无关片段宁可少给——噪声片段会误导生成\n\
\n\
---\n\
\n\
## 四、效果评估（不做评估等于盲调）\n\
\n\
进阶 RAG 必须**量化**，否则不知道改了有没有用。\n\
\n\
### 4.1 检索评估指标\n\
\n\
准备一组「问题 → 应该命中的片段」标注数据：\n\
\n\
| 指标 | 含义 | 公式 |\n\
|------|------|------|\n\
| **Recall@K** | Top-K 里命中相关片段的比例 | 命中数 / 相关总数 |\n\
| **Precision@K** | Top-K 里相关片段占比 | 命中数 / K |\n\
| **MRR** | 第一个相关片段的位置倒数 | 1/rank₁ |\n\
| **NDCG** | 排序质量（相关度加权） | 位置越靠前分越高 |\n\
\n\
```python\n\
def recall_at_k(gt_ids, retrieved_ids, k):\n\
    \"\"\"gt_ids：相关片段真实 ID 集合；retrieved_ids：检索返回 ID 列表\"\"\"\n\
    hit = len(set(gt_ids) & set(retrieved_ids[:k]))\n\
    return hit / len(gt_ids) if gt_ids else 0\n\
\n\
def mrr(gt_ids, retrieved_ids):\n\
    for rank, rid in enumerate(retrieved_ids, 1):\n\
        if rid in gt_ids:\n\
            return 1 / rank\n\
    return 0\n\
```\n\
\n\
### 4.2 生成评估\n\
\n\
- **忠实度（Faithfulness）**：回答是否都能在资料里找到依据（有没有编造）\n\
- **相关性（Relevance）**：回答是否正面回答了问题\n\
- 人工评估最准但累；RAGAS 等框架用 LLM 当裁判自动打分\n\
\n\
### 4.3 RAGAS 简介\n\
\n\
```bash\n\
pip install ragas\n\
```\n\
\n\
```python\n\
from ragas import evaluate\n\
from ragas.metrics import faithfulness, answer_relevancy, context_precision\n\
\n\
# 准备数据集（question, answer, contexts, ground_truth）\n\
result = evaluate(dataset, metrics=[faithfulness, answer_relevancy, context_precision])\n\
print(result)\n\
```\n\
\n\
> 注意：评估要有**基线**——改之前跑一遍记录指标，改完再跑一遍对比。没有基线，改了什么效果都不知道。\n\
\n\
---\n\
\n\
## 五、实战：把进阶装进我的测量助手\n\
\n\
完整进阶流程（检索层 + 生成层 + 评估层），直接对接我本地 `scripts/rag.py` 的数据：\n\
\n\
```python\n\
import faiss, numpy as np, json\n\
from sentence_transformers import SentenceTransformer, CrossEncoder\n\
from rank_bm25 import BM25Okapi\n\
\n\
# ===== 准备（沿用前两篇文章的索引）=====\n\
model = SentenceTransformer('BAAI/bge-small-zh-v1.5')   # 向量\n\
reranker = CrossEncoder('BAAI/bge-reranker-base')        # 重排序\n\
index = faiss.read_index('survey_kb.index')\n\
texts = json.load(open('survey_kb_meta.json', encoding='utf-8'))\n\
bm25 = BM25Okapi([list(t) for t in texts])\n\
\n\
# ===== 检索：混合召回 → Rerank 精排 =====\n\
def retrieve(query, k_retrieve=10, k_final=3):\n\
    # 1. 向量召回\n\
    qv = np.array(model.encode([query], normalize_embeddings=True), dtype='float32')\n\
    vec_scores, vec_ids = index.search(qv, k_retrieve)\n\
    vec_hits = {int(ids): float(sc) for ids, sc in zip(vec_ids[0], vec_scores[0])}\n\
\n\
    # 2. BM25 召回\n\
    bm_scores = bm25.get_scores(list(query))\n\
    bm_rank = sorted(range(len(texts)), key=lambda i: -bm_scores[i])[:k_retrieve]\n\
\n\
    # 3. 合并候选（向量 Top + BM25 Top）\n\
    candidates = {}\n\
    for i in bm_rank:\n\
        candidates[i] = texts[i]\n\
    for i in vec_hits:\n\
        candidates[i] = texts[i]\n\
\n\
    # 4. Rerank 精排\n\
    pairs = [(query, candidates[i]) for i in candidates]\n\
    scores = reranker.predict(pairs)\n\
    ranked = sorted(zip(candidates.keys(), scores), key=lambda x: -x[1])\n\
    return [(i, texts[i]) for i, _ in ranked[:k_final]]\n\
\n\
# ===== 生成 =====\n\
def ask(question, llm_func):\n\
    hits = retrieve(question)\n\
    context = '\\n\\n'.join(f'【片段{i}】{t}' for i, t in hits)\n\
    prompt = f'请基于以下资料回答问题，数值必须与资料一致，资料没有的答\"未找到\"。\\n\\n{context}\\n\\n问题：{question}'\n\
    return llm_func(prompt), hits   # 返回回答 + 引用来源\n\
\n\
# ===== 评估：对比 纯向量 vs 混合+Rerank =====\n\
def evaluate_retrieval(qa_pairs, method, k=5):\n\
    \"\"\"qa_pairs: [(question, [gt_ids])]\"\"\"\n\
    total_r = total_mrr = 0\n\
    for q, gt in qa_pairs:\n\
        if method == 'vector':\n\
            qv = np.array(model.encode([q], normalize_embeddings=True), dtype='float32')\n\
            _, ids = index.search(qv, k)\n\
            ret = ids[0].tolist()\n\
        else:\n\
            ret = [i for i, _ in retrieve(q, k_retrieve=10, k_final=k)]\n\
        total_r += recall_at_k(gt, ret, k)\n\
        total_mrr += mrr(gt, ret)\n\
    n = len(qa_pairs)\n\
    return total_r / n, total_mrr / n\n\
\n\
r_v, m_v = evaluate_retrieval(test_set, 'vector')\n\
r_h, m_h = evaluate_retrieval(test_set, 'hybrid')\n\
print(f'纯向量:      Recall@{5}={r_v:.3f}  MRR={m_v:.3f}')\n\
print(f'混合+Rerank: Recall@{5}={r_h:.3f}  MRR={m_h:.3f}')\n\
```\n\
\n\
运行结果示意（测量知识库实测规律）：\n\
\n\
```text\n\
纯向量:        Recall@5=0.620  MRR=0.541\n\
混合+Rerank:   Recall@5=0.760  MRR=0.718\n\
```\n\
\n\
混合检索 + 重排序通常能把 Recall@K 提升 10~20 个百分点——尤其是包含数字、代号、规范编号的测量问题。\n\
\n\
---\n\
\n\
## 六、常见问题与避坑\n\
\n\
| 问题 | 原因与解决 |\n\
|------|-----------|\n\
| 检索到的片段相关但不含答案 | 分块切坏了——关键句被截断；改用按条文/段落切分 + 重叠 |\n\
| 数字答案总错 | BM25 权重太低；Rerank 时数值相关词应加权 |\n\
| Rerank 后反而更差 | Rerank 模型与领域不匹配，换 bge-reranker-base/v2-m3 或加领域微调 |\n\
| 多轮对话答非所问 | 没做问题补全；把「那高程的呢」改写为完整问题再检索 |\n\
| 评估分数高但实际不好用 | 评估集太简单或与真实提问分布不符；收集真实日志标注 |\n\
| 上下文太长被截断 | 压缩片段、只保留 Rerank 后的 Top-3，控制 token |\n\
| 幻觉依旧 | 约束 Prompt 强制引用来源；对数值类问题可加「数字核对」二次校验 |\n\
\n\
---\n\
\n\
## 七、小结\n\
\n\
RAG 进阶的核心是一条评估驱动的优化循环：\n\
\n\
```text\n\
发现问题（检索不准/召回不全/生成幻觉）\n\
    ↓\n\
对症下药（分块/混合检索/查询改写/Rerank/Prompt/多轮）\n\
    ↓\n\
量化评估（Recall@K、MRR、忠实度）\n\
    ↓\n\
对比基线 → 再调整\n\
```\n\
\n\
三个最值得先做的改进，性价比排序：**① 混合检索（BM25+向量）② 重排序（Rerank）③ 按语义分块**。这三步做对，你的测量知识库问答就能从「能答」变成「答得准」。\n\
\n\
> 相关文章：本文承接《本地部署RAG测量助手》《Faiss向量检索实战》；评估中的误差与指标概念可参考《误差理论与精度评定》。\n\
";
