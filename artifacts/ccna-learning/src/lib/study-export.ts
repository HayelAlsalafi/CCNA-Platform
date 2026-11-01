import { lessonRequest } from "@workspace/api-client-react";
export type ExportItem={id:string;kind:"NOTE"|"HIGHLIGHT"|"BOOKMARK";body:string;anchor:{blockId:string;quote:string}|null;color:string|null;category:string;createdAt:string;updatedAt:string;lessonId:string;revisionId:string;currentRevisionId:string;lessonTitle:string;chapterId:string;chapterTitle:string;domainName:string};
export type ExportScope={chapterId?:string;lessonId?:string;kinds:ExportItem["kind"][]};
export function safeSpreadsheetValue(value:unknown) {const text=String(value??"");return /^[\s\uFEFF]*[=+@\-\t\r]/.test(text)?"'"+text:text;}
export function studySource(item:ExportItem) {return `/learn/chapters/${item.chapterId}/lessons/${item.lessonId}${item.anchor?"#section-"+item.anchor.blockId:""}`;}
/** Uses only the authenticated owner-scoped API; bounded pagination, no lesson bodies. */
export async function collectStudyExport(scope:ExportScope,signal:AbortSignal) {
  const items:ExportItem[]=[];const seen=new Set<string>();let expected=-1;
  for(let page=1;page<=200;page++){
    const query=new URLSearchParams({page:String(page),pageSize:"50",sort:"created_asc",...(scope.chapterId?{chapterId:scope.chapterId}:{}),...(scope.lessonId?{lessonId:scope.lessonId}:{})});
    const result=await lessonRequest<{items:ExportItem[];total:number}>(`/api/study/workspace?${query}`,{signal});
    if(expected<0)expected=result.total;else if(result.total!==expected)throw Error("Study items changed during export. Retry for a consistent download.");
    for(const item of result.items){if(seen.has(item.id))throw Error("Study items changed during pagination. Retry export.");seen.add(item.id);if(scope.kinds.includes(item.kind))items.push(item);}
    if(page*50>=result.total) return items.sort((a,b)=>a.chapterTitle.localeCompare(b.chapterTitle)||a.lessonTitle.localeCompare(b.lessonTitle)||a.createdAt.localeCompare(b.createdAt));
    if(!result.items.length)throw Error("Export pagination stopped unexpectedly. No partial export was downloaded.");
  }
  throw Error("Export is limited to 10,000 items. Select one chapter or lesson.");
}
export async function buildStudyExport(items:ExportItem[],format:"xlsx"|"docx"|"pdf",font?:ArrayBuffer):Promise<Blob> {
  const exported=new Date().toISOString();
  if(format==="xlsx"){
    const {default:ExcelJS}=await import("exceljs");const workbook=new ExcelJS.Workbook();workbook.creator="CCNA NEXUS";
    const overview=workbook.addWorksheet("Overview");overview.addRows([["CCNA NEXUS — Private study materials"],["Exported UTC",exported],["Total items",items.length],["Scope","Only your saved notes, excerpts and bookmark references. Full lesson bodies are excluded."]]);
    for(const [kind,name] of [["NOTE","Notes"],["HIGHLIGHT","Highlights"],["BOOKMARK","Bookmarks"]] as const){
      const sheet=workbook.addWorksheet(name,{views:[{state:"frozen",ySplit:1}]});
      sheet.addRow(["Domain","Chapter","Lesson","Note / excerpt","Selected excerpt","Color","Category","Created UTC","Updated UTC","Source","Revision","Revision status"]);
      for(const item of items.filter(item=>item.kind===kind))sheet.addRow([item.domainName,item.chapterTitle,item.lessonTitle,item.body||item.anchor?.quote||"Bookmark",item.anchor?.quote??"",item.color??"",item.category,item.createdAt,item.updatedAt,studySource(item),item.revisionId,item.revisionId===item.currentRevisionId?"Current":"Older revision — excerpt preserved"].map(safeSpreadsheetValue));
      sheet.autoFilter={from:"A1",to:"L1"};sheet.columns.forEach((column,i)=>{column.width=[24,32,34,65,55,14,22,25,25,55,38,38][i];});
      sheet.eachRow((row,index)=>{row.alignment={vertical:"top",wrapText:true};if(index===1){row.font={bold:true,color:{argb:"FFFFFFFF"}};row.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF176E62"}};}});
    }
    return new Blob([new Uint8Array(await workbook.xlsx.writeBuffer())],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  }
  if(format==="docx"){
    const {Document,Packer,Paragraph,TextRun,HeadingLevel}=await import("docx");
    const children:InstanceType<typeof Paragraph>[]=[new Paragraph({text:"CCNA NEXUS — Private study materials",heading:HeadingLevel.TITLE}),new Paragraph({text:`Exported UTC: ${exported}`})];let group="";
    for(const item of items){const next=item.chapterId+item.lessonId;if(next!==group){group=next;children.push(new Paragraph({text:item.chapterTitle,heading:HeadingLevel.HEADING_1}),new Paragraph({text:item.lessonTitle,heading:HeadingLevel.HEADING_2}));}
      children.push(new Paragraph({children:[new TextRun({text:`${item.kind} · ${item.category} · ${item.updatedAt}`,bold:true})]}));
      for(const text of [item.body,item.anchor?.quote].filter(Boolean) as string[])children.push(new Paragraph({bidirectional:/[\u0600-\u06ff]/.test(text),children:[new TextRun({text,font:"Arial",rightToLeft:/[\u0600-\u06ff]/.test(text),...(item.kind==="HIGHLIGHT"?{highlight:(item.color==="pink"?"magenta":item.color??"yellow") as "yellow"|"green"|"blue"|"magenta"}:{})})]}));
      children.push(new Paragraph({text:`Source: ${studySource(item)} | Revision: ${item.revisionId}${item.revisionId!==item.currentRevisionId?" (older revision)":""}`,spacing:{after:240}}));
    }
    const document=new Document({styles:{default:{document:{run:{font:"Arial",size:22},paragraph:{spacing:{after:120}}}}},sections:[{children}]});
    return Packer.toBlob(document);
  }
  const {jsPDF}=await import("jspdf");const pdf=new jsPDF({unit:"pt",format:"a4",compress:true});
  const hasArabic=items.some(item=>/[\u0600-\u06ff]/.test(JSON.stringify(item)));
  if(hasArabic){
    const fontResponse=font?null:await fetch(`${import.meta.env.BASE_URL}fonts/Amiri-Regular.ttf`);
    if(fontResponse&&!fontResponse.ok)throw Error("Arabic PDF font could not load. Retry after checking the application assets.");
    const bytes=new Uint8Array(font??await fontResponse!.arrayBuffer());
    let binary="";for(let i=0;i<bytes.length;i++)binary+=String.fromCharCode(bytes[i]);
    pdf.addFileToVFS("Amiri.ttf",btoa(binary));pdf.addFont("Amiri.ttf","Amiri","normal");
  }
  let y=48;const width=pdf.internal.pageSize.getWidth(),height=pdf.internal.pageSize.getHeight();
  const text=(value:string,size=11)=>{
    const arabic=/[\u0600-\u06ff]/.test(value);pdf.setFont(arabic?"Amiri":"helvetica","normal");pdf.setFontSize(size);pdf.setR2L(false);
    // Bound even long unbroken technical identifiers before line wrapping.
    const lines=pdf.splitTextToSize(value,width-96) as string[];
    for(const line of lines){if(y+size*1.55>height-48){pdf.addPage();y=48;}pdf.text(line,arabic?width-48:48,y,{align:arabic?"right":"left"});y+=size*1.55;}y+=5;
  };
  text("CCNA NEXUS — Private study materials",18);text(`Exported UTC: ${exported}`,9);let group="";
  for(const item of items){const next=item.chapterId+item.lessonId;if(next!==group){group=next;text(item.chapterTitle,15);text(item.lessonTitle,13);}
    text(`${item.kind} | ${item.updatedAt}`,9);if(item.body)text(item.body);if(item.anchor?.quote)text(item.anchor.quote);text(`Source: ${studySource(item)}`,8);if(item.revisionId!==item.currentRevisionId)text("Older revision: this excerpt is not attached to current text.",9);y+=8;
  }
  pdf.setR2L(false);pdf.setFont("helvetica");pdf.setFontSize(9);
  for(let page=1;page<=pdf.getNumberOfPages();page++){pdf.setPage(page);pdf.text(`${page} / ${pdf.getNumberOfPages()}`,width/2,height-24,{align:"center"});}
  return pdf.output("blob");
}
export function downloadStudyExport(blob:Blob,format:string){const url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=`ccna-study-${new Date().toISOString().slice(0,10)}.${format}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
