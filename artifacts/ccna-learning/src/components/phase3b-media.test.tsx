// @vitest-environment jsdom
import {act,useState} from "react";
import {createRoot,type Root} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {beforeEach,afterEach,it,expect,vi} from "vitest";
import {setAuthTokenGetter,type LessonBlock} from "@workspace/api-client-react";
import {AdminSessionBoundary} from "./admin-session-boundary";
import {LessonMediaLibrary,validateMediaFile} from "./lesson-media-library";
import {VisualImageEditor} from "./lesson-visual-blocks";
import {lessonBlockSchema} from "../../../api-server/src/lib/lesson-validation";
const auth={isLoaded:true,isSignedIn:true,userId:"admin-fixture",sessionId:"media-session",getToken:async()=>null};
vi.mock("@clerk/react",()=>({useAuth:()=>auth}));
let root:Root,host:HTMLDivElement,client:QueryClient,uploadStatus:number,responses:number[],total:number,images:any[],uploads:UploadFixture[],insert:ReturnType<typeof vi.fn>;
const id="11111111-1111-4111-8111-111111111111",url=`/api/lesson-media/${id}`;
class UploadFixture {
 upload={onprogress:null as ((event:any)=>void)|null};status=0;responseText="";timeout=0;headers=new Map<string,string>();body?:Blob;path="";
 onload:(()=>void)|null=null;onabort:(()=>void)|null=null;onerror:(()=>void)|null=null;ontimeout:(()=>void)|null=null;
 constructor(){uploads.push(this);}open(_method:string,path:string){this.path=path;}setRequestHeader(key:string,value:string){this.headers.set(key,value);}abort(){this.onabort?.();}
 send(body:Blob){this.body=body;queueMicrotask(()=>{this.upload.onprogress?.({loaded:body.size,total:body.size,lengthComputable:true});this.status=responses.shift()??uploadStatus;this.responseText=JSON.stringify(this.status===200?{id,url,mime:"image/webp",width:1200,height:800,name:"Uploaded figure",caption:"Saved caption"}:{error:{code:"MEDIA_LIBRARY_NOT_READY",message:"Media Library metadata requires separately approved migration 0015. No upload has been saved."}});this.onload?.();});}
}
const wait=()=>act(async()=>new Promise(resolve=>setTimeout(resolve,40)));
async function click(text:string){const button=[...document.querySelectorAll<HTMLButtonElement>("button")].find(node=>node.textContent?.trim()===text)!;expect(button,`Missing ${text}`).toBeTruthy();await act(async()=>button.click());await wait();}
async function tab(label:string){const button=[...document.querySelectorAll<HTMLElement>('[role="tab"]')].find(node=>node.textContent===label)!;await act(async()=>{button.dispatchEvent(new MouseEvent("mousedown",{bubbles:true,button:0}));button.click();});await wait();}
async function render(content:React.ReactNode=<LessonMediaLibrary onInsert={insert}/>){await act(async()=>root.render(<QueryClientProvider client={client}><AdminSessionBoundary identity={auth}>{content}</AdminSessionBoundary></QueryClientProvider>));await click("Upload / Media Library");}
async function choose(files:File[]){const input=document.querySelector<HTMLInputElement>('input[type="file"]')!;Object.defineProperty(input,"files",{value:files,configurable:true});await act(async()=>input.dispatchEvent(new Event("change",{bubbles:true})));await wait();}
const file=(name="diagram.png",type="image/png")=>new File(["isolated fixture"],name,{type});
beforeEach(()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;client=new QueryClient({defaultOptions:{queries:{retry:false}}});host=document.createElement("div");document.body.append(host);root=createRoot(host);uploads=[];uploadStatus=200;responses=[];total=0;images=[];insert=vi.fn();setAuthTokenGetter(null);
 vi.stubGlobal("XMLHttpRequest",UploadFixture);vi.stubGlobal("createImageBitmap",vi.fn(async()=>({width:1200,height:800,close:vi.fn()})));
 vi.spyOn(HTMLCanvasElement.prototype,"getContext").mockReturnValue({drawImage:vi.fn()} as any);
 vi.spyOn(HTMLCanvasElement.prototype,"toBlob").mockImplementation(callback=>callback(new Blob(["optimized fixture"],{type:"image/webp"})));
 URL.createObjectURL=vi.fn(()=>"blob:local-fixture");URL.revokeObjectURL=vi.fn();
 vi.stubGlobal("fetch",vi.fn(async(path:string)=>path.includes("/library?")?new Response(JSON.stringify({items:images,page:1,pageSize:24,total}),{headers:{"Content-Type":"application/json"}}):new Response(new Blob(["thumbnail"],{type:"image/webp"}))));
});
afterEach(async()=>{await act(async()=>root.unmount());client.clear();host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();setAuthTokenGetter(null);});
it("Phase 3B media validates file restrictions and shows an accessible empty library",async()=>{
 expect(validateMediaFile({size:1,type:"image/jpeg"})).toBe(true);expect(validateMediaFile({size:6*1024*1024,type:"image/png"})).toBe(false);
 await render();await tab("Existing Library");await act(async()=>new Promise(resolve=>setTimeout(resolve,300)));await wait();
 expect(document.body.textContent).toContain("Your library is ready for images");expect([...document.querySelectorAll<HTMLButtonElement>("button")].find(node=>node.textContent==="Insert Selected Image")!.disabled).toBe(true);
 await tab("Upload");await choose([file("unsafe.svg","image/svg+xml")]);expect(document.querySelector('[role="alert"]')?.textContent).toContain("Choose up to 10");expect(uploads).toHaveLength(0);
});
it("Phase 3B media uploads a batch once with per-file states and inserts a persistent reference",async()=>{
 await render();await choose([file("one.jpg","image/jpeg"),file("two.webp","image/webp")]);expect(document.querySelectorAll(".media-file-queue img")).toHaveLength(2);
 await click("Upload Images");expect(uploads).toHaveLength(2);expect([...document.querySelectorAll(".media-file-status")].map(node=>node.textContent)).toEqual(["Saved","Saved"]);
 expect(uploads[0].path).toBe("/api/admin/lesson-media?library=1");expect(uploads[0].headers.get("x-admin-session")).toBe("media-session");expect(uploads[0].body?.type).toBe("image/webp");
 await click("Upload Images");expect(uploads).toHaveLength(2);await click("Insert Selected Image");expect(insert).toHaveBeenCalledWith(expect.objectContaining({url,width:1200,height:800}));
 expect(JSON.stringify(insert.mock.calls)).not.toMatch(/blob:|data:/);expect(document.querySelector('[role="dialog"]')).toBeNull();expect(URL.revokeObjectURL).toHaveBeenCalled();
});
it("Phase 3B media accepts drop files and keeps an activation failure visible without fake insertion",async()=>{
 uploadStatus=503;await render();const drop=document.querySelector(".media-drop")!;const event=new Event("drop",{bubbles:true,cancelable:true});Object.defineProperty(event,"dataTransfer",{value:{files:[file()]}});await act(async()=>drop.dispatchEvent(event));await wait();
 await click("Upload Images");expect(document.body.textContent).toContain("migration 0015");expect(document.querySelector(".media-file-status")?.textContent).toBe("Failed");
 await tab("Existing Library");await act(async()=>new Promise(resolve=>setTimeout(resolve,300)));await wait();expect(document.body.textContent).toContain("No upload has been saved");expect(insert).not.toHaveBeenCalled();
});
it("Phase 3B media reuses a gallery image, preserves alt text and sizing through block validation",async()=>{
 images=[{id,url,thumbnailUrl:url+"?variant=thumbnail",name:"TCP diagram",caption:"Original figure",width:1200,height:800}];total=25;
 let current:LessonBlock={id:"22222222-2222-4222-8222-222222222222",type:"image",url:"https://example.com/old.png",alt:"A TCP exchange",width:"wide",alignment:"left"};
 function Harness(){const [block,setBlock]=useState(current);return <VisualImageEditor block={block as Extract<LessonBlock,{type:"image"}>} update={next=>{current=next;setBlock(next);}}/>;}
 await render(<Harness/>);await tab("Existing Library");await act(async()=>new Promise(resolve=>setTimeout(resolve,300)));await wait();await click("TCP diagram");await click("Insert Selected Image");
 expect(current).toMatchObject({url,alt:"A TCP exchange",caption:"Original figure",width:"wide",alignment:"left",pixelWidth:1200,pixelHeight:800});expect(lessonBlockSchema.safeParse(current).success).toBe(true);expect(lessonBlockSchema.parse(JSON.parse(JSON.stringify(current)))).toMatchObject({url,alt:"A TCP exchange",caption:"Original figure",pixelWidth:1200,pixelHeight:800});
 expect(document.querySelector<HTMLInputElement>('input[inputmode="url"]')!.value).toBe(url);expect(uploads).toHaveLength(0);
});

it("Phase 3B media preserves confirmed uploads during a partial batch failure",async()=>{
 responses=[200,503];await render();await choose([file("one.png"),file("two.png")]);await click("Upload Images");
 expect([...document.querySelectorAll(".media-file-status")].map(node=>node.textContent)).toEqual(["Saved","Failed"]);expect(uploads).toHaveLength(2);
 await click("Upload Images");expect(uploads).toHaveLength(3);expect([...document.querySelectorAll(".media-file-status")].map(node=>node.textContent)).toEqual(["Saved","Saved"]);
});
it("Phase 3B media preserves filename search and gallery pagination",async()=>{
 images=[{id,url,name:"Searchable figure"}];total=25;await render();await tab("Existing Library");await act(async()=>new Promise(resolve=>setTimeout(resolve,300)));await wait();
 const search=document.querySelector<HTMLInputElement>('input[type="search"]')!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(search,"TCP");search.dispatchEvent(new Event("input",{bubbles:true}));});await act(async()=>new Promise(resolve=>setTimeout(resolve,300)));await wait();
 expect(vi.mocked(fetch).mock.calls.some(([path])=>String(path).includes("q=TCP"))).toBe(true);
 await click("Next");await act(async()=>new Promise(resolve=>setTimeout(resolve,300)));await wait();
 expect(vi.mocked(fetch).mock.calls.some(([path])=>String(path).includes("page=2"))).toBe(true);expect(document.body.textContent).toContain("Page 2");
});
