"""Phase F — In-house Project Mode.

A self-contained mini-PM suite that replaces the flaky Nifty integration.
Backs a Kanban board where the founder/team can manage internal tasks per
client project. Tasks can optionally be linked to a Milestone so the
animated client-facing timeline stays in sync.

Collections:
  - pm_projects: { id, name, slug, company_id?, client_email?, color, status, created_at, updated_at }
  - pm_tasks:    { id, project_id, title, description, status, assignee,
                   due_date, priority, milestone_id?, order_idx, created_at, updated_at }
  - pm_comments: { id, task_id, author, body, created_at }

Endpoints (all admin-auth):
  Projects:
    GET    /api/admin/pm/projects             list (?status=)
    POST   /api/admin/pm/projects             create
    GET    /api/admin/pm/projects/{id}        full doc + stats
    PATCH  /api/admin/pm/projects/{id}        update
    DELETE /api/admin/pm/projects/{id}        archive
    GET    /api/admin/pm/projects/{id}/board  Kanban-grouped tasks

  Tasks:
    GET    /api/admin/pm/tasks                list (?project_id=, ?status=, ?assignee=)
    POST   /api/admin/pm/tasks                create
    PATCH  /api/admin/pm/tasks/{id}           update (incl. status transitions + reordering)
    DELETE /api/admin/pm/tasks/{id}           delete
    POST   /api/admin/pm/tasks/{id}/comments  add comment
    GET    /api/admin/pm/tasks/{id}/comments  list comments
"""
from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from activity_log import log_activity
from auth import get_current_user
from db_utils import prepare_for_mongo

log = logging.getLogger("project_mode")

# Kanban column order — single source of truth.
TASK_STATUSES = ("todo", "in_progress", "review", "blocked", "done")
TASK_PRIORITIES = ("low", "medium", "high", "urgent")
PROJECT_STATUSES = ("active", "paused", "archived")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _slugify(s: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", (s or "").lower()).strip("-")
    return s or "project"


def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


# =========================================================================
# Pydantic
# =========================================================================
class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=140)
    company_id: Optional[str] = None
    client_email: Optional[str] = None
    color: Optional[str] = None  # hex string, e.g. "#1E3A8A"
    status: str = "active"


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    company_id: Optional[str] = None
    client_email: Optional[str] = None
    color: Optional[str] = None
    status: Optional[str] = None


class TaskCreate(BaseModel):
    project_id: str
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    status: str = "todo"
    assignee: Optional[str] = None
    due_date: Optional[str] = None  # ISO date/datetime
    priority: str = "medium"
    milestone_id: Optional[str] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    assignee: Optional[str] = None
    due_date: Optional[str] = None
    priority: Optional[str] = None
    milestone_id: Optional[str] = None
    order_idx: Optional[int] = None


class CommentCreate(BaseModel):
    body: str = Field(..., min_length=1, max_length=4000)
    author: Optional[str] = None  # defaults to current admin name


# =========================================================================
# Router
# =========================================================================
pm_admin_router = APIRouter(
    prefix="/admin/pm",
    tags=["project-mode"],
    dependencies=[Depends(get_current_user)],
)


# -------------------------- Projects ----------------------------
@pm_admin_router.get("/projects")
async def list_projects(
    db: AsyncIOMotorDatabase = Depends(get_db),
    status: Optional[str] = None,
) -> List[Dict[str, Any]]:
    q: Dict[str, Any] = {}
    if status:
        q["status"] = status
    rows = await db.pm_projects.find(q, {"_id": 0}).sort("updated_at", -1).to_list(500)
    # Attach task counts per project — small numbers, cheap aggregation.
    pids = [p["id"] for p in rows]
    counts: Dict[str, Dict[str, int]] = {}
    if pids:
        pipeline = [
            {"$match": {"project_id": {"$in": pids}}},
            {"$group": {"_id": {"p": "$project_id", "s": "$status"}, "n": {"$sum": 1}}},
        ]
        async for row in db.pm_tasks.aggregate(pipeline):
            pid = row["_id"]["p"]
            st = row["_id"]["s"]
            counts.setdefault(pid, {}).update({st: row["n"]})
    for p in rows:
        c = counts.get(p["id"], {})
        p["task_counts"] = {st: c.get(st, 0) for st in TASK_STATUSES}
        p["task_total"] = sum(p["task_counts"].values())
    return rows


@pm_admin_router.post("/projects")
async def create_project(
    req: ProjectCreate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user=Depends(get_current_user),
) -> Dict[str, Any]:
    if req.status not in PROJECT_STATUSES:
        raise HTTPException(400, f"status must be one of {PROJECT_STATUSES}")
    slug = _slugify(req.name)
    # Resolve company_id by email if not provided
    cid = req.company_id
    if not cid and req.client_email:
        co = await db.companies.find_one(
            {"primary_email": req.client_email.lower().strip()}, {"_id": 0, "id": 1}
        )
        cid = (co or {}).get("id")
    now = _now_iso()
    doc = {
        "id": str(uuid.uuid4()),
        "name": req.name.strip(),
        "slug": slug,
        "company_id": cid,
        "client_email": (req.client_email or "").lower().strip() or None,
        "color": req.color or "#1E3A8A",
        "status": req.status,
        "created_at": now,
        "updated_at": now,
        "created_by": user.get("email") if isinstance(user, dict) else None,
    }
    await db.pm_projects.insert_one(prepare_for_mongo(doc))
    if cid:
        await log_activity(
            db,
            company_id=cid,
            type="pm.project.created",
            title=f"Project created — {doc['name']}",
            meta={"project_id": doc["id"]},
        )
    doc["task_counts"] = {st: 0 for st in TASK_STATUSES}
    doc["task_total"] = 0
    return doc


@pm_admin_router.get("/projects/{project_id}")
async def get_project(
    project_id: str, db: AsyncIOMotorDatabase = Depends(get_db)
) -> Dict[str, Any]:
    doc = await db.pm_projects.find_one({"id": project_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Project not found")
    return doc


@pm_admin_router.patch("/projects/{project_id}")
async def update_project(
    project_id: str,
    req: ProjectUpdate,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    upd: Dict[str, Any] = {k: v for k, v in req.model_dump().items() if v is not None}
    if "status" in upd and upd["status"] not in PROJECT_STATUSES:
        raise HTTPException(400, f"status must be one of {PROJECT_STATUSES}")
    if "client_email" in upd and upd["client_email"]:
        upd["client_email"] = upd["client_email"].lower().strip()
    if not upd:
        raise HTTPException(400, "Nothing to update")
    upd["updated_at"] = _now_iso()
    res = await db.pm_projects.update_one(
        {"id": project_id}, {"$set": prepare_for_mongo(upd)}
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Project not found")
    fresh = await db.pm_projects.find_one({"id": project_id}, {"_id": 0})
    return fresh


@pm_admin_router.delete("/projects/{project_id}")
async def archive_project(
    project_id: str, db: AsyncIOMotorDatabase = Depends(get_db)
) -> Dict[str, Any]:
    res = await db.pm_projects.update_one(
        {"id": project_id},
        {"$set": {"status": "archived", "updated_at": _now_iso()}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Project not found")
    return {"ok": True}


@pm_admin_router.get("/projects/{project_id}/board")
async def get_board(
    project_id: str, db: AsyncIOMotorDatabase = Depends(get_db)
) -> Dict[str, Any]:
    project = await db.pm_projects.find_one({"id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(404, "Project not found")
    tasks = (
        await db.pm_tasks.find({"project_id": project_id}, {"_id": 0})
        .sort([("order_idx", 1), ("created_at", 1)])
        .to_list(2000)
    )
    columns: Dict[str, List[Dict[str, Any]]] = {st: [] for st in TASK_STATUSES}
    for t in tasks:
        st = t.get("status") if t.get("status") in TASK_STATUSES else "todo"
        columns[st].append(t)
    return {
        "project": project,
        "columns": columns,
        "statuses": list(TASK_STATUSES),
        "total": len(tasks),
    }


# -------------------------- Tasks ----------------------------
@pm_admin_router.get("/tasks")
async def list_tasks(
    db: AsyncIOMotorDatabase = Depends(get_db),
    project_id: Optional[str] = None,
    status: Optional[str] = None,
    assignee: Optional[str] = None,
) -> List[Dict[str, Any]]:
    q: Dict[str, Any] = {}
    if project_id:
        q["project_id"] = project_id
    if status:
        q["status"] = status
    if assignee:
        q["assignee"] = assignee
    rows = await db.pm_tasks.find(q, {"_id": 0}).sort(
        [("order_idx", 1), ("created_at", -1)]
    ).to_list(2000)
    return rows


@pm_admin_router.post("/tasks")
async def create_task(
    req: TaskCreate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user=Depends(get_current_user),
) -> Dict[str, Any]:
    if req.status not in TASK_STATUSES:
        raise HTTPException(400, f"status must be one of {TASK_STATUSES}")
    if req.priority not in TASK_PRIORITIES:
        raise HTTPException(400, f"priority must be one of {TASK_PRIORITIES}")
    project = await db.pm_projects.find_one(
        {"id": req.project_id}, {"_id": 0, "id": 1, "name": 1, "company_id": 1}
    )
    if not project:
        raise HTTPException(404, "Project not found")
    # Next order index within the chosen column
    last = await db.pm_tasks.find(
        {"project_id": req.project_id, "status": req.status},
        {"_id": 0, "order_idx": 1},
    ).sort("order_idx", -1).limit(1).to_list(1)
    next_idx = ((last[0]["order_idx"] if last and last[0].get("order_idx") is not None else -1) + 1)
    now = _now_iso()
    doc = {
        "id": str(uuid.uuid4()),
        "project_id": req.project_id,
        "title": req.title.strip(),
        "description": (req.description or "").strip(),
        "status": req.status,
        "assignee": (req.assignee or "").strip() or None,
        "due_date": req.due_date,
        "priority": req.priority,
        "milestone_id": req.milestone_id,
        "order_idx": next_idx,
        "created_at": now,
        "updated_at": now,
        "created_by": user.get("email") if isinstance(user, dict) else None,
    }
    await db.pm_tasks.insert_one(prepare_for_mongo(doc))
    if project.get("company_id"):
        await log_activity(
            db,
            company_id=project["company_id"],
            type="pm.task.created",
            title=f"Task — {doc['title']}",
            meta={"task_id": doc["id"], "project_id": req.project_id},
        )
    return doc


@pm_admin_router.patch("/tasks/{task_id}")
async def update_task(
    task_id: str,
    req: TaskUpdate,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    task = await db.pm_tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(404, "Task not found")
    upd: Dict[str, Any] = {k: v for k, v in req.model_dump().items() if v is not None}
    if "status" in upd and upd["status"] not in TASK_STATUSES:
        raise HTTPException(400, f"status must be one of {TASK_STATUSES}")
    if "priority" in upd and upd["priority"] not in TASK_PRIORITIES:
        raise HTTPException(400, f"priority must be one of {TASK_PRIORITIES}")
    if not upd:
        raise HTTPException(400, "Nothing to update")
    upd["updated_at"] = _now_iso()
    # If we're moving columns and the caller didn't pin a new order_idx,
    # land at the bottom of the destination column.
    if "status" in upd and upd["status"] != task.get("status") and "order_idx" not in upd:
        last = await db.pm_tasks.find(
            {"project_id": task["project_id"], "status": upd["status"]},
            {"_id": 0, "order_idx": 1},
        ).sort("order_idx", -1).limit(1).to_list(1)
        upd["order_idx"] = (
            (last[0]["order_idx"] if last and last[0].get("order_idx") is not None else -1) + 1
        )
    # Auto-sync linked milestone if status transitions to done
    if upd.get("status") == "done" and task.get("milestone_id"):
        try:
            await db.milestones.update_one(
                {"id": task["milestone_id"]},
                {"$set": {"status": "complete", "completion_date": _now_iso()}},
            )
        except Exception as exc:  # pragma: no cover
            log.warning("Milestone auto-complete failed: %s", exc)
    await db.pm_tasks.update_one(
        {"id": task_id}, {"$set": prepare_for_mongo(upd)}
    )
    fresh = await db.pm_tasks.find_one({"id": task_id}, {"_id": 0})
    return fresh


@pm_admin_router.delete("/tasks/{task_id}")
async def delete_task(
    task_id: str, db: AsyncIOMotorDatabase = Depends(get_db)
) -> Dict[str, Any]:
    res = await db.pm_tasks.delete_one({"id": task_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Task not found")
    await db.pm_comments.delete_many({"task_id": task_id})
    return {"ok": True}


# -------------------------- Comments ----------------------------
@pm_admin_router.get("/tasks/{task_id}/comments")
async def list_comments(
    task_id: str, db: AsyncIOMotorDatabase = Depends(get_db)
) -> List[Dict[str, Any]]:
    rows = await db.pm_comments.find({"task_id": task_id}, {"_id": 0}).sort(
        "created_at", 1
    ).to_list(500)
    return rows


@pm_admin_router.post("/tasks/{task_id}/comments")
async def add_comment(
    task_id: str,
    req: CommentCreate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user=Depends(get_current_user),
) -> Dict[str, Any]:
    task = await db.pm_tasks.find_one({"id": task_id}, {"_id": 0, "id": 1})
    if not task:
        raise HTTPException(404, "Task not found")
    author = req.author or (
        user.get("name") or user.get("email") if isinstance(user, dict) else "Admin"
    )
    doc = {
        "id": str(uuid.uuid4()),
        "task_id": task_id,
        "author": author,
        "body": req.body.strip(),
        "created_at": _now_iso(),
    }
    await db.pm_comments.insert_one(prepare_for_mongo(doc))
    # Touch parent so it pops to the top of recent lists.
    await db.pm_tasks.update_one(
        {"id": task_id}, {"$set": {"updated_at": _now_iso()}}
    )
    return doc


__all__ = ["pm_admin_router", "pm_client_router", "TASK_STATUSES", "TASK_PRIORITIES", "PROJECT_STATUSES"]


# =========================================================================
# Client portal — "team is working on it" live activity widget
# =========================================================================
pm_client_router = APIRouter(
    prefix="/clients/me/team-activity",
    tags=["project-mode-client"],
)


def _client_dep():
    from client_routes import get_current_client
    return get_current_client


@pm_client_router.get("")
async def my_team_activity(
    db: AsyncIOMotorDatabase = Depends(get_db),
    client=Depends(_client_dep()),
) -> Dict[str, Any]:
    """Aggregated PM task activity for the caller's projects.

    Returns enough for the client portal to render a "team is heads-down"
    widget: per-status counts + the 5 most-recent task updates (title only,
    no internal description).
    """
    email = (client["email"] or "").lower()
    projects = await db.pm_projects.find(
        {"client_email": email, "status": {"$ne": "archived"}},
        {"_id": 0, "id": 1, "name": 1, "color": 1},
    ).to_list(50)
    pids = [p["id"] for p in projects]
    counts = {st: 0 for st in TASK_STATUSES}
    recent: List[Dict[str, Any]] = []
    completed_this_week = 0
    if pids:
        # Group task counts by status across the caller's projects.
        pipeline = [
            {"$match": {"project_id": {"$in": pids}}},
            {"$group": {"_id": "$status", "n": {"$sum": 1}}},
        ]
        async for row in db.pm_tasks.aggregate(pipeline):
            st = row["_id"]
            if st in counts:
                counts[st] = int(row["n"])

        # Last 5 recent task updates — exclude `description` for privacy.
        recent_docs = (
            await db.pm_tasks.find(
                {"project_id": {"$in": pids}},
                {"_id": 0, "id": 1, "title": 1, "status": 1, "updated_at": 1, "project_id": 1},
            )
            .sort("updated_at", -1)
            .limit(5)
            .to_list(5)
        )
        proj_lookup = {p["id"]: p for p in projects}
        for t in recent_docs:
            p = proj_lookup.get(t.get("project_id")) or {}
            recent.append(
                {
                    "id": t["id"],
                    "title": t["title"],
                    "status": t["status"],
                    "updated_at": t.get("updated_at"),
                    "project_name": p.get("name"),
                    "project_color": p.get("color"),
                }
            )

        # Done-this-week count
        since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        completed_this_week = await db.pm_tasks.count_documents(
            {
                "project_id": {"$in": pids},
                "status": "done",
                "updated_at": {"$gte": since},
            }
        )

    return {
        "has_activity": bool(pids) and sum(counts.values()) > 0,
        "projects_count": len(projects),
        "counts": counts,
        "active_count": counts["in_progress"] + counts["review"],
        "completed_this_week": completed_this_week,
        "recent": recent,
    }
