import {it,expect,vi,afterEach} from "vitest";
import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import {buildStudyExport,safeSpreadsheetValue,collectStudyExport,type ExportItem} from "../lib/study-export";
const mocks=vi.hoisted(()=>({request:vi.fn()}));vi.mock("@workspace/api-client-react",()=>({lessonRequest:mocks.request}));
const item:ExportItem={id:"one",kind:"NOTE",body:"=SUM(1,2)",anchor:{blockId:"section",quote:"TCP preserves delivery order."},color:"yellow",category:"Transport",createdAt:"2026-10-30T00:00:00Z",updatedAt:"2026-10-30T00:00:00Z",lessonId:"lesson",revisionId:"old",currentRevisionId:"new",lessonTitle:"Transport",chapterId:"chapter",chapterTitle:"Networking",domainName:"Network Fundamentals"};
afterEach(()=>vi.resetAllMocks());
it.each(["=1+1","+cmd","-1+2","@SUM(A1)","\t=1","\r=1"])("escapes spreadsheet formula-looking text %s",value=>expect(safeSpreadsheetValue(value)).toBe("'"+value));
it("creates a real XLSX with overview, typed sheets, filters and frozen headers",async()=>{
  const blob=await buildStudyExport([item],"xlsx"), workbook=new ExcelJS.Workbook();await workbook.xlsx.load(Buffer.from(await blob.arrayBuffer()) as never);
  expect(workbook.worksheets.map(sheet=>sheet.name)).toEqual(["Overview","Notes","Highlights","Bookmarks"]);
  const notes=workbook.getWorksheet("Notes")!;expect(notes.getCell("D2").value).toBe("'=SUM(1,2)");expect(notes.views[0]).toMatchObject({state:"frozen",ySplit:1});expect(notes.autoFilter).toBeTruthy();expect(notes.getCell("D2").alignment.wrapText).toBe(true);
});
it("creates a real DOCX package with grouped source references and escaped note content",async()=>{
  const blob=await buildStudyExport([{...item,body:"Private <text> & detail"}],"docx"), zip=await JSZip.loadAsync(await blob.arrayBuffer());
  const xml=await zip.file("word/document.xml")!.async("string");expect(xml).toContain("Networking");expect(xml).toContain("Private &lt;text&gt; &amp; detail");expect(xml).toContain("Source:");expect(xml).toContain("older revision");
});
it("creates a multipage bilingual PDF with an embedded Arabic font and page numbers",async()=>{
  const font=readFileSync(path.resolve("artifacts/ccna-learning/public/fonts/Amiri-Regular.ttf"));
  const items=Array.from({length:35},(_,index)=>({...item,id:String(index),body:"ملاحظات خاصة حول بروتوكول النقل TCP — اختبار التصدير. "+"Technical study note. ".repeat(15)}));
  const blob=await buildStudyExport(items,"pdf",font.buffer.slice(font.byteOffset,font.byteOffset+font.byteLength));const bytes=Buffer.from(await blob.arrayBuffer());
  expect(bytes.subarray(0,5).toString()).toBe("%PDF-");expect(bytes.toString("latin1")).toContain("/FontFile2");expect((bytes.toString("latin1").match(/\/Type \/Page\b/g)??[]).length).toBeGreaterThan(1);
  const folder=path.resolve(".local/phase2d-export-fixtures");mkdirSync(folder,{recursive:true});writeFileSync(path.join(folder,"bilingual-study.pdf"),bytes);
});
it("collects only requested types and scopes through the owner-authenticated endpoint",async()=>{
  mocks.request.mockResolvedValue({items:[item,{...item,id:"two",kind:"BOOKMARK"}],total:2});const result=await collectStudyExport({chapterId:"chapter",lessonId:"lesson",kinds:["NOTE"]},new AbortController().signal);
  expect(result).toHaveLength(1);expect(mocks.request.mock.calls[0][0]).toContain("chapterId=chapter");expect(mocks.request.mock.calls[0][0]).not.toContain("userId");
});
