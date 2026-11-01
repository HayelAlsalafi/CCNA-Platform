import { useEffect, useId, useRef, useState } from "react";
import { useAuth } from "@clerk/react";
import { lessonRequest } from "@workspace/api-client-react";
import { useAdminSession } from "./admin-session-boundary";
import { adminMutationOptions } from "../lib/admin-session";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import "../lesson-media-library.css";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
export type LibraryImage={id:string;url:string;thumbnailUrl?:string;name?:string;caption?:string;width?:number;height?:number;bytes?:number};
const limit=5*1024*1024;
export function validateMediaFile(file:Pick<File,"size"|"type">) {
  return file.size>0 && file.size<=limit && ["image/png","image/jpeg","image/webp"].includes(file.type);
}
export async function prepareMediaFile(file:File) {
  if(!validateMediaFile(file)) throw Error("Choose PNG, JPEG or WebP up to 5 MiB. SVG and executable formats are not accepted.");
  const bitmap=await createImageBitmap(file);
  try {
    if(bitmap.width*bitmap.height>32000000 || bitmap.width>8192 || bitmap.height>8192) throw Error("Image dimensions exceed 8192 pixels or 32 megapixels.");
    const scale=Math.min(1,4096/bitmap.width,4096/bitmap.height), canvas=document.createElement("canvas");
    canvas.width=Math.max(1,Math.round(bitmap.width*scale)); canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const ctx=canvas.getContext("2d"); if(!ctx) throw Error("This browser cannot prepare images.");
    ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error("Image optimization failed.")),"image/webp",.92));
    if(blob.size>limit) throw Error("Prepared image exceeds 5 MiB. Choose a smaller image.");
    return {blob,width:canvas.width,height:canvas.height};
  } finally { bitmap.close(); }
}
function Thumbnail({image}:{image:LibraryImage}) {
  const [source,setSource]=useState(""),[failed,setFailed]=useState(false);
  useEffect(()=>{
    const controller=new AbortController(); let url="";
    void lessonRequest<Blob>(image.thumbnailUrl??image.url,{responseType:"blob",signal:controller.signal}).then(blob=>{
      if(controller.signal.aborted) return; url=URL.createObjectURL(blob);setSource(url);
    }).catch(()=>{if(!controller.signal.aborted)setFailed(true);});
    return()=>{controller.abort();if(url)URL.revokeObjectURL(url);};
  },[image.id,image.url,image.thumbnailUrl]);
  return failed?<span>Thumbnail unavailable</span>:source?<img src={source} alt={image.name??"Uploaded image"} loading="lazy" width={160} height={120}/>:<span role="status">Loading thumbnail...</span>;
}
function PendingThumbnail({file}:{file:File}) {
  const [url,setUrl]=useState("");
  useEffect(()=>{const source=URL.createObjectURL(file);setUrl(source);return()=>URL.revokeObjectURL(source);},[file]);
  return url?<img src={url} alt={`Local preview of ${file.name}`} width={72} height={56}/>:null;
}
export function LessonMediaLibrary({onInsert}:{onInsert:(image:LibraryImage)=>void}) {
  const session=useAdminSession(), auth=useAuth(), fileId=useId(), fileInput=useRef<HTMLInputElement>(null);
  const [tab,setTab]=useState("upload"),[libraryLoading,setLibraryLoading]=useState(false),[libraryError,setLibraryError]=useState("");
  const [queue,setQueue]=useState<Record<number,{state:string;percent?:number}>>({});
  const activeFile=useRef(-1);
  const fileState=(index:number,state:string,percent?:number)=>setQueue(previous=>({...previous,[index]:{state,percent}}));
  const [open,setOpen]=useState(false),[files,setFiles]=useState<File[]>([]),[preview,setPreview]=useState(""),[selected,setSelected]=useState<LibraryImage|null>(null),
    [items,setItems]=useState<LibraryImage[]>([]),[search,setSearch]=useState(""),[page,setPage]=useState(1),[total,setTotal]=useState(0),
    [error,setError]=useState(""),[busy,setBusy]=useState(false),[progress,setProgress]=useState<number|null>(null),[message,setMessage]=useState(""),
    [rotate,setRotate]=useState(0),[ratio,setRatio]=useState("original"),[caption,setCaption]=useState(""),[keepOriginal,setKeepOriginal]=useState(false),
    [cropEnabled,setCropEnabled]=useState(false),[crop,setCrop]=useState({left:0,top:0,width:100,height:100}),[derive,setDerive]=useState<string|null>(null);
  const request=useRef<XMLHttpRequest|null>(null), inFlight=useRef(false);
  const identity=session.identity?.userId+":"+session.identity?.sessionId;
  useEffect(()=>()=>request.current?.abort(),[identity]);
  useEffect(()=>{if(!files[0]){setPreview("");return;}const url=URL.createObjectURL(files[0]);setPreview(url);return()=>URL.revokeObjectURL(url);},[files]);
  useEffect(()=>{
    if(!open)return;setLibraryLoading(true);const controller=new AbortController();const timer=setTimeout(()=>{
      void lessonRequest<{items:LibraryImage[];total:number}>(`/api/admin/lesson-media/library?q=${encodeURIComponent(search)}&page=${page}`,{signal:controller.signal})
        .then(result=>{if(!controller.signal.aborted){setItems(result.items);setTotal(result.total);setLibraryError("");setLibraryLoading(false);}})
        .catch(e=>{if(!controller.signal.aborted){setLibraryError(e?.data?.error?.message??"Media Library could not load. Check storage and metadata activation.");setLibraryLoading(false);}});
    },250);return()=>{clearTimeout(timer);controller.abort();};
  },[open,search,page,identity]);
  const choose=(incoming:FileList|File[])=>{
    const list=Array.from(incoming);if(list.length>10 || list.some(file=>!validateMediaFile(file))){setError("Choose up to 10 PNG, JPEG or WebP files, each up to 5 MiB.");return;}
    setRotate(0);setRatio("original");setCaption("");setCropEnabled(false);setKeepOriginal(false);
    setFiles(list);setQueue({});setTab("upload");setDerive(null);setSelected(null);setError("");setMessage("");
  };
  const upload=async()=>{
    if(inFlight.current)return;activeFile.current=-1;inFlight.current=true;const current=session.capture();setBusy(true);setError("");setMessage("");
    try {
      const edit={rotate,ratio,caption,keepOriginal,...(cropEnabled?{crop}:{})};
      if(derive){const result=await lessonRequest<LibraryImage>(`/api/admin/lesson-media/${derive}/derive`,{...adminMutationOptions("derive-media",session.identity).request,method:"POST",body:JSON.stringify({...edit,name:selected?.name??"Edited image"})});if(current()){setSelected(result);setItems(previous=>[result,...previous].slice(0,24));setTotal(previous=>previous+1);setDerive(null);setMessage("New image copy saved. Published references are unchanged.");}return;}
      for(let index=0;index<files.length;index++){
        if(queue[index]?.state==="Saved")continue;
        activeFile.current=index;fileState(index,"Preparing");
        setMessage(`Preparing image ${index+1} of ${files.length}...`);setProgress(null);
        const prepared=await prepareMediaFile(files[index]);const token=await auth.getToken();if(!current())return;
        const result=await new Promise<LibraryImage>((resolve,reject)=>{
          const xhr=new XMLHttpRequest();request.current=xhr;xhr.open("POST","/api/admin/lesson-media?library=1");
          const headers=new Headers(adminMutationOptions("upload-media",session.identity).request.headers);
          headers.forEach((value,key)=>xhr.setRequestHeader(key,value));if(token)xhr.setRequestHeader("Authorization",`Bearer ${token}`);
          xhr.setRequestHeader("Content-Type",prepared.blob.type);xhr.setRequestHeader("X-Lesson-Media-Edit",encodeURIComponent(JSON.stringify({...edit,name:files[index].name})));
          xhr.timeout=60000;xhr.upload.onprogress=e=>{if(current()&&e.lengthComputable){const value=Math.round(e.loaded/e.total*100);setProgress(value);fileState(index,value===100?"Processing":"Uploading",value);}};
          xhr.onerror=()=>reject(Error("Image upload failed. Existing lesson content is unchanged."));xhr.ontimeout=()=>reject(Error("Upload timed out. Review the library before retrying to avoid duplicates."));xhr.onabort=()=>reject(Error("Upload cancelled."));
          xhr.onload=()=>{let data;try{data=JSON.parse(xhr.responseText);}catch{reject(Error("The upload response was not valid JSON."));return;}
            if(xhr.status<200||xhr.status>=300){reject(Error(data.error?.message??"Image upload failed."));return;}
            if(!/^[a-f0-9-]{36}$/.test(data.id??"") || data.url!==`/api/lesson-media/${data.id}`){reject(Error("Upload response did not match the media contract. Review the library before retrying."));return;}resolve(data);};
          fileState(index,"Uploading",0);
          setMessage(`Uploading image ${index+1} of ${files.length}; server optimization follows transfer.`);xhr.send(prepared.blob);
        });
        if(!current())return;fileState(index,"Saved",100);setSelected(result);setItems(previous=>[result,...previous].slice(0,24));setTotal(previous=>previous+1);
      }
      if(current()){setMessage("Images uploaded. Insert the selected image into your draft when ready.");}
    }catch(e){if(current()){if(activeFile.current>=0)fileState(activeFile.current,"Failed");setError(e instanceof Error?e.message:"Media operation failed.");}}
    finally{inFlight.current=false;request.current=null;if(current()){setBusy(false);setProgress(null);}}
  };
  const closeLibrary=()=>{if(busy)return;setOpen(false);setFiles([]);setQueue({});setDerive(null);};
  const pendingFiles=files.some((_,index)=>queue[index]?.state!=="Saved");
  return <Dialog open={open} onOpenChange={next=>{if(next)setOpen(true);else closeLibrary();}}>
    <DialogTrigger asChild><button type="button">Upload / Media Library</button></DialogTrigger>
    <DialogContent className="lesson-media-dialog" aria-busy={busy}>
      <DialogHeader><DialogTitle>Lesson Media Library</DialogTitle><DialogDescription>Upload once, reuse in your lessons. Insertion updates only the current draft.</DialogDescription></DialogHeader>
      <Tabs value={tab} onValueChange={setTab} className="media-library-tabs">
        <TabsList aria-label="Media Library areas"><TabsTrigger value="upload">Upload</TabsTrigger><TabsTrigger value="library">Existing Library</TabsTrigger></TabsList>
        <div className="media-dialog-body">
        <TabsContent value="upload">
          <div className="media-drop" onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();if(!busy)choose(event.dataTransfer.files);}}>
            <strong>Drop images here</strong><span>or choose images from your computer</span>
            <input ref={fileInput} id={fileId} className="sr-only" type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={busy} aria-label="Choose lesson images" onChange={event=>{if(event.target.files)choose(event.target.files);event.target.value="";}}/>
            <button type="button" disabled={busy} onClick={()=>fileInput.current?.click()}>Browse Files</button>
            <small>JPG, PNG or WebP. Up to 10 files, 5 MiB each, 32 megapixels. No SVG.</small>
          </div>
          {files.length>0 && <ul className="media-file-queue" aria-label="Selected image uploads">{files.map((file,index)=><li key={`${file.name}:${index}`}>
            <PendingThumbnail file={file}/><div><strong>{file.name}</strong><small>{(file.size/1024).toFixed(0)} KiB</small></div>
            <span className={`media-file-status media-state-${queue[index]?.state.toLowerCase()??"ready"}`}>{queue[index]?.state??"Ready"}{queue[index]?.state==="Uploading"?` ${queue[index]?.percent??0}%`:""}</span>
          </li>)}</ul>}
          {(preview||derive)&&<details className="media-edit-options" open={!!derive}>
            <summary>Image adjustments and caption</summary><div className="media-edit">
            {preview&&<img src={preview} alt="Local edit preview; not saved" style={{transform:`rotate(${rotate}deg)`,aspectRatio:ratio==="original"?undefined:ratio.replace(":","/"),objectFit:"cover"}}/>}
            <label>Rotate<select value={rotate} disabled={busy} onChange={event=>setRotate(Number(event.target.value))}>{[0,90,180,270].map(value=><option key={value} value={value}>{value} degrees</option>)}</select></label>
            <label>Aspect ratio<select value={ratio} disabled={busy} onChange={event=>setRatio(event.target.value)}>{["original","1:1","4:3","16:9"].map(value=><option key={value}>{value}</option>)}</select></label>
            <label>Caption<input value={caption} maxLength={1000} disabled={busy} onChange={event=>setCaption(event.target.value)}/></label>
            <label className="media-check"><input type="checkbox" checked={cropEnabled} disabled={busy} onChange={event=>setCropEnabled(event.target.checked)}/>Crop after rotation</label>
            {cropEnabled&&<div className="media-crop">{(["left","top","width","height"] as const).map(key=><label key={key}>{key}<input type="number" min={key==="left"||key==="top"?0:1} max={8192} value={crop[key]} disabled={busy} onChange={event=>setCrop({...crop,[key]:Number(event.target.value)})}/></label>)}</div>}
            <label className="media-check"><input type="checkbox" checked={keepOriginal} disabled={busy} onChange={event=>setKeepOriginal(event.target.checked)}/>Retain a metadata-stripped master for future edits</label>
            <small>Rotation and ratio are previewed. Crop uses pixels of the prepared image (up to 4096px). Adjustments apply to the selected batch. Edits create new copies.</small>
            </div>
          </details>}
          <button className="media-upload-action" type="button" disabled={busy||(!pendingFiles&&!derive)} onClick={()=>void upload()}>{busy?"Uploading / processing...":derive?"Save edited copy":"Upload Images"}</button>
        </TabsContent>
        <TabsContent value="library">
          <label className="media-search">Search filename or caption<input type="search" value={search} onChange={event=>{setSearch(event.target.value);setPage(1);}}/></label>
          {libraryLoading&&<p role="status">Loading your Media Library...</p>}
          {libraryError&&<p role="alert">{libraryError}</p>}
          <div className="media-gallery">{items.map(image=><div key={image.id}>
            <button type="button" disabled={busy} aria-pressed={selected?.id===image.id} onClick={()=>{setSelected(image);setDerive(null);}}><Thumbnail image={image}/><span>{image.name||"Uploaded image"}</span></button>
            <small>{image.width&&image.height?`${image.width} x ${image.height}`:""}{image.caption?` - ${image.caption}`:""}</small>
            <button type="button" disabled={busy} onClick={()=>{setSelected(image);setDerive(image.id);setFiles([]);setCaption(image.caption??"");setTab("upload");}}>Edit a new copy</button>
          </div>)}</div>
          {!items.length&&!libraryLoading&&!libraryError&&<div className="media-empty"><h3>{search?"No matching images":"Your library is ready for images"}</h3><p>{search?"Try another filename or caption.":"Upload a JPG, PNG or WebP, then reuse it in your lessons."}</p><button type="button" onClick={()=>setTab("upload")}>Go to Upload</button></div>}
          <nav aria-label="Media gallery pages"><button type="button" disabled={busy||libraryLoading||page===1} onClick={()=>setPage(page-1)}>Previous</button><span>Page {page}</span><button type="button" disabled={busy||libraryLoading||page*24>=total} onClick={()=>setPage(page+1)}>Next</button></nav>
          <small>Images referenced by published revisions are retained. Deletion is unavailable.</small>
        </TabsContent>
        </div>
      </Tabs>
      <div className="media-operation-feedback">
        {busy&&<progress aria-label="Image transfer progress" max={100} {...(progress===null?{}:{value:progress})}/>}
        {message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}
      </div>
      <footer className="media-dialog-footer"><span>{selected?.name??(selected?"Image selected":"Choose an image to insert")}</span><div>
        <button type="button" disabled={busy} onClick={closeLibrary}>Cancel</button>
        <button className="media-insert-action" type="button" disabled={busy||!selected||!!derive} onClick={()=>{if(selected){onInsert(selected);closeLibrary();}}}>Insert Selected Image</button>
      </div></footer>
    </DialogContent>
  </Dialog>;
}
