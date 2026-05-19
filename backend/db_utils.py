"""MongoDB serialization helpers (datetime / ObjectId safe)."""
from datetime import date, datetime
from typing import Any, Dict


def _serialize_value(v: Any) -> Any:
    if isinstance(v, datetime):
        return v.isoformat()
    if isinstance(v, date):
        return v.isoformat()
    if isinstance(v, dict):
        return serialize_doc(v)
    if isinstance(v, list):
        return [_serialize_value(x) for x in v]
    return v


def serialize_doc(doc: Any) -> Any:
    """Convert datetime to ISO strings for JSON serialization. Strip _id."""
    if isinstance(doc, list):
        return [serialize_doc(d) for d in doc]
    if not isinstance(doc, dict):
        return _serialize_value(doc)
    out: Dict[str, Any] = {}
    for k, v in doc.items():
        if k == "_id":
            continue
        out[k] = _serialize_value(v)
    return out


def _deserialize_value(v: Any) -> Any:
    if isinstance(v, dict):
        return deserialize_doc(v)
    if isinstance(v, list):
        return [_deserialize_value(x) for x in v]
    return v


def deserialize_doc(doc: Any) -> Any:
    if isinstance(doc, list):
        return [deserialize_doc(d) for d in doc]
    if not isinstance(doc, dict):
        return _deserialize_value(doc)
    out: Dict[str, Any] = {}
    for k, v in doc.items():
        if k == "_id":
            continue
        out[k] = _deserialize_value(v)
    return out


def prepare_for_mongo(payload: Any) -> Any:
    """Convert datetimes to ISO strings before insert."""
    if isinstance(payload, list):
        return [prepare_for_mongo(x) for x in payload]
    if isinstance(payload, dict):
        return {k: prepare_for_mongo(v) for k, v in payload.items()}
    if isinstance(payload, datetime):
        return payload.isoformat()
    if isinstance(payload, date):
        return payload.isoformat()
    return payload
