"""轻量语义相似度 — 字符 n-gram TF-IDF + 余弦相似度

无需外部 embedding 模型，基于 numpy 实现。
对中英文混合文本均有效：字符级 n-gram 天然适配无空格分词的中文。
"""

import re
from collections import Counter

import numpy as np

# n-gram 范围
_NGRAM_RANGE = (2, 3)
# 最大特征数（防止维度爆炸）
_MAX_FEATURES = 2048
# 最小文档频率（低于此值的 n-gram 视为噪声）
_MIN_DF = 1


def _extract_ngrams(text: str) -> list[str]:
    """提取字符 n-gram（过滤空白和标点）"""
    text = re.sub(r'[\s\W]+', '', text.lower())
    ngrams = []
    for n in range(_NGRAM_RANGE[0], _NGRAM_RANGE[1] + 1):
        for i in range(len(text) - n + 1):
            ngrams.append(text[i:i + n])
    return ngrams


class SemanticIndex:
    """增量式语义索引：维护文档集合的 TF-IDF 向量，支持余弦相似度查询"""

    def __init__(self, max_features: int = _MAX_FEATURES):
        self._max_features = max_features
        self._vocab: dict[str, int] = {}  # ngram → feature index
        self._idf: np.ndarray | None = None
        self._doc_vectors: np.ndarray | None = None  # (n_docs, n_features)
        self._doc_ids: list[str] = []
        self._doc_id_to_row: dict[str, int] = {}
        self._dirty = True
        self._raw_docs: dict[str, str] = {}  # doc_id → original text

    def add(self, doc_id: str, text: str):
        """添加或更新文档"""
        self._raw_docs[doc_id] = text
        if doc_id not in self._doc_id_to_row:
            self._doc_ids.append(doc_id)
            self._doc_id_to_row[doc_id] = len(self._doc_ids) - 1
        self._dirty = True

    def remove(self, doc_id: str):
        """移除文档"""
        self._raw_docs.pop(doc_id, None)
        self._dirty = True

    def _rebuild(self):
        """重建 TF-IDF 矩阵（文档变更时调用）"""
        if not self._dirty:
            return

        doc_ids = [d for d in self._doc_ids if d in self._raw_docs]
        self._doc_ids = doc_ids
        self._doc_id_to_row = {d: i for i, d in enumerate(doc_ids)}

        if not doc_ids:
            self._doc_vectors = None
            self._idf = None
            self._dirty = False
            return

        # 统计 n-gram 文档频率
        doc_ngrams: list[Counter] = []
        df: Counter = Counter()
        for doc_id in doc_ids:
            ngrams = _extract_ngrams(self._raw_docs[doc_id])
            c = Counter(ngrams)
            doc_ngrams.append(c)
            df.update(c.keys())

        # 构建词汇表（按文档频率排序，取 top max_features）
        candidates = [(ng, freq) for ng, freq in df.items() if freq >= _MIN_DF]
        candidates.sort(key=lambda x: -x[1])
        vocab_list = [ng for ng, _ in candidates[:self._max_features]]
        self._vocab = {ng: i for i, ng in enumerate(vocab_list)}
        n_features = len(self._vocab)

        if n_features == 0:
            self._doc_vectors = None
            self._idf = None
            self._dirty = False
            return

        # IDF
        n_docs = len(doc_ids)
        idf = np.zeros(n_features, dtype=np.float32)
        for ng, idx in self._vocab.items():
            idf[idx] = np.log((1 + n_docs) / (1 + df[ng])) + 1.0
        self._idf = idf

        # TF-IDF 矩阵
        matrix = np.zeros((n_docs, n_features), dtype=np.float32)
        for row, c in enumerate(doc_ngrams):
            for ng, count in c.items():
                idx = self._vocab.get(ng)
                if idx is not None:
                    matrix[row, idx] = count
            # L2 归一化
            norm = np.linalg.norm(matrix[row])
            if norm > 0:
                matrix[row] /= norm

        self._doc_vectors = matrix
        self._dirty = False

    def _embed(self, text: str) -> np.ndarray | None:
        """将查询文本嵌入到 TF-IDF 向量空间"""
        if self._idf is None or not self._vocab:
            return None
        ngrams = _extract_ngrams(text)
        c = Counter(ngrams)
        vec = np.zeros(len(self._vocab), dtype=np.float32)
        for ng, count in c.items():
            idx = self._vocab.get(ng)
            if idx is not None:
                vec[idx] = count * self._idf[idx]
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec /= norm
        return vec

    def query(self, text: str, top_k: int = 10) -> list[tuple[str, float]]:
        """查询最相似文档，返回 [(doc_id, similarity), ...]"""
        self._rebuild()
        if self._doc_vectors is None or not self._doc_ids:
            return []

        vec = self._embed(text)
        if vec is None or not np.any(vec):
            return []

        # 余弦相似度（向量已归一化，等价于点积）
        scores = self._doc_vectors @ vec
        top_indices = np.argsort(scores)[::-1][:top_k]
        return [
            (self._doc_ids[i], float(scores[i]))
            for i in top_indices
            if scores[i] > 0
        ]
