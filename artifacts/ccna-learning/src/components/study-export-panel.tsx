import {Dialog,DialogTrigger,DialogContent,DialogHeader,DialogTitle,DialogDescription} from "./ui/dialog";
import {useEffect,useRef,useState} from "react";
import {collectStudyExport,buildStudyExport,downloadStudyExport,type ExportItem} from "../lib/study-export";
export function StudyExportPanel({chapterId,lessonId,identityKey}:{chapterId?:string;lessonId?:string;identityKey:string}) {
  const [open,setOpen]=useState(false),[scope,setScope]=useState("all"),[kinds,setKinds]=useState<ExportItem["kind"][]>(["NOTE","HIGHLIGHT","BOOKMARK"]),[format,setFormat]=useState<"xlsx"|"docx"|"pdf">("xlsx"),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const controller=useRef<AbortController|null>(null),owner=useRef(identityKey);owner.current=identityKey;
  useEffect(()=>{setBusy(false);setMessage("");return()=>{controller.current?.abort();controller.current=null;};},[identityKey]);
  return <Dialog open={open} onOpenChange={value=>{if(!busy)setOpen(value);}}><DialogTrigger asChild><button type="button">Export study materials</button></DialogTrigger><DialogContent className="study-export-dialog"><DialogHeader><DialogTitle>Export my study materials</DialogTitle><DialogDescription>Choose the scope and format for your private download.</DialogDescription></DialogHeader>
    <p>Download only your notes, highlighted excerpts and bookmarks. Full lessons are excluded.</p>
    <label>Export scope<select value={scope} disabled={busy} onChange={e=>setScope(e.target.value)}><option value="all">Everything</option><option value="chapter" disabled={!chapterId}>Selected chapter</option><option value="lesson" disabled={!lessonId}>Selected lesson</option></select></label>
    <fieldset disabled={busy}><legend>Content types</legend>{(["NOTE","HIGHLIGHT","BOOKMARK"] as const).map(kind=><label key={kind}><input type="checkbox" checked={kinds.includes(kind)} onChange={e=>setKinds(e.target.checked?[...kinds,kind]:kinds.filter(value=>value!==kind))}/>{kind.toLowerCase()}</label>)}</fieldset>
    <label>File format<select value={format} disabled={busy} onChange={e=>setFormat(e.target.value as typeof format)}><option value="xlsx">Excel (.xlsx)</option><option value="docx">Word (.docx)</option><option value="pdf">PDF (.pdf)</option></select></label>
    <button type="button" disabled={busy||!kinds.length||!identityKey||(scope==="chapter"&&!chapterId)||(scope==="lesson"&&!lessonId)} onClick={async()=>{
      if(controller.current)return;const capture=identityKey,abort=new AbortController();controller.current=abort;setBusy(true);setMessage("Preparing your private export...");
      try{const items=await collectStudyExport({chapterId:scope==="chapter"?chapterId:undefined,lessonId:scope==="lesson"?lessonId:undefined,kinds},abort.signal);if(!items.length)throw Error("No saved study items match this scope.");
        const blob=await buildStudyExport(items,format);if(!abort.signal.aborted&&owner.current===capture){downloadStudyExport(blob,format);setMessage(`Downloaded ${items.length} study items.`);}
      }catch(error){if(!abort.signal.aborted&&owner.current===capture)setMessage(error instanceof Error?error.message:"Export failed. Nothing was downloaded.");}
      finally{if(controller.current===abort)controller.current=null;if(owner.current===capture)setBusy(false);}
    }}>{busy?"Exporting...":"Download my export"}</button>
    {busy&&<button type="button" onClick={()=>{controller.current?.abort();setBusy(false);setMessage("Export cancelled.");}}>Cancel export</button>}
    {message&&<p role="status">{message}</p>}
  </DialogContent></Dialog>;
}
