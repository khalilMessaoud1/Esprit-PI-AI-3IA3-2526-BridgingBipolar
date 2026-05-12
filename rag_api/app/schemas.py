from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class CrisisParentIn(BaseModel):
    parent_whatsapp_e164: Optional[str] = None
    parent_contact_consent: bool = False
    display_name: Optional[str] = None


class ChatRequest(BaseModel):
    patient_id: str = Field(..., min_length=1)
    session_id: str = Field(..., min_length=1, description="Composite e.g. userId:threadUuid")
    message: str = Field(..., min_length=1, max_length=16000)
    conversation_history: List[ChatMessage] = Field(default_factory=list)
    user_id: str = Field(..., min_length=1, description="Friend app user id (UUID string)")
    user_profile: Optional[Dict[str, str]] = None
    top_k: int = 12
    graph_hops: int = 1
    rerank_top_n: int = 8
    model: Optional[str] = None
    include_retrieval: bool = False
    keystroke_events: Optional[List[Dict[str, Any]]] = None
    keystroke_session: Optional[Dict[str, Any]] = None
    crisis_parent: Optional[CrisisParentIn] = None


class ChatResponse(BaseModel):
    answer: str
    lang: str = "en"
    escalated: bool = False
    risk: Dict[str, Any] = Field(default_factory=dict)
    retrieval: Optional[Dict[str, Any]] = None
    keystroke: Optional[Any] = None
    crisis_support_notified: bool = False
    crisis_strikes: Optional[int] = None
    navigate_to: Optional[str] = Field(
        default=None,
        description="Next.js route when the user asks to open prescription scan or sleep/activities.",
    )
