// Faiss 向量检索文章
ARTICLE_CONTENTS["faiss-vector-search"] = "# Faiss 向量检索实战：把测量知识库装进百毫秒\n\
\n\
> 上一篇文章《本地部署RAG测量助手》里，我们搭了一条「文档 → 切片 → 向量化 → 检索 → 生成」的流水线，其中向量检索用的是什么？很多教程直接说「用 ChromaDB」，但 ChromaDB 底层存储和检索的核心逻辑，其实就是一个更轻更快的库——Faiss。Faiss（Facebook AI Similarity Search）是 Meta 开源的向量相似度检索库，支持十亿级向量的快速搜索。本文以测量员的知识库场景为主线：先讲清楚向量检索的原理与 Faiss 的核心概念（索引类型、相似度度量），再给出从零构建「测量规范知识库」的完整可运行代码（embedding → 建索引 → 检索），最后讲索引选择、混合检索和常见坑。学完这一篇，你的 RAG 助手就从「能用」变成「懂为什么」。\n\
\n\
## 一、为什么需要向量检索\n\
\n\
### 1.1 关键词搜索的局限\n\
\n\
传统搜索靠**关键词匹配**：\n\
\n\
```text\n\
提问：「隧道贯通误差允许多少？」\n\
关键词：「贯通」「误差」「允许」\n\
```\n\
\n\
但测量的问法千变万化：「两洞对接偏差多少算合格」「相向开挖允许差多少」——关键词完全不同，传统搜索就抓瞎了。\n\
\n\
### 1.2 向量搜索的思路\n\
\n\
向量搜索把文本变成**语义向量**（embedding），相近意思的文本在向量空间里离得近：\n\
\n\
```text\n\
「隧道贯通误差允许多少」→ [0.12, -0.34, 0.56, ...]\n\
「两开挖面间贯通允许偏差」→ [0.15, -0.31, 0.52, ...]  ← 语义相近，向量相近\n\
「今天天气不错」          → [-0.41, 0.22, 0.08, ...]  ← 语义无关，向量很远\n\
```\n\
\n\
检索时，把问题向量化，在库里找**最邻近**的向量，对应的文本就是最相关的资料。\n\
\n\
> 注意：向量检索是「语义匹配」，不是「字面匹配」。它和关键词搜索（BM25 等）各有优劣，成熟方案是两者混合（见第六章）。\n\
\n\
---\n\
\n\
## 二、Faiss 是什么\n\
\n\
### 2.1 定位\n\
\n\
- **Meta 开源的向量相似度搜索库**，C++ 核心 + Python 接口\n\
- 支持十亿级向量、多种索引结构、GPU 加速\n\
- 在 RAG 里的角色：**存 embedding、查最近邻**\n\
\n\
### 2.2 与 ChromaDB 的对比\n\
\n\
| | Faiss | ChromaDB |\n\
|---|---|---|\n\
| 定位 | 纯检索库 | 完整向量数据库 |\n\
| 安装 | `pip install faiss-cpu` | `pip install chromadb` |\n\
| 持久化 | 自己管索引文件 | 内置自动落盘 |\n\
| 元数据过滤 | 自己维护 ID 映射 | 内置 |\n\
| 性能 | 极快，亿级 | 中小规模够用 |\n\
| 学习成本 | 概念多一点，但透明 | 开箱即用 |\n\
\n\
**一句话**：只想「存向量、查最近邻」→ Faiss（轻、快、可控）；要「元数据过滤 + 自动持久化 + 客户端」→ ChromaDB。对自建知识库，Faiss + 自己管元数据完全够用，还能少装一堆依赖。\n\
\n\
---\n\
\n\
## 三、核心概念\n\
\n\
### 3.1 向量与维度\n\
\n\
- 每段文本 → 一个向量（如 512 维），维度由 embedding 模型决定\n\
- 所有向量必须**同维度**，否则索引报错\n\
\n\
| 模型 | 维度 | 特点 |\n\
|------|------|------|\n\
| BAAI/bge-small-zh-v1.5 | 512 | 中文效果好，体积小 |\n\
| BAAI/bge-large-zh-v1.5 | 1024 | 更准，更重 |\n\
| nomic-embed-text（Ollama 本地） | 768 | 完全离线 |\n\
| text-embedding-3-small（OpenAI） | 1536 | 需联网 |\n\
\n\
### 3.2 相似度度量\n\
\n\
| 度量 | Faiss 常量 | 说明 |\n\
|------|-----------|------|\n\
| 欧氏距离 L2 | METRIC_L2 | 越小越相似（默认） |\n\
| 内积 IP | METRIC_INNER_PRODUCT | 越大越相似 |\n\
| 余弦相似度 | 归一化后用 IP | **最常用**：向量归一化后，内积 = 余弦相似度 |\n\
\n\
```python\n\
faiss.normalize_L2(vecs)   # 归一化（单位向量）\n\
# 之后用 IndexFlatIP，search 返回的分数即余弦相似度（越大越相关）\n\
```\n\
\n\
> 注意：用余弦相似度务必先归一化，否则内积受向量长度影响，结果不可靠。\n\
\n\
### 3.3 索引类型\n\
\n\
| 索引 | 原理 | 速度 | 精度 | 适用 |\n\
|------|------|------|------|------|\n\
| **IndexFlat** | 暴力全量计算 | 慢（但向量少时无所谓） | **100%** | 万级以下，最常用 |\n\
| **IndexIVF** | 先聚类再就近搜 | 快 | 高（召回略降） | 十万~百万级 |\n\
| **IndexHNSW** | 图结构跳转 | 很快 | 高 | 十万级以上 |\n\
| **IndexPQ** | 向量压缩 | 最快 | 中 | 内存紧张时 |\n\
\n\
**选择建议**：个人知识库（几千~几万片段）用 **IndexFlat** 就够了——绝对精确、零训练、代码最简单。数据量大了再换 IVF/HNSW。\n\
\n\
---\n\
\n\
## 四、实战：构建测量规范知识库\n\
\n\
### 4.1 安装\n\
\n\
```bash\n\
pip install faiss-cpu sentence-transformers\n\
```\n\
\n\
> 说明：faiss-cpu 和 faiss-gpu 不能共存，先装 CPU 版即可。sentence-transformers 负责本地 embedding（可离线）。如果不想装它，也可以用 Ollama 的 nomic-embed-text（见 4.5 备用方案）。\n\
\n\
### 4.2 准备语料\n\
\n\
把测量规范、技术文章整理成片段列表：\n\
\n\
```python\n\
texts = [\n\
    \"四等水准测量：视线长度不大于100m，前后视距差不超过3m，任一测站上前后视距差累积不超过10m。\",\n\
    \"四等导线水平角观测：DJ2 仪器测回数 9 个测回，半测回归零差不大于 8 秒。\",\n\
    \"隧道横向贯通误差允许值：两开挖面间长度小于 4km 时，贯通面横向中误差不超过 100mm。\",\n\
    \"隧道高程贯通误差允许值：贯通面高程中误差不超过 50mm。\",\n\
    \"全站仪测距边应加入气象改正，温度每变化 1 摄氏度，距离改正约为 1ppm。\",\n\
    # ... 更多条文\n\
]\n\
```\n\
\n\
> 注意：切分粒度影响检索效果——按「规范条文/文章段落」切，比按固定 512 字切更符合语义完整。重叠切分（如 100 字重叠）可避免关键句被截断。\n\
\n\
### 4.3 向量化 + 建索引 + 保存\n\
\n\
```python\n\
import faiss\n\
import numpy as np\n\
import json\n\
\n\
from sentence_transformers import SentenceTransformer\n\
\n\
# 1. 加载中文 embedding 模型（首次运行会下载，之后可离线）\n\
model = SentenceTransformer('BAAI/bge-small-zh-v1.5')\n\
\n\
# 2. 文本 → 向量，归一化（为余弦相似度做准备）\n\
vecs = model.encode(texts, normalize_embeddings=True)\n\
vecs = np.array(vecs).astype('float32')   # Faiss 要求 float32\n\
d = vecs.shape[1]                          # 维度，如 512\n\
\n\
# 3. 建索引：ID 映射 + 内积（归一化后 = 余弦）\n\
index = faiss.IndexIDMap(faiss.IndexFlatIP(d))\n\
index.add_with_ids(vecs, np.arange(len(texts)))\n\
\n\
# 4. 保存索引 + 元数据（ID → 原文）\n\
faiss.write_index(index, 'survey_kb.index')\n\
with open('survey_kb_meta.json', 'w', encoding='utf-8') as f:\n\
    json.dump(texts, f, ensure_ascii=False)\n\
\n\
print(f'已建索引：{index.ntotal} 个片段，维度 {d}')\n\
```\n\
\n\
### 4.4 检索\n\
\n\
```python\n\
# 加载索引与元数据\n\
index = faiss.read_index('survey_kb.index')\n\
with open('survey_kb_meta.json', 'r', encoding='utf-8') as f:\n\
    texts = json.load(f)\n\
\n\
def search(query, k=3):\n\
    qv = model.encode([query], normalize_embeddings=True)\n\
    qv = np.array(qv).astype('float32')\n\
    scores, ids = index.search(qv, k)\n\
    results = []\n\
    for i in range(k):\n\
        idx = int(ids[0][i])\n\
        results.append((float(scores[0][i]), texts[idx]))\n\
    return results\n\
\n\
# 用\n\
for score, text in search('两洞相向开挖允许偏差多少', k=2):\n\
    print(f'相似度 {score:.4f}：{text}')\n\
```\n\
\n\
运行结果示意：\n\
\n\
```text\n\
相似度 0.8341：隧道横向贯通误差允许值：两开挖面间长度小于 4km 时...\n\
相似度 0.7216：隧道高程贯通误差允许值：贯通面高程中误差不超过 50mm。\n\
```\n\
\n\
「两洞相向开挖」这种说法原文里没有，但语义匹配到了「贯通误差」条文——这就是向量检索的价值。\n\
\n\
### 4.5 备用方案：Ollama 本地 embedding（不装 sentence-transformers）\n\
\n\
```bash\n\
ollama pull nomic-embed-text\n\
```\n\
\n\
```python\n\
import json, requests\n\
import faiss\n\
import numpy as np\n\
\n\
def embed_ollama(texts):\n\
    url = 'http://localhost:11434/api/embed'\n\
    r = requests.post(url, json={'model': 'nomic-embed-text', 'input': texts})\n\
    return np.array(r.json()['embeddings'], dtype='float32')\n\
\n\
vecs = embed_ollama(texts)\n\
faiss.normalize_L2(vecs)   # Ollama 返回未归一化，需手动归一化\n\
# 之后建索引同上\n\
```\n\
\n\
---\n\
\n\
## 五、进阶：更大规模与更高性能\n\
\n\
### 5.1 IVF（聚类加速）\n\
\n\
十万级以上向量时，暴力搜索开始吃力，用 IVF：\n\
\n\
```python\n\
nlist = 50                        # 聚类数量\n\
quantizer = faiss.IndexFlatIP(d)  # 聚类用平铺索引\n\
index = faiss.IndexIVFFlat(quantizer, d, nlist, faiss.METRIC_INNER_PRODUCT)\n\
index.train(vecs)                 # ⚠️ IVF 必须先 train 再 add\n\
index.add(vecs)\n\
index.nprobe = 5                  # 查询时探测的聚类数（越大越准越慢）\n\
```\n\
\n\
- `nlist`：聚类数，一般取 √N（N 为向量总数）\n\
- `nprobe`：召回率与速度的旋钮，从 nlist/10 起步调\n\
\n\
### 5.2 HNSW（图索引）\n\
\n\
```python\n\
index = faiss.IndexHNSWFlat(d, 32)   # 32 为每个节点的邻居数\n\
index.hnsw.efSearch = 64             # 搜索深度，越大越准越慢\n\
index.add(vecs)\n\
```\n\
\n\
HNSW 无需训练，构建即用，速度和精度平衡好。\n\
\n\
### 5.3 归一化时机\n\
\n\
- `normalize_embeddings=True`（sentence-transformers）或手动 `faiss.normalize_L2(vecs)`，**二选一，别重复**\n\
- 查询向量也要同样归一化\n\
- 建库时归一化过，查询时忘了归一化 → 分数全乱\n\
\n\
---\n\
\n\
## 六、与你的 RAG 助手结合：混合检索\n\
\n\
纯向量检索对「精确数字、规范编号」类问题（「四等水准视线多长？」）不如关键词精确。成熟方案是**混合检索 + 重排序**：\n\
\n\
```text\n\
提问\n\
 ├─ 向量检索（语义）→ 候选片段 A、B、C\n\
 ├─ BM25 关键词检索 → 候选片段 B、D、E\n\
 └─ 合并去重 → 重排序（Rerank）→ 取 Top-K 喂给 LLM\n\
```\n\
\n\
BM25 轻量实现（不需要 ES）：\n\
\n\
```python\n\
from rank_bm25 import BM25Okapi\n\
\n\
tokenized = [list(t) for t in texts]      # 中文按字切分即可\n\
bm25 = BM25Okapi(tokenized)\n\
\n\
def hybrid_search(query, k=3):\n\
    # 向量分\n\
    vec_results = search(query, k=5)\n\
    # 关键词分\n\
    bm25_scores = bm25.get_scores(list(query))\n\
    # 简单融合：分数归一化后加权相加\n\
    ...\n\
```\n\
\n\
> 注意：混合检索的融合可以简单（归一化加权求和），也可以上 Rerank 模型（如 bge-reranker）精排。对测量知识库这种「专业术语 + 规范编号」场景，混合检索提升明显，值得加。\n\
\n\
---\n\
\n\
## 七、常见问题与避坑\n\
\n\
| 问题 | 原因与解决 |\n\
|------|-----------|\n\
| `pip install faiss` 报错 | 包名是 `faiss-cpu`/`faiss-gpu`，不是 `faiss` |\n\
| 维度不匹配报错 | 索引维度 d 必须等于向量维度；不同模型不要混用 |\n\
| IVF 索引 `add` 报错「not trained」 | IVF 必须先 `index.train(vecs)` 再 add |\n\
| 检索结果相似度全一样 | 忘了归一化，或查询向量没归一化 |\n\
| 中文效果差 | 用中文模型（bge 系列），不要用英文模型 |\n\
| 结果总返回同一个片段 | 语料重复或切分太粗，检查片段是否高度相似 |\n\
| 索引文件很大 | 换 PQ 压缩索引，或精简 embedding 模型 |\n\
\n\
---\n\
\n\
## 八、小结\n\
\n\
Faiss 本身不复杂，核心就三件事：\n\
\n\
1. **向量**：embedding 模型把文本变向量（注意维度和归一化）\n\
2. **索引**：数据量小用 IndexFlat，大了换 IVF/HNSW（注意 train 与参数）\n\
3. **检索**：归一化 + 内积 = 余弦相似度，Top-K 取结果\n\
\n\
再往外走一步：向量检索 + BM25 混合 + 重排序，就是生产级 RAG 的检索骨架。把它接进你的测量助手，规范问答就从「碰运气」变成「按语义命中」。\n\
\n\
> 相关文章：本文是《本地部署RAG测量助手：把规范和博客变成私人AI知识库》的进阶篇；向量检索的数学基础（距离、相似度）可参考《误差理论与精度评定》《坐标转换原理》中对坐标与变换的讨论。\n\
";
