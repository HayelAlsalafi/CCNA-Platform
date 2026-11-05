import {it,expect} from 'vitest';
import type {Translate} from './index';
// Compile-only misuse checks: every expected error must remain an actual error.
function translationTypeContract(t:Translate){
  t('Exam Simulator');t('Open account menu for {name}',{name:'Learner'});
  // @ts-expect-error Unknown key must be rejected.
  t('not.a.registered.key');
  // @ts-expect-error Required interpolation cannot be omitted.
  t('Open account menu for {name}');
  // @ts-expect-error The name parameter cannot be replaced by an unrelated field.
  t('Open account menu for {name}',{value:'Learner'});
}
it('keeps the compile-only translation contract available to TypeScript',()=>{expect(typeof translationTypeContract).toBe('function');});
