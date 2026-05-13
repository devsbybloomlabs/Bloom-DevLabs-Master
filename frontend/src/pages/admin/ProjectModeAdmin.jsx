/**
 * ProjectModeAdmin — In-house Kanban PM suite.
 *
 * Layout:
 *   - Left rail: project list + "New project" button.
 *   - Main: 5-column Kanban (Todo / In Progress / Review / Blocked / Done).
 *   - Click a card → side dialog with description, assignee, priority,
 *     due date, comments thread.
 *
 * Built to replace the unreliable Nifty sync. Tasks marked `done` and
 * linked to a Milestone auto-complete the milestone server-side.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAdminApi } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  KanbanSquare,
  Plus,
  Trash2,
  Loader2,
  MessageSquare,
  Clock,
  Flame,
  AlertTriangle,
  User as UserIcon,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

const STATUS_META = {
  todo: { label: "To do", color: "bg-slate-100 text-slate-700 border-slate-200" },
  in_progress: { label: "In progress", color: "bg-blue-100 text-blue-800 border-blue-200" },
  review: { label: "Review", color: "bg-amber-100 text-amber-800 border-amber-200" },
  blocked: { label: "Blocked", color: "bg-rose-100 text-rose-800 border-rose-200" },
  done: { label: "Done", color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
};
const STATUS_ORDER = ["todo", "in_progress", "review", "blocked", "done"];
const PRIORITY_META = {
  low: { label: "Low", icon: null, className: "text-slate-500" },
  medium: { label: "Med", icon: null, className: "text-blue-600" },
  high: { label: "High", icon: Flame, className: "text-amber-600" },
  urgent: { label: "Urgent", icon: AlertTriangle, className: "text-rose-600" },
};

function PriorityChip({ priority }) {
  const meta = PRIORITY_META[priority] || PRIORITY_META.medium;
  const Icon = meta.icon;
  return (
    <span className={`text-[10px] uppercase tracking-wider font-semibold inline-flex items-center gap-1 ${meta.className}`}>
      {Icon ? <Icon className="h-3 w-3" /> : null}
      {meta.label}
    </span>
  );
}

function NewProjectDialog({ open, onOpenChange, onCreated, api }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [color, setColor] = useState("#1E3A8A");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const r = await api.post("/admin/pm/projects", {
        name: name.trim(),
        client_email: email.trim() || null,
        color,
      });
      toast.success("Project created");
      onCreated?.(r.data);
      setName("");
      setEmail("");
      setColor("#1E3A8A");
      onOpenChange(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Create failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="pm-new-project-dialog">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Internal Kanban board. Optionally link a client by email — we'll resolve their company automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Workspace · Phase 1"
              data-testid="pm-new-project-name"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Client email (optional)</label>
            <Input
              value={email}
              type="email"
              onChange={(e) => setEmail(e.target.value)}
              placeholder="client@acme.co"
              data-testid="pm-new-project-email"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Accent color</label>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border border-border bg-transparent"
                data-testid="pm-new-project-color"
              />
              <Input value={color} onChange={(e) => setColor(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !name.trim()} data-testid="pm-new-project-submit">
            {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewTaskDialog({ open, onOpenChange, onCreated, api, project, defaultStatus }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [assignee, setAssignee] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) {
      setTitle("");
      setDescription("");
      setPriority("medium");
      setAssignee("");
      setDueDate("");
    }
  }, [open]);
  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const r = await api.post("/admin/pm/tasks", {
        project_id: project.id,
        title: title.trim(),
        description: description.trim() || null,
        priority,
        assignee: assignee.trim() || null,
        due_date: dueDate || null,
        status: defaultStatus || "todo",
      });
      toast.success("Task added");
      onCreated?.(r.data);
      onOpenChange(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Create failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="pm-new-task-dialog">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>{project?.name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title"
            data-testid="pm-new-task-title"
          />
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={3}
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Priority</label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger data-testid="pm-new-task-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_META).map(([k, m]) => (
                    <SelectItem key={k} value={k}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Due date</label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <Input
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            placeholder="Assignee email or name"
            data-testid="pm-new-task-assignee"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !title.trim()} data-testid="pm-new-task-submit">
            {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
            Add task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TaskDetailDialog({ task, onClose, api, onChanged }) {
  const open = Boolean(task);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState({ title: "", description: "", priority: "medium", assignee: "", due_date: "" });

  useEffect(() => {
    if (!task) return;
    setEdit({
      title: task.title || "",
      description: task.description || "",
      priority: task.priority || "medium",
      assignee: task.assignee || "",
      due_date: task.due_date ? task.due_date.slice(0, 10) : "",
    });
    (async () => {
      try {
        const r = await api.get(`/admin/pm/tasks/${task.id}/comments`);
        setComments(r.data || []);
      } catch {
        setComments([]);
      }
    })();
  }, [task, api]);

  if (!task) return null;

  const save = async () => {
    setBusy(true);
    try {
      const r = await api.patch(`/admin/pm/tasks/${task.id}`, {
        title: edit.title.trim() || null,
        description: edit.description.trim() || null,
        priority: edit.priority,
        assignee: edit.assignee.trim() || null,
        due_date: edit.due_date || null,
      });
      toast.success("Saved");
      onChanged?.(r.data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (status) => {
    try {
      const r = await api.patch(`/admin/pm/tasks/${task.id}`, { status });
      toast.success(`Moved to ${STATUS_META[status].label}`);
      onChanged?.(r.data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Move failed");
    }
  };

  const remove = async () => {
    if (!window.confirm("Delete this task? Comments will be lost.")) return;
    try {
      await api.delete(`/admin/pm/tasks/${task.id}`);
      toast.success("Deleted");
      onChanged?.(null);
      onClose?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Delete failed");
    }
  };

  const postComment = async () => {
    if (!newComment.trim()) return;
    try {
      const r = await api.post(`/admin/pm/tasks/${task.id}/comments`, {
        body: newComment.trim(),
      });
      setComments([...comments, r.data]);
      setNewComment("");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Comment failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent
        className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto"
        data-testid="pm-task-detail-dialog"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3">
            <span className="truncate">{task.title}</span>
            <Badge className={STATUS_META[task.status].color} variant="outline">
              {STATUS_META[task.status].label}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status pills */}
          <div className="flex flex-wrap gap-1.5">
            {STATUS_ORDER.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={s === task.status ? "default" : "outline"}
                onClick={() => changeStatus(s)}
                data-testid={`pm-task-move-${s}`}
                className="h-7 px-2 text-xs"
              >
                {STATUS_META[s].label}
              </Button>
            ))}
          </div>

          {/* Editable fields */}
          <div className="space-y-3">
            <Input
              value={edit.title}
              onChange={(e) => setEdit({ ...edit, title: e.target.value })}
              data-testid="pm-task-title-input"
            />
            <Textarea
              value={edit.description}
              onChange={(e) => setEdit({ ...edit, description: e.target.value })}
              rows={4}
              placeholder="Description"
            />
            <div className="grid grid-cols-3 gap-2">
              <Select value={edit.priority} onValueChange={(v) => setEdit({ ...edit, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_META).map(([k, m]) => (
                    <SelectItem key={k} value={k}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={edit.assignee}
                onChange={(e) => setEdit({ ...edit, assignee: e.target.value })}
                placeholder="Assignee"
              />
              <Input
                type="date"
                value={edit.due_date}
                onChange={(e) => setEdit({ ...edit, due_date: e.target.value })}
              />
            </div>
            <div className="flex justify-between items-center">
              <Button variant="destructive" size="sm" onClick={remove} data-testid="pm-task-delete">
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Delete
              </Button>
              <Button onClick={save} disabled={busy} data-testid="pm-task-save">
                {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
                Save changes
              </Button>
            </div>
          </div>

          {/* Comments */}
          <div className="border-t border-border pt-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
              <MessageSquare className="h-3 w-3" /> Comments ({comments.length})
            </p>
            <div className="space-y-2 max-h-44 overflow-y-auto" data-testid="pm-task-comments">
              {comments.length === 0 && (
                <p className="text-xs text-muted-foreground italic">No comments yet.</p>
              )}
              {comments.map((c) => (
                <div key={c.id} className="rounded-md bg-secondary/40 p-2.5">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-0.5">
                    <span className="font-medium">{c.author}</span>
                    <span>{new Date(c.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{c.body}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <Input
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Write a comment…"
                data-testid="pm-task-comment-input"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) postComment();
                }}
              />
              <Button onClick={postComment} disabled={!newComment.trim()} data-testid="pm-task-comment-submit">
                Post
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TaskCard({ task, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(task)}
      className="w-full text-left rounded-lg border border-border bg-background p-3 hover:shadow-md hover:border-primary/40 transition-all"
      data-testid={`pm-task-card-${task.id}`}
    >
      <p className="text-sm font-medium leading-snug">{task.title}</p>
      {task.description && (
        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{task.description}</p>
      )}
      <div className="flex items-center justify-between mt-2 gap-2">
        <PriorityChip priority={task.priority} />
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          {task.due_date && (
            <span className="inline-flex items-center gap-0.5">
              <Clock className="h-3 w-3" />
              {new Date(task.due_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
          )}
          {task.assignee && (
            <span className="inline-flex items-center gap-0.5 truncate max-w-[100px]">
              <UserIcon className="h-3 w-3" />
              {task.assignee.split("@")[0]}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function Column({ status, tasks, project, onCardOpen, onAdd }) {
  const meta = STATUS_META[status];
  return (
    <div className="flex flex-col w-72 shrink-0" data-testid={`pm-col-${status}`}>
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <Badge className={meta.color} variant="outline">{meta.label}</Badge>
          <span className="text-xs text-muted-foreground tabular-nums">{tasks.length}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => onAdd(status)}
          data-testid={`pm-col-add-${status}`}
          title="Add task"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex flex-col gap-2 rounded-xl bg-secondary/30 p-2 min-h-[200px]">
        {tasks.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6 italic">Empty</p>
        ) : (
          tasks.map((t) => <TaskCard key={t.id} task={t} onOpen={onCardOpen} />)
        )}
      </div>
    </div>
  );
}

export default function ProjectModeAdmin() {
  const api = useAdminApi();
  const navigate = useNavigate();
  const { projectId } = useParams();
  const [projects, setProjects] = useState([]);
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [newTaskStatus, setNewTaskStatus] = useState("todo");
  const [openTask, setOpenTask] = useState(null);

  useEffect(() => {
    document.title = "Project Mode — Bloom Labs";
  }, []);

  const loadProjects = useCallback(async () => {
    try {
      const r = await api.get("/admin/pm/projects");
      setProjects(r.data || []);
      // Auto-select first if no projectId in URL
      if (!projectId && r.data?.length > 0) {
        navigate(`/admin/project-mode/${r.data[0].id}`, { replace: true });
      }
    } catch (e) {
      toast.error("Failed to load projects");
    }
  }, [api, projectId, navigate]);

  const loadBoard = useCallback(async () => {
    if (!projectId) {
      setBoard(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const r = await api.get(`/admin/pm/projects/${projectId}/board`);
      setBoard(r.data);
    } catch (e) {
      if (e?.response?.status === 404) {
        toast.error("Project not found");
        navigate("/admin/project-mode", { replace: true });
      }
    } finally {
      setLoading(false);
    }
  }, [api, projectId, navigate]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  const refreshAll = () => {
    loadProjects();
    loadBoard();
  };

  const totalTasks = useMemo(() => {
    if (!board) return 0;
    return board.total || 0;
  }, [board]);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === projectId),
    [projects, projectId]
  );

  return (
    <div className="space-y-6" data-testid="project-mode-admin">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Project Mode</p>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight inline-flex items-center gap-2 mt-0.5">
            <KanbanSquare className="h-6 w-6 text-primary" />
            {activeProject?.name || "Pick a project"}
          </h1>
          {activeProject && (
            <p className="text-sm text-muted-foreground mt-1">
              {activeProject.client_email ? `${activeProject.client_email} · ` : ""}
              {totalTasks} tasks
            </p>
          )}
        </div>
        <Button onClick={() => setNewProjectOpen(true)} data-testid="pm-new-project-btn">
          <Plus className="h-4 w-4 mr-1.5" />
          New project
        </Button>
      </div>

      {/* Body */}
      <div className="flex gap-6">
        {/* Project rail */}
        <aside className="w-60 shrink-0" data-testid="pm-project-rail">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 px-1">
            Projects ({projects.length})
          </p>
          <div className="space-y-1">
            {projects.length === 0 && (
              <Card className="border-dashed">
                <CardContent className="p-3 text-xs text-muted-foreground">
                  No projects yet — click "New project" to start.
                </CardContent>
              </Card>
            )}
            {projects.map((p) => {
              const active = p.id === projectId;
              const total = p.task_total || 0;
              const done = p.task_counts?.done || 0;
              return (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => navigate(`/admin/project-mode/${p.id}`)}
                  className={`w-full text-left rounded-lg border p-2.5 transition-all ${
                    active
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border bg-background hover:border-primary/40"
                  }`}
                  data-testid={`pm-project-${p.id}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="h-2 w-2 rounded-full inline-block"
                      style={{ backgroundColor: p.color || "#1E3A8A" }}
                    />
                    <p className="text-sm font-medium truncate flex-1">{p.name}</p>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{p.client_email?.split("@")[0] || "—"}</span>
                    <span className="inline-flex items-center gap-0.5">
                      <CheckCircle2 className="h-3 w-3" />
                      {done}/{total}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Kanban */}
        <div className="flex-1 min-w-0">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              Loading board…
            </div>
          ) : !board ? (
            <div className="rounded-xl border border-dashed border-border bg-secondary/30 p-12 text-center">
              <KanbanSquare className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
              <p className="font-display text-base font-medium">No project selected</p>
              <p className="text-sm text-muted-foreground mt-1">
                Create one to start tracking work.
              </p>
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-4 -mx-2 px-2">
              {STATUS_ORDER.map((s) => (
                <Column
                  key={s}
                  status={s}
                  tasks={board.columns[s] || []}
                  project={board.project}
                  onCardOpen={setOpenTask}
                  onAdd={(st) => {
                    setNewTaskStatus(st);
                    setNewTaskOpen(true);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <NewProjectDialog
        open={newProjectOpen}
        onOpenChange={setNewProjectOpen}
        api={api}
        onCreated={(p) => {
          refreshAll();
          navigate(`/admin/project-mode/${p.id}`);
        }}
      />
      <NewTaskDialog
        open={newTaskOpen}
        onOpenChange={setNewTaskOpen}
        api={api}
        project={board?.project}
        defaultStatus={newTaskStatus}
        onCreated={refreshAll}
      />
      <TaskDetailDialog
        task={openTask}
        api={api}
        onClose={() => setOpenTask(null)}
        onChanged={(updated) => {
          if (updated) setOpenTask(updated);
          refreshAll();
        }}
      />
    </div>
  );
}
