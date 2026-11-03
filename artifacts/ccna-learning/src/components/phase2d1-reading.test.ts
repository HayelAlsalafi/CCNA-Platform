import path from "node:path";
import {fileURLToPath} from "node:url";
// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { afterEach, expect, it } from "vitest";
const require=createRequire(import.meta.url);
const {parse}=require(require.resolve("postcss",{paths:[require.resolve("vite")]}));

afterEach(() => { document.head.innerHTML = ""; document.body.innerHTML = ""; });

it("removes the hidden navigation column in focus and restores it on exit", () => {
  const style = document.createElement("style");
  document.head.append(style);
  // Exercise the real unconditional desktop cascade. A nested media rule or
  // unsupported container block must not make jsdom discard the entire sheet.
  // Insert each top-level rule independently; do not invent layout declarations.
  for(const name of ["nexus.css","lessons.css","study.css","learning-workspace.css"]){
    const source=parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)),"..",name),"utf8"));
    for(const rule of source.nodes.filter((node:{type:string})=>node.type==="rule"))
      style.sheet!.insertRule(rule.toString(),style.sheet!.cssRules.length);
  }
  document.body.innerHTML = `<div class="nexus-app"><aside class="nexus-sidebar"></aside><div class="nexus-body"><div class="lesson-workspace"><div class="lesson-learning-layout"><nav class="learning-sidebar"></nav><main class="lesson-main-content"><article class="lesson-prose"></article><aside class="lesson-toc"><textarea>Unsaved note</textarea></aside></main></div></div></div></div>`;
  const workspace = document.querySelector(".lesson-workspace")!;
  const layout = document.querySelector(".lesson-learning-layout")!;
  const tools = document.querySelector(".lesson-toc")!;
  expect(getComputedStyle(layout).gridTemplateColumns).toBe("230px minmax(0, 1fr)");
  workspace.classList.add("lesson-focus-mode");
  expect(getComputedStyle(layout).gridTemplateColumns).toBe("minmax(0, 1fr)");
  expect(getComputedStyle(document.querySelector(".learning-sidebar")!).display).toBe("none");
  expect(getComputedStyle(tools).display).not.toBe("none");
  expect(getComputedStyle(document.querySelector(".nexus-sidebar")!).display).toBe("none");
  expect(getComputedStyle(document.querySelector(".nexus-body")!).marginLeft).toBe("0px");
  expect(getComputedStyle(document.querySelector(".lesson-prose")!).maxWidth).toBe("none");
  expect(getComputedStyle(workspace).maxWidth).toBe("none");
  expect(getComputedStyle(document.querySelector(".lesson-main-content")!).maxWidth).toBe("none");
  for (const [choice,expected] of [["wide","100ch"],["comfortable","80ch"],["full","110ch"]]) {
    (workspace as HTMLElement).dataset.focusWidth=choice;
    expect(getComputedStyle(workspace).getPropertyValue("--focus-prose-width").trim()).toBe(expected);
  }
  expect(getComputedStyle(document.querySelector(".lesson-main-content")!).width).toBe("100%");
  workspace.classList.remove("lesson-focus-mode");
  expect(getComputedStyle(layout).gridTemplateColumns).toBe("230px minmax(0, 1fr)");
  expect(getComputedStyle(document.querySelector(".nexus-body")!).marginLeft).toBe("258px");
  expect(getComputedStyle(document.querySelector(".nexus-sidebar")!).display).not.toBe("none");
  expect(document.querySelector("textarea")!.value).toBe("Unsaved note");
});
