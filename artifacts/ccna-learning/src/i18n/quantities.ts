import type {Locale} from './index';
type Forms = Record<Intl.LDMLPluralRule,string>;
export const quantities = {
  questions: {
    en:{one:'{count} question',other:'{count} questions'},
    ar:{zero:'لا أسئلة',one:'سؤال واحد',two:'سؤالان',few:'{count} أسئلة',many:'{count} سؤالًا',other:'{count} سؤال'},
  },
  lessons: {
    en:{one:'{count} lesson',other:'{count} lessons'},
    ar:{zero:'لا دروس',one:'درس واحد',two:'درسان',few:'{count} دروس',many:'{count} درسًا',other:'{count} درس'},
  },
  items: {
    en:{one:'{count} item',other:'{count} items'},
    ar:{zero:'لا مواد',one:'مادة واحدة',two:'مادتان',few:'{count} مواد',many:'{count} مادة',other:'{count} مادة'},
  },
} as const satisfies Record<string,{en:Pick<Forms,'one'|'other'>;ar:Forms}>;
export function formatQuantity(locale:Locale, key:keyof typeof quantities, count:number) {
  const category=new Intl.PluralRules(locale).select(count);
  const forms=quantities[key][locale] as Partial<Forms> & {other:string};
  return (forms[category]??forms.other).replace('{count}',new Intl.NumberFormat(locale).format(count));
}
