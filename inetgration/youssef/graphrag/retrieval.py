import logging
import os
from collections import OrderedDict
from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence, Tuple

from langdetect import detect
from qdrant_client import QdrantClient
from sentence_transformers import CrossEncoder, SentenceTransformer

logger = logging.getLogger(__name__)

try:
    from neo4j import GraphDatabase as _Neo4jGraphDatabase
    _NEO4J_AVAILABLE = True
except ImportError:
    _Neo4jGraphDatabase = None  # type: ignore
    _NEO4J_AVAILABLE = False

from graphrag.qdrant_util import build_qdrant_client, require_qdrant_collection, resolve_qdrant_collection_name


def _qdrant_similarity_hits(
    client: QdrantClient,
    collection_name: str,
    query_vector: List[float],
    limit: int,
    query_filter,
) -> List:
    """qdrant-client >= ~1.16 removed ``search()``; use ``query_points()`` instead."""
    if hasattr(client, "search"):
        return client.search(
            collection_name=collection_name,
            query_vector=query_vector,
            limit=limit,
            query_filter=query_filter,
        )
    resp = client.query_points(
        collection_name=collection_name,
        query=query_vector,
        limit=limit,
        query_filter=query_filter,
    )
    return list(resp.points)


INTENT_KEYWORDS: Dict[str, Sequence[str]] = {
    "risk": ["suicide", "hurt myself", "self-harm", "danger"],
    "referral": ["urgent", "doctor", "emergency", "hospital"],
    "treatment": ["treatment", "medication", "lithium", "therapy"],
    "diagnosis": ["diagnosis", "difference", "bipolar i", "bipolar ii"],
    "monitoring": ["monitor", "relapse", "warning signs"],
}


@dataclass
class RetrievedChunk:
    chunk_id: str
    text: str
    score: float
    metadata: Dict


def classify_intent(query: str) -> str:
    lowered = query.lower()
    for intent, terms in INTENT_KEYWORDS.items():
        if any(term in lowered for term in terms):
            return intent
    return "general"


def detect_language(query: str) -> str:
    try:
        lang = detect(query)
        if lang in {"fr", "ar", "en"}:
            return lang
        return "en"
    except Exception:
        return "en"


class HybridRetriever:
    def __init__(
        self,
        embedding_model: str = "intfloat/multilingual-e5-large",
        reranker_model: str = "cross-encoder/ms-marco-MiniLM-L-6-v2",
        qdrant_client: Optional[QdrantClient] = None,
        collection_name: str = "bipolar_chunks",
        verify_qdrant_collection: bool = True,
        auto_resolve_qdrant_collection: bool = True,
        neo4j_uri: str = "bolt://localhost:7687",
        neo4j_user: str = "neo4j",
        neo4j_password: str = "password",
    ) -> None:
        self.qdrant = qdrant_client or build_qdrant_client()
        if verify_qdrant_collection:
            if auto_resolve_qdrant_collection:
                self.collection_name = resolve_qdrant_collection_name(self.qdrant, collection_name)
            else:
                require_qdrant_collection(self.qdrant, collection_name)
                self.collection_name = collection_name
        else:
            self.collection_name = collection_name
        self.embedder = SentenceTransformer(embedding_model)
        self.reranker = None
        skip_rerank = os.getenv("RAG_SKIP_RERANKER", "").strip().lower() in ("1", "true", "yes")
        if not skip_rerank:
            try:
                self.reranker = CrossEncoder(reranker_model)
                logger.info("Reranker loaded: %s", reranker_model)
            except Exception as exc:
                logger.warning(
                    "Reranker %s unavailable (%s) — using vector scores only.",
                    reranker_model,
                    exc,
                )
        # Neo4j is optional — if unavailable, graph expansion is silently skipped.
        self.neo4j = None
        if _NEO4J_AVAILABLE and _Neo4jGraphDatabase is not None:
            try:
                driver = _Neo4jGraphDatabase.driver(neo4j_uri, auth=(neo4j_user, neo4j_password))
                # Verify connectivity with a quick ping; fail fast rather than at query time.
                driver.verify_connectivity()
                self.neo4j = driver
                logger.info("Neo4j connected at %s", neo4j_uri)
            except Exception as exc:
                logger.warning(
                    "Neo4j unavailable at %s (%s) — graph expansion disabled, falling back to vector-only retrieval.",
                    neo4j_uri, exc
                )
        else:
            logger.warning("neo4j package not installed — graph expansion disabled.")

        cache_size = int(os.getenv("RAG_EMBED_CACHE_SIZE", "128") or "128")
        self._embed_cache: OrderedDict[str, List[float]] = OrderedDict()
        self._embed_cache_max = max(16, cache_size)

    def _encode_query(self, query: str) -> List[float]:
        key = query.strip().lower()
        cached = self._embed_cache.get(key)
        if cached is not None:
            self._embed_cache.move_to_end(key)
            return cached
        vec = self.embedder.encode(query, normalize_embeddings=True).tolist()
        self._embed_cache[key] = vec
        if len(self._embed_cache) > self._embed_cache_max:
            self._embed_cache.popitem(last=False)
        return vec

    def close(self) -> None:
        if self.neo4j is not None:
            try:
                self.neo4j.close()
            except Exception:
                pass

    def _vector_search(self, query: str, lang: str, top_k: int) -> List[RetrievedChunk]:
        query_vector = self._encode_query(query)
        hits = _qdrant_similarity_hits(
            self.qdrant,
            collection_name=self.collection_name,
            query_vector=query_vector,
            limit=top_k,
            query_filter=None,
        )
        results: List[RetrievedChunk] = []
        for hit in hits:
            payload = hit.payload or {}
            payload_lang = payload.get("lang", "en")
            score = float(hit.score)
            # small boost for language match
            if payload_lang == lang:
                score += 0.05
            results.append(
                RetrievedChunk(
                    chunk_id=payload.get("chunk_id", ""),
                    text=payload.get("text", ""),
                    score=score,
                    metadata=payload,
                )
            )
        return results

    def _graph_expand(self, query: str, hop_limit: int = 1, limit: int = 8) -> List[RetrievedChunk]:
        if self.neo4j is None:
            return []
        try:
            with self.neo4j.session() as session:
                rows = session.run(
                    """
                    MATCH (n)-[r]->(m)
                    WHERE (toLower(n.name) CONTAINS toLower($q) OR toLower(m.name) CONTAINS toLower($q))
                      AND r.chunk_id IS NOT NULL
                    WITH r LIMIT $limit
                    MATCH (c:Chunk {chunk_id: r.chunk_id})
                    RETURN c.chunk_id AS chunk_id, c.text AS text, c.lang AS lang, c.section_id AS section_id
                    """,
                    q=query,
                    limit=limit * max(1, hop_limit),
                )
                out: List[RetrievedChunk] = []
                for row in rows:
                    out.append(
                        RetrievedChunk(
                            chunk_id=row["chunk_id"],
                            text=row["text"],
                            score=0.5,
                            metadata={
                                "lang": row["lang"],
                                "section_id": row["section_id"],
                            },
                        )
                    )
                return out
        except Exception as exc:
            logger.warning("Neo4j graph_expand failed (%s) — skipping graph results.", exc)
            return []

    def _fuse(self, a: Sequence[RetrievedChunk], b: Sequence[RetrievedChunk]) -> List[RetrievedChunk]:
        by_id: Dict[str, RetrievedChunk] = {}
        for item in list(a) + list(b):
            if not item.chunk_id:
                continue
            if item.chunk_id not in by_id or item.score > by_id[item.chunk_id].score:
                by_id[item.chunk_id] = item
        return list(by_id.values())

    def _rerank(self, query: str, items: Sequence[RetrievedChunk], top_n: int = 8) -> List[RetrievedChunk]:
        if not items:
            return []
        if self.reranker is None:
            return sorted(items, key=lambda i: i.score, reverse=True)[:top_n]
        pairs: List[Tuple[str, str]] = [(query, i.text) for i in items]
        scores = self.reranker.predict(pairs)
        ranked = sorted(zip(items, scores), key=lambda x: float(x[1]), reverse=True)[:top_n]
        return [
            RetrievedChunk(
                chunk_id=item.chunk_id,
                text=item.text,
                score=float(score),
                metadata=item.metadata,
            )
            for item, score in ranked
        ]

    def retrieve(self, query: str, top_k: int = 12, graph_hops: int = 1, rerank_top_n: int = 8) -> Dict:
        q = (query or "").strip()
        if not q:
            q = "bipolar disorder education support information"
        query = q
        intent = classify_intent(query)
        lang = detect_language(query)
        vector_hits = self._vector_search(query, lang=lang, top_k=top_k)
        graph_hits = (
            self._graph_expand(query, hop_limit=graph_hops, limit=max(1, top_k // 2))
            if graph_hops > 0
            else []
        )
        fused = self._fuse(vector_hits, graph_hits)
        reranked = self._rerank(query, fused, top_n=rerank_top_n)
        return {
            "intent": intent,
            "lang": lang,
            "chunks": [item.__dict__ for item in reranked],
        }

