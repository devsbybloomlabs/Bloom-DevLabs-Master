/**
 * ProjectFilesView — client portal "Files" tab.
 *
 * Lists every deliverable the team has uploaded to this client. Click
 * Download to stream the file via the authenticated backend endpoint.
 */
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, FileText, FolderOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";

function fmtBytes(n) {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const CATEGORY_TONE = {
  deliverable: "bg-emerald-100 text-emerald-800 border-emerald-200",
  brief: "bg-blue-100 text-blue-800 border-blue-200",
  mockup: "bg-violet-100 text-violet-800 border-violet-200",
  invoice: "bg-amber-100 text-amber-800 border-amber-200",
  other: "bg-slate-100 text-slate-700 border-slate-200",
};

export default function ProjectFilesView({ api }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!api) return;
    try {
      const r = await api.get("/clients/me/project-files");
      setFiles(r.data || []);
    } catch {
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const download = async (f) => {
    try {
      const resp = await api.get(`/clients/me/project-files/${f.id}/download`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(resp.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = f.original_filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Couldn't download — try again");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading files…
      </div>
    );
  }

  if (!files.length) {
    return (
      <Card className="border-dashed" data-testid="portal-files-empty">
        <CardContent className="p-10 text-center">
          <FolderOpen className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="font-display text-base font-medium">No files yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            We'll drop deliverables and design files here as we ship them.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2" data-testid="portal-files-list">
      {files.map((f) => {
        const tone = CATEGORY_TONE[f.category] || CATEGORY_TONE.other;
        return (
          <Card key={f.id} className="border-border" data-testid={`portal-file-${f.id}`}>
            <CardContent className="p-4 flex items-center gap-3 flex-wrap">
              <div className="h-10 w-10 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-medium truncate">
                  {f.original_filename}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                  <Badge className={tone} variant="outline">
                    {f.category}
                  </Badge>
                  <span>{fmtBytes(f.size_bytes)}</span>
                  <span>{new Date(f.uploaded_at).toLocaleDateString()}</span>
                  {f.notes && <span className="italic">"{f.notes}"</span>}
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => download(f)}
                data-testid={`portal-file-${f.id}-download`}
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Download
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
