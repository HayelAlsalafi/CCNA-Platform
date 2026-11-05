import { createContext, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { arabic, type MessageKey } from './messages';
import {formatQuantity,quantities} from './quantities';
import {numericMessageKeys} from './validation-messages';

export type Locale = 'en' | 'ar';
export const languagePreferenceKey = 'ccna-nexus.language';
export function readLocale(): Locale {
  try { return globalThis.localStorage?.getItem(languagePreferenceKey) === 'ar' ? 'ar' : 'en'; }
  catch { return 'en'; }
}
// Exact-key lookup only. Never invoke this on stored learning content.
export function translate(locale: Locale, key: string, values: Record<string, string | number> = {}): string {
  const source = locale === 'ar' && Object.hasOwn(arabic, key) ? arabic[key as MessageKey] : key;
  return source.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : placeholder);
}
const numericMessages = numericMessageKeys.map(key => {
  const names:string[]=[];
  const source=key.split(/(\{\w+\})/g).map(part=>{
    if(/^\{\w+\}$/.test(part)){names.push(part.slice(1,-1));return '(\\d{1,10})';}
    return part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  }).join('');
  return {key,names,pattern:new RegExp('^'+source+'$')};
});
export function translateUiMessage(locale:Locale, text:string):string {
  if(locale==='en'||Object.hasOwn(arabic,text))return translate(locale,text);
  const retrySuffix=' Refresh before retrying; no success is assumed.';
  if(text.endsWith(retrySuffix)){
    const base=text.slice(0,-retrySuffix.length);
    return (base.startsWith('FAILED: ')?translate(locale,'FAILED:')+' '+translate(locale,base.slice(8)):translate(locale,base))+translate(locale,retrySuffix);
  }
  if(text.startsWith('FAILED: '))return translate(locale,'FAILED:')+' '+translate(locale,text.slice(8));
  if(text.length<=512)for(const {key,names,pattern} of numericMessages){
    const match=pattern.exec(text);
    if(match)return translate(locale,key,Object.fromEntries(names.map((name,i)=>[name,new Intl.NumberFormat(locale).format(Number(match[i+1]))])));
  }
  return text;
}
type Placeholders<S extends string> = S extends `${string}{${infer P}}${infer Rest}` ? P | Placeholders<Rest> : never;
export type Translate = <K extends MessageKey>(key: K, ...args: [Placeholders<K>] extends [never]
  ? [values?: Record<string, string | number>]
  : [values: Record<Placeholders<K>, string | number>]) => string;
function formatting(locale: Locale) {
  return {
    number: (value: number, options?: Intl.NumberFormatOptions) => new Intl.NumberFormat(locale, options).format(value),
    date: (value: string | number | Date, options?: Intl.DateTimeFormatOptions) => {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(locale, options).format(date);
    },
    plural: (count: number) => new Intl.PluralRules(locale).select(count),
    counted: (key:keyof typeof quantities,count:number) => formatQuantity(locale,key,count),
  };
}
function localeValue(locale: Locale, setLocale: (value: Locale) => void) {
  return { locale, dir: locale === 'ar' ? 'rtl' as const : 'ltr' as const, setLocale,
    t: ((key: string, values?: Record<string, string | number>) => translate(locale, key, values)) as Translate,
    // For known UI labels supplied by existing option maps/error helpers; unknown messages fall back verbatim.
    message: (key: string) => translateUiMessage(locale, key), ...formatting(locale) };
}
const LocaleContext = createContext(localeValue('en', () => {}));
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, updateLocale] = useState<Locale>(readLocale);
  const value = useMemo(() => localeValue(locale, (next) => {
    if (next !== 'en' && next !== 'ar') return;
    updateLocale(next);
    try { localStorage.setItem(languagePreferenceKey, next); } catch { /* Session preference remains usable. */ }
  }), [locale]);
  useLayoutEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = value.dir;
  }, [locale, value.dir]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
export function useI18n() { return useContext(LocaleContext); }
export function UiText({messageKey}: {messageKey: MessageKey}) {
  const {message} = useI18n();
  return <>{message(messageKey)}</>;
}
export function UiMessage({text}: {text: string}) {
  const {message} = useI18n();
  return <>{message(text)}</>;
}
export function DateText({value, options = {dateStyle:'medium',timeStyle:'short'}}: {value: string | number | Date; options?: Intl.DateTimeFormatOptions}) {
  const {date} = useI18n();
  return <>{date(value,options)}</>;
}
export function LanguageSelect() {
  const { locale, setLocale, t } = useI18n();
  return <label className="language-select"><span>{t('Language')}</span>
    <select aria-label={t('Language')} value={locale} onChange={e => setLocale(e.target.value as Locale)}>
      <option value="en" lang="en">English</option><option value="ar" lang="ar">العربية</option>
    </select>
  </label>;
}
export function TechnicalText({ children }: { children: ReactNode }) {
  return <bdi dir="ltr" className="technical-ltr">{children}</bdi>;
}
