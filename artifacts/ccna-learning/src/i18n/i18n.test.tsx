// @vitest-environment jsdom
import {act, useState} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {arabic} from './messages';
import {formatQuantity,quantities} from './quantities';
import {LanguageSelect, LocaleProvider, TechnicalText, languagePreferenceKey, readLocale, translate, translateUiMessage, useI18n} from './index';
import {LessonContent} from '../components/lesson-content';
import {QuestionContent} from '../components/question-content';
import {validateTopicForm} from '../lib/topic-form';
import {validateStudioForm,newStudioForm} from '../lib/question-studio-form';
let host: HTMLDivElement, root:Root;
beforeEach(()=>{
  localStorage.clear(); document.documentElement.lang='en';document.documentElement.dir='ltr';
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();localStorage.clear();vi.restoreAllMocks();document.documentElement.dir='ltr';document.documentElement.lang='en';});
function Probe(){
  const {t, locale, number, date, plural}=useI18n();const [answer,setAnswer]=useState('');
  return <><LanguageSelect/><h1>{t('Exam Simulator')}</h1>
    <input aria-label="session fixture" value={answer} onChange={e=>setAnswer(e.target.value)}/>
    <output>{number(1234)}|{date('2026-11-03T00:00:00Z',{timeZone:'UTC',year:'numeric'})}|{plural(2)}|{locale}</output>
    <TechnicalText>show ip route 192.0.2.1/24</TechnicalText></>;
}
async function render(){await act(async()=>root.render(<LocaleProvider><Probe/></LocaleProvider>));}
async function change(value:string){await act(async()=>{const el=host.querySelector('select')!;el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));});}
it('defaults to English and changes lang/dir and visible language reversibly',async()=>{
  await render();expect(readLocale()).toBe('en');expect(host.querySelector('h1')?.textContent).toBe('Exam Simulator');
  await change('ar');expect(document.documentElement.lang).toBe('ar');expect(document.documentElement.dir).toBe('rtl');expect(host.querySelector('h1')?.textContent).toBe('محاكي الاختبار');
  await change('en');expect(document.documentElement.dir).toBe('ltr');expect(document.documentElement.lang).toBe('en');
});
it('retains DOM identity and route rather than remounting session children',async()=>{
  history.replaceState({},'', '/exam?session=fixture&question=2');await render();const input=host.querySelector('input');
  await change('ar');expect(host.querySelector('input')).toBe(input);expect(location.pathname+location.search).toBe('/exam?session=fixture&question=2');
});
it('persists the preference across a provider remount',async()=>{
  await render();await change('ar');expect(localStorage.getItem(languagePreferenceKey)).toBe('ar');
  await act(async()=>root.unmount());root=createRoot(host);await render();expect(document.documentElement.dir).toBe('rtl');expect(host.querySelector('select')?.value).toBe('ar');
});
it('rejects unsupported saved language values',()=>{localStorage.setItem(languagePreferenceKey,'fr');expect(readLocale()).toBe('en');});
it('works session-locally when browser storage is denied',async()=>{
  vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('denied');});
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('denied');});
  await render();await change('ar');expect(host.querySelector('h1')?.textContent).toBe('محاكي الاختبار');
});
it('falls back to the source message for missing and inherited keys',()=>{
  expect(translate('ar','Unknown message')).toBe('Unknown message');expect(translate('ar','toString')).toBe('toString');
  expect(translate('en','Exam Simulator')).toBe('Exam Simulator');
});
it('interpolates once, preserving literal values without evaluating markup or replacement syntax',()=>{
  expect(translate('ar','Open account menu for {name}',{name:'<script>$&{name}</script>'})).toBe('فتح قائمة حساب <script>$&{name}</script>');
  expect(translate('en','{missing}')).toBe('{missing}');
});
it('has a nonempty Arabic value and identical placeholders for every registered English key',()=>{
  const placeholders=(s:string)=>[...s.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort();
  for(const [key,value] of Object.entries(arabic)){
    expect(value.trim(),key).not.toBe('');expect(value,key).not.toMatch(/\?{2,}|\uFFFD/);expect(placeholders(value),key).toEqual(placeholders(key));
  }
});
it('formats numbers, dates and plural categories with the active locale',async()=>{
  await render();await change('ar');const output=host.querySelector('output')!.textContent!;
  expect(output).toContain(new Intl.NumberFormat('ar').format(1234));expect(output).toContain('|two|ar');
});
it('isolates technical text in LTR inside Arabic UI',async()=>{
  await render();await change('ar');const technical=host.querySelector('bdi');expect(technical?.getAttribute('dir')).toBe('ltr');expect(technical?.textContent).toBe('show ip route 192.0.2.1/24');
});
it('uses all Arabic quantity categories and English singular/plural without losing the count',()=>{
  expect(formatQuantity('ar','questions',0)).toBe('لا أسئلة');
  expect(formatQuantity('ar','questions',1)).toBe('سؤال واحد');
  expect(formatQuantity('ar','questions',2)).toBe('سؤالان');
  const n=(value:number)=>new Intl.NumberFormat('ar').format(value);
  expect(formatQuantity('ar','questions',3)).toBe(`${n(3)} أسئلة`);
  expect(formatQuantity('ar','questions',11)).toBe(`${n(11)} سؤالًا`);
  expect(formatQuantity('ar','questions',100)).toBe(`${n(100)} سؤال`);
  expect(formatQuantity('en','questions',1)).toBe('1 question');expect(formatQuantity('en','questions',2)).toBe('2 questions');
  for(const value of Object.values(quantities))expect(Object.keys(value.ar).sort()).toEqual(['few','many','one','other','two','zero']);
});
it('localizes owned notifications and numeric templates while preserving unknown external messages',()=>{
  expect(translateUiMessage('ar','Chapter saved.')).toBe('حُفظ الفصل.');
  expect(translateUiMessage('ar','Downloaded 12 study items.')).toBe(`نُزّلت ${new Intl.NumberFormat('ar').format(12)} من المواد الدراسية.`);
  expect(translateUiMessage('en','Downloaded 12 study items.')).toBe('Downloaded 12 study items.');
  const unknown='External service: resource 192.0.2.1 not found';
  expect(translateUiMessage('ar',unknown)).toBe(unknown);
  expect(translateUiMessage('ar','FAILED: '+unknown)).toBe('تعذر: '+unknown);
  expect(translateUiMessage('ar','FAILED: '+unknown+' Refresh before retrying; no success is assumed.')).toBe('تعذر: '+unknown+' حدّث الصفحة قبل المحاولة مجددًا؛ لا يُفترض النجاح.');
  expect(translateUiMessage('ar','Downloaded <img> study items.')).toBe('Downloaded <img> study items.');
});
it('covers actual validation messages without changing validators or their English values',()=>{
  const errors=validateTopicForm({name:'',slug:'!',description:'x'.repeat(2001),displayOrder:'-1',status:'DISABLED'});
  expect(errors.name).toBe('Enter a name of 1–180 characters.');
  const form=newStudioForm();form.text='';form.options[0].text='';
  const questionErrors=validateStudioForm(form,true);
  for(const text of [...Object.values(errors),...Object.values(questionErrors)]){
    expect(translateUiMessage('ar',text),text).not.toBe(text);
    expect(translateUiMessage('en',text)).toBe(text);
  }
});
it('never translates stored content even when it exactly matches a UI key',async()=>{
  await act(async()=>root.render(<LocaleProvider><LanguageSelect/><LessonContent blocks={[{id:'paragraph-1',type:'paragraph',text:'Save'}]}/><QuestionContent text={'Question\n```ios\nshow ip route 192.0.2.1\n```'}/></LocaleProvider>));
  const before=host.querySelector('.lesson-block')!.textContent;
  await change('ar');expect(host.querySelector('.lesson-block')!.textContent).toBe(before);expect(before).toBe('Save');
  expect(host.querySelector('.question-content')!.textContent).toContain('Question');
  expect(host.querySelector('code')!.textContent).toBe('show ip route 192.0.2.1\n');
  expect(host.querySelector('.lesson-block')!.getAttribute('dir')).toBe('auto');
});
