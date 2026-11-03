import path from "node:path";
import {fileURLToPath} from "node:url";
// @vitest-environment jsdom
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { measureReadingPosition, useReadingPosition } from "../lib/reading-position";
import { revealActiveStudySection } from "./study-tools";
import { readFileSync } from "node:fs";

let root: Root | undefined;
afterEach(async()=>{if(root)await act(async()=>root!.unmount());root=undefined;document.body.innerHTML="";vi.unstubAllGlobals();});
const rect=(top:number,height:number)=>({top,bottom:top+height,height}) as DOMRect;
function articleFixture(nested=false) {
  document.body.innerHTML=`<div class="lesson-workspace"><div class="lesson-reading-tools"></div><article><section data-section-id="one"><h2>First</h2></section><section data-section-id="two"><h3>Second</h3></section></article></div>`;
  const workspace=document.querySelector<HTMLElement>(".lesson-workspace")!,article=workspace.querySelector("article")!,toolbar=workspace.querySelector<HTMLElement>(".lesson-reading-tools")!;
  if(nested){workspace.style.overflowY="auto";Object.defineProperties(workspace,{clientHeight:{value:500},scrollHeight:{value:2500}});workspace.getBoundingClientRect=()=>rect(100,500);}
  article.getBoundingClientRect=()=>rect(-500,2000);
  toolbar.getBoundingClientRect=()=>rect(nested?168:68,80);
  const sections=article.querySelectorAll<HTMLElement>("section");sections[0].getBoundingClientRect=()=>rect(-200,400);sections[1].getBoundingClientRect=()=>rect(nested?250:150,400);
  return {workspace,article,toolbar,sections};
}
it.each([false,true])("selects the heading under the sticky toolbar in window/nested scrolling (%s)",nested=>{
  const {article,toolbar}=articleFixture(nested);
  const covered=measureReadingPosition(article);expect(covered.headingId).toBe("two");
  toolbar.getBoundingClientRect=()=>rect(-300,80);
  const uncovered=measureReadingPosition(article);expect(uncovered.headingId).toBe("one");
  expect(covered.percent).toBe(uncovered.percent);expect(covered.blockId).toBe(uncovered.blockId);
});
it("scrolls only the overflowing outline pane and does not move an already visible item",()=>{
  document.body.innerHTML='<aside class="lesson-toc" style="overflow-y:auto"><div id="outline"><a aria-current="location" href="#section-one">First</a></div></aside>';
  const scroller=document.querySelector("aside")!,outline=document.querySelector<HTMLElement>("#outline")!,link=outline.querySelector("a")!;
  Object.defineProperties(scroller,{clientHeight:{value:200},scrollHeight:{value:1000}});scroller.getBoundingClientRect=()=>rect(100,200);
  link.getBoundingClientRect=()=>rect(350,30);revealActiveStudySection(outline);expect(scroller.scrollTop).toBe(88);
  link.getBoundingClientRect=()=>rect(150,30);revealActiveStudySection(outline);expect(scroller.scrollTop).toBe(88);
  link.getBoundingClientRect=()=>rect(70,30);revealActiveStudySection(outline);expect(scroller.scrollTop).toBe(50);
});
it("does not scroll the page when the outline has no internal overflow",()=>{
  document.body.innerHTML='<div id="outline"><a aria-current="location">First</a></div>';
  const scroll=vi.spyOn(window,"scrollBy").mockImplementation(()=>{});
  revealActiveStudySection(document.querySelector<HTMLElement>("#outline")!);expect(scroll).not.toHaveBeenCalled();scroll.mockRestore();
});
it("reuses one observer to update the toolbar inset and disconnects it on unmount",async()=>{
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
  let changed=()=>{};const observe=vi.fn(),disconnect=vi.fn();
  vi.stubGlobal("ResizeObserver",class{constructor(callback:()=>void){changed=callback;}observe=observe;disconnect=disconnect;});
  function Harness(){const ref=useRef<HTMLElement>(null);useReadingPosition(ref,"fixture","normal");return <div className="lesson-workspace"><div className="lesson-reading-tools" style={{top:68,position:"sticky"}}/><article ref={ref}><section data-section-id="one"><h2>Section</h2></section></article></div>;}
  const host=document.createElement("div");document.body.append(host);root=createRoot(host);await act(async()=>root!.render(<Harness/>));
  const workspace=host.querySelector<HTMLElement>(".lesson-workspace")!,toolbar=host.querySelector<HTMLElement>(".lesson-reading-tools")!;
  toolbar.getBoundingClientRect=()=>rect(68,80);await act(async()=>{changed();await new Promise(resolve=>setTimeout(resolve,35));});
  expect(workspace.style.getPropertyValue("--study-hub-top")).toBe("160px");expect(observe).toHaveBeenCalledWith(toolbar);
  toolbar.getBoundingClientRect=()=>rect(68,140);await act(async()=>{changed();await new Promise(resolve=>setTimeout(resolve,35));});
  expect(workspace.style.getPropertyValue("--study-hub-top")).toBe("220px");
  await act(async()=>root!.unmount());root=undefined;expect(disconnect).toHaveBeenCalledOnce();
});
it("limits sticky scrolling to the normal desktop column without nesting an outline scroller",()=>{
  const css=readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)),"../learning-workspace.css"),"utf8");
  const desktop=css.slice(css.indexOf("@container learning (min-width: 1200px)"),css.indexOf("@container learning (max-width: 1199px)"));
  expect(desktop).toContain(":not(.lesson-focus-mode)");expect(desktop).toContain("position: sticky");expect(desktop).toContain("top: var(--study-hub-top, 160px)");expect(desktop).toContain("align-self: start");expect(desktop).toContain("overflow-y: auto");expect(desktop).toContain("overflow: visible");
});

it("ignores an outer application scroller when there is no overflowing Hub pane",()=>{
 document.body.innerHTML='<main style="overflow-y:auto"><div id="outline"><a aria-current="location">First</a></div></main>';
 const page=document.querySelector("main")!;Object.defineProperties(page,{clientHeight:{value:200},scrollHeight:{value:1000}});page.getBoundingClientRect=()=>rect(0,200);document.querySelector("a")!.getBoundingClientRect=()=>rect(400,30);
 revealActiveStudySection(document.querySelector<HTMLElement>("#outline")!);expect(page.scrollTop).toBe(0);
});
