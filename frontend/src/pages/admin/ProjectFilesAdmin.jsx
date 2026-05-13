/**
 * ProjectFilesAdmin — upload & manage deliverable files.
 *
 * Admin tool. Pick a client email, drop a file, optionally tag a category
 * + notes, hit Upload. List below shows every file with size + category
 * + uploader + download/delete.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAdminApi } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FolderUp,
  Upload,
  Download,
  Trash2,
  Loader2,
  FileText,
  File as FileIcon,
} from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = ["deliverable", "brief", "mockup", "invoice", "other"];

function fmtBytes(n) {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ProjectFilesAdmin() {
  const api = useAdminApi();
  const fileInputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterEmail, setFilterEmail] = useState("");

  const [form, setForm] = useState({
    client_email: "",
    category: "deliverable",
    notes: "",
  });
  const [picked, setPicked] = useState(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Always fetch the full list; we do substring filtering client-side so
      // the "Filter by client email" input feels instant + supports partials.
      const r = await api.get("/admin/project-files");
      setFiles(r.data || []);
    } catch {
      toast.error("Failed to load files");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    document.title = "Project Files — Bloom Labs";
    load();
  }, [load]);

  const upload = async () => {
    if (!picked) {
      toast.error("Pick a file first");
      return;
    }
    if (!form.client_email.trim()) {
      toast.error("Client email is required");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", picked);
      fd.append("client_email", form.client_email.trim().toLowerCase());
      fd.append("category", form.category);
      if (form.notes.trim()) fd.append("notes", form.notes.trim());
      await api.post("/admin/project-files", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Uploaded");
      setPicked(null);
      setForm({ ...form, notes: "" });
      if (fileInputRef.current) fileInputRef.current.value = "";
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const download = async (f) => {
    try {
      const resp = await api.get(`/admin/project-files/${f.id}/download`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(resp.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = f.original_filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Download failed");
    }
  };

  const remove = async (f) => {
    if (!window.confirm(`Delete ${f.original_filename}? Clients will lose access.`)) return;
    try {
      await api.delete(`/admin/project-files/${f.id}`);
      toast.success("Deleted");
      load();
    } catch {
      toast.error("Delete failed");
    }
  };

  const visibleFiles = useMemo(() => {
    const q = filterEmail.trim().toLowerCase();
    if (!q) return files;
    return files.filter((f) =>
      (f.client_email || "").toLowerCase().includes(q) ||
      (f.original_filename || "").toLowerCase().includes(q)
    );
  }, [files, filterEmail]);

  return (
    <div className="space-y-6" data-testid="project-files-admin">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Deliverables</p>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight inline-flex items-center gap-2 mt-0.5">
          <FolderUp className="h-6 w-6 text-primary" />
          Project Files
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload deliverables — mockups, PDFs, ZIP archives — to a client. They'll see the file
          inside their client portal under the new "Files" tab.
        </p>
      </div>

      {/* Upload card */}
      <Card className="border-border">
        <CardContent className="p-5 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Client email *
              </label>
              <Input
                value={form.client_email}
                onChange={(e) => setForm({ ...form, client_email: e.target.value })}
                placeholder="client@acme.co"
                type="email"
                data-testid="pf-upload-email"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Category
              </label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm({ ...form, category: v })}
              >
                <SelectTrigger data-testid="pf-upload-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                File *
              </label>
              <input
                ref={fileInputRef}
                type="file"
                onChange={(e) => setPicked(e.target.files?.[0] || null)}
                className="block w-full text-sm text-foreground/90 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:bg-secondary/70 file:text-foreground file:cursor-pointer cursor-pointer"
                data-testid="pf-upload-input"
              />
            </div>
          </div>
          <Textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            placeholder="Notes for the client (optional)"
            data-testid="pf-upload-notes"
          />
          <div className="flex items-center gap-2">
            <Button
              onClick={upload}
              disabled={uploading || !picked}
              data-testid="pf-upload-submit"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-1.5" />
              )}
              Upload
            </Button>
            {picked && (
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <FileIcon className="h-3 w-3" />
                {picked.name} · {fmtBytes(picked.size)}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* List */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">All files</h2>
        <Input
          value={filterEmail}
          onChange={(e) => setFilterEmail(e.target.value)}
          placeholder="Filter by client email"
          className="max-w-xs"
          data-testid="pf-list-filter"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Loading…
        </div>
      ) : visibleFiles.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {files.length === 0
              ? "No files uploaded yet."
              : `No files match "${filterEmail.trim()}".`}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2 min-h-[40px]" data-testid="pf-list">
          {visibleFiles.map((f) => (
            <Card key={f.id} className="border-border" data-testid={`pf-row-${f.id}`}>
              <CardContent className="p-3.5 flex items-center gap-3 flex-wrap">
                <div className="h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{f.original_filename}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {f.category}
                    </Badge>
                    <span>{f.client_email}</span>
                    <span>{fmtBytes(f.size_bytes)}</span>
                    <span>{new Date(f.uploaded_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => download(f)}
                    data-testid={`pf-row-${f.id}-download`}
                  >
                    <Download className="h-3.5 w-3.5 mr-1.5" /> Download
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(f)}
                    className="text-rose-600"
                    data-testid={`pf-row-${f.id}-delete`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
